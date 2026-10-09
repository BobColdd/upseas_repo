-- Run once on your existing database:  psql -d coldschool -f marking.sql
\set ON_ERROR_STOP on
BEGIN;
-- ---------------------------------------------------------------- marks
-- One row per marked submission.
--   Reading / Listening: marked automatically on submit (marked_by NULL); score/total + band; details = per-question result.
--   Writing: marked by the tutor (marked_by = admin); band is worked out from the 4 criteria; score/total are NULL.
-- A student only sees a row once released = true (automatic marks are released straight away).
CREATE TABLE IF NOT EXISTS submission_marks (
  student_id  uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_ref    text        NOT NULL,
  skill       text        NOT NULL,
  score       int,
  total       int,
  band        numeric(2,1) CHECK (band IS NULL OR band BETWEEN 0 AND 9),
  details     jsonb       NOT NULL DEFAULT '{}'::jsonb,
  released    boolean     NOT NULL DEFAULT false,
  marked_by   uuid        REFERENCES users(id) ON DELETE SET NULL,
  marked_at   timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (student_id, task_ref)
);
COMMIT;
