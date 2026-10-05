-- Run once on your existing database:  psql -d coldschool -f submission_status.sql
-- NOTE: drops the earlier 'submissions' table (answers now go to R2), so any test answers in it are lost.
\set ON_ERROR_STOP on
BEGIN;
DROP TABLE IF EXISTS submissions;
-- ---------------------------------------------------------------- submission status
-- Only the YES/NO flag lives here. The answers themselves are JSON files in R2:
--   submissions/<student-id>/<task-id>.json
-- task_ref is the task id from data/admin-data.json (e.g. t1001). A missing row means 'NO'.
CREATE TABLE IF NOT EXISTS submission_status (
  student_id    uuid        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_ref      text        NOT NULL,
  status        text        NOT NULL DEFAULT 'NO' CHECK (status IN ('YES', 'NO')),
  r2_key        text,
  submitted_at  timestamptz,
  PRIMARY KEY (student_id, task_ref)
);
COMMIT;
