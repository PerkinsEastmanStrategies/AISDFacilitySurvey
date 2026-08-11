-- Admin interview / meeting notes (one row per school)
-- Maps to components/admin-meeting-notes.tsx

create table interview_notes (
  id uuid primary key default gen_random_uuid(),

  school text not null,
  assessors text not null default '',
  school_leader_participant text not null default '',
  meeting_date date not null default current_date,

  -- Subject category -> note body (General, General FCA, ESA headers, etc.)
  subject_notes jsonb not null default '{}'::jsonb,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint interview_notes_school_unique unique (school)
);

create index interview_notes_school_idx on interview_notes (school);
create index interview_notes_meeting_date_idx on interview_notes (meeting_date desc);

comment on table interview_notes is
  'Admin meeting notes captured during school leader review sessions.';

comment on column interview_notes.subject_notes is
  'JSON object keyed by subject category with note body text values.';

create trigger interview_notes_updated_at
  before update on interview_notes
  for each row
  execute function set_updated_at();

alter table interview_notes enable row level security;

-- Accessed only through admin API routes using the Supabase service role key.
