-- Free-text job title collected after role selection on the intro form.
alter table survey_submissions
  add column if not exists position_title text;

comment on column survey_submissions.position_title is
  'Maps to SurveyData.positionTitle (e.g. Principal, Assistant Principal, Facility Manager).';
