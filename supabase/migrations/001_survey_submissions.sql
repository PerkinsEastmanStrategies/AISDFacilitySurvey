-- AISD Principal Survey — submission storage
-- Run in Supabase SQL Editor or via `supabase db push`
--
-- Maps to lib/survey-data.ts:
--   SurveyData, QuestionResponse, Annotation, SpaceRoomEntry

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
create type survey_role as enum ('school_leader', 'operations');

create type annotation_type as enum ('pin', 'circle', 'freeform');

create type annotation_view as enum ('floorplan', 'map');

create type annotation_classification as enum ('strength', 'weakness');

create type submission_status as enum ('draft', 'submitted', 'archived');

-- ---------------------------------------------------------------------------
-- Parent submission (one row per principal/operations assessment)
-- ---------------------------------------------------------------------------
create table survey_submissions (
  id uuid primary key default gen_random_uuid(),

  -- Intro / respondent
  school text not null,
  role survey_role not null,
  respondent_name text not null,
  email text not null,
  school_description text,
  unique_features text,
  community_partners text, -- specialEducation in the app

  status submission_status not null default 'submitted',
  submitted_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  -- Pre-computed report metrics (populated at submit time for fast dashboards)
  -- Example: { "overallAvgScore": 3.8, "strengthCount": 12, "weaknessCount": 7,
  --            "topQuestions": [...], "bottomQuestions": [...] }
  report_summary jsonb,

  -- Optional: full raw payload for audit / easy re-import (exclude svgContent)
  raw_payload jsonb,

  -- Optional archival snapshot (see notes in README below)
  report_html text,
  report_html_generated_at timestamptz,

  constraint survey_submissions_email_check
    check (email ~* '^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$')
);

create index survey_submissions_school_idx on survey_submissions (school);
create index survey_submissions_submitted_at_idx on survey_submissions (submitted_at desc);
create index survey_submissions_email_idx on survey_submissions (email);

comment on column survey_submissions.community_partners is
  'Maps to SurveyData.specialEducation (community partner / special ed notes).';

comment on column survey_submissions.report_summary is
  'Cached aggregates for executive summary tab; recomputable from child tables.';

comment on column survey_submissions.raw_payload is
  'Optional JSON snapshot of SurveyData minus svgContent for backup/debugging.';

comment on column survey_submissions.report_html is
  'Optional static HTML snapshot at submit time. Not the source of truth.';

-- ---------------------------------------------------------------------------
-- Question answers (ESA + FCA ratings, text, ranking)
-- question_id upper bound is intentionally loose (1–200) so new survey
-- questions can ship without a DB migration each time.
-- ---------------------------------------------------------------------------
create table question_responses (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references survey_submissions (id) on delete cascade,

  question_id smallint not null check (question_id between 1 and 200),

  -- rating: 1–5 scored; 0 = unanswered/text-only;
  --         -1 = FCA "I don't know"; -2 = FCA "N/A" (both excluded from scoring)
  rating smallint not null default 0,

  explanation text not null default '',

  -- Q17 prioritization only
  ranking text[] default null,

  created_at timestamptz not null default now(),

  unique (submission_id, question_id)
);

create index question_responses_submission_idx on question_responses (submission_id);
create index question_responses_question_idx on question_responses (question_id);

-- ---------------------------------------------------------------------------
-- Spatial annotations (floor plan pins/shapes + site map pins/shapes)
-- ---------------------------------------------------------------------------
create table annotations (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references survey_submissions (id) on delete cascade,

  -- Client-generated id preserved for traceability (annotation-1730...-abc)
  client_id text,

  question_id smallint not null check (question_id between 1 and 200),

  type annotation_type not null,
  view annotation_view not null default 'floorplan',
  classification annotation_classification not null,

  -- Coordinates: SVG units on floorplan; lng/lat on map
  x double precision not null,
  y double precision not null,
  radius double precision,

  -- Freeform vertices: [{ "x": ..., "y": ... }, ...]
  points jsonb,

  comment text not null default '',
  color text not null default '',

  -- Floor plan only
  floor_key text, -- e.g. floor-1, floor-2, basement
  room_key text,
  room_label text,

  -- Circle / freeform on floor plan: [{ "roomKey": "204", "roomLabel": "..." }]
  rooms_in_shape jsonb,

  created_at timestamptz not null default now()
);

create index annotations_submission_idx on annotations (submission_id);
create index annotations_question_idx on annotations (submission_id, question_id);
create index annotations_view_idx on annotations (submission_id, view);
create index annotations_floor_idx on annotations (submission_id, floor_key)
  where floor_key is not null;

-- ---------------------------------------------------------------------------
-- Program space assignments (Q18 — Maker Space, Group Rooms, etc.)
-- Flattened: one row per room per program space
-- ---------------------------------------------------------------------------
create table space_assignment_rooms (
  id uuid primary key default gen_random_uuid(),
  submission_id uuid not null references survey_submissions (id) on delete cascade,

  program_space text not null, -- key from PROGRAM_SPACES in spaces-data.ts
  room_key text not null,
  room_label text,

  -- SVG centroid for label placement
  x double precision not null,
  y double precision not null,

  -- Recommended: add floor_key in the app when placing rooms on multi-floor schools
  floor_key text,

  created_at timestamptz not null default now(),

  unique (submission_id, program_space, room_key, floor_key)
);

create index space_assignment_rooms_submission_idx
  on space_assignment_rooms (submission_id);

create index space_assignment_rooms_program_idx
  on space_assignment_rooms (submission_id, program_space);

-- ---------------------------------------------------------------------------
-- updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger survey_submissions_updated_at
  before update on survey_submissions
  for each row
  execute function set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security (adjust to your auth model)
-- ---------------------------------------------------------------------------
alter table survey_submissions enable row level security;
alter table question_responses enable row level security;
alter table annotations enable row level security;
alter table space_assignment_rooms enable row level security;

-- Anonymous insert-only for public survey (no read-back without auth)
-- Replace with authenticated policies if principals log in later.

create policy "Allow anonymous insert on survey_submissions"
  on survey_submissions for insert
  to anon
  with check (true);

create policy "Allow anonymous insert on question_responses"
  on question_responses for insert
  to anon
  with check (
    exists (
      select 1 from survey_submissions s
      where s.id = submission_id
    )
  );

create policy "Allow anonymous insert on annotations"
  on annotations for insert
  to anon
  with check (
    exists (
      select 1 from survey_submissions s
      where s.id = submission_id
    )
  );

create policy "Allow anonymous insert on space_assignment_rooms"
  on space_assignment_rooms for insert
  to anon
  with check (
    exists (
      select 1 from survey_submissions s
      where s.id = submission_id
    )
  );

-- Admin/service role reads everything (use service_role key server-side)
-- Example authenticated read policy for district staff:
--
-- create policy "Staff can read all submissions"
--   on survey_submissions for select
--   to authenticated
--   using (auth.jwt() ->> 'role' = 'district_admin');

-- ---------------------------------------------------------------------------
-- Convenience view: submission with counts
-- ---------------------------------------------------------------------------
create or replace view survey_submission_overview as
select
  s.id,
  s.school,
  s.role,
  s.respondent_name,
  s.email,
  s.status,
  s.submitted_at,
  s.report_summary,
  count(distinct qr.id) filter (where qr.rating <> 0 or qr.explanation <> '') as answered_questions,
  count(distinct a.id) as annotation_count,
  count(distinct a.id) filter (where a.classification = 'strength') as strength_count,
  count(distinct a.id) filter (where a.classification = 'weakness') as weakness_count,
  count(distinct sar.id) as space_assignment_room_count
from survey_submissions s
left join question_responses qr on qr.submission_id = s.id
left join annotations a on a.submission_id = s.id
left join space_assignment_rooms sar on sar.submission_id = s.id
group by s.id;
