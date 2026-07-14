-- Raise question_id ceiling for principal FCA (54–60+) and future questions.
-- Safe to re-run: drops old checks by name (Postgres default) then recreates.

alter table question_responses
  drop constraint if exists question_responses_question_id_check;

alter table question_responses
  add constraint question_responses_question_id_check
  check (question_id between 1 and 200);

alter table annotations
  drop constraint if exists annotations_question_id_check;

alter table annotations
  add constraint annotations_question_id_check
  check (question_id between 1 and 200);

comment on column question_responses.rating is
  '1–5 scored; 0 unanswered; -1 = I don''t know; -2 = N/A (excluded from scoring)';

comment on column question_responses.question_id is
  'Survey question id from app (1–200). Upper bound is loose to avoid frequent migrations.';

comment on column annotations.question_id is
  'Survey question id from app (1–200). Upper bound is loose to avoid frequent migrations.';
