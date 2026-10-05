-- =====================================================================
-- cold-school / UPSEAS CONSULTANCY  -  PostgreSQL schema (run once)
--
--   createdb coldschool
--   psql -d coldschool -v admin_email='admin@upseas.test' \
--        -v admin_password='CHANGE_ME_NOW' -f schema.sql
--
-- Safe to re-run: everything uses IF NOT EXISTS / ON CONFLICT.
-- Passwords are never stored in plain text (bcrypt via pgcrypto).
-- =====================================================================

\set ON_ERROR_STOP on
BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;   -- bcrypt hashing, gen_random_uuid()
CREATE EXTENSION IF NOT EXISTS citext;     -- case-insensitive email/username

-- ---------------------------------------------------------------- enums
DO $$ BEGIN
  CREATE TYPE user_role AS ENUM ('admin', 'student');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE skill AS ENUM ('reading', 'listening', 'writing', 'speaking');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ---------------------------------------------------------------- users
CREATE TABLE IF NOT EXISTS users (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username       citext      NOT NULL UNIQUE,
  email          citext      NOT NULL UNIQUE,
  full_name      text        NOT NULL,
  password_hash  text        NOT NULL,
  role           user_role   NOT NULL DEFAULT 'student',
  target_band    numeric(2,1),                       -- IELTS target, 4.0 - 9.0
  is_active      boolean     NOT NULL DEFAULT true,
  created_by     uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT users_username_format CHECK (username ~ '^[A-Za-z0-9._-]{3,32}$'),
  CONSTRAINT users_email_format    CHECK (email ~ '^\S+@\S+\.\S+$'),
  CONSTRAINT users_name_not_blank  CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT users_target_range    CHECK (target_band IS NULL OR (target_band BETWEEN 4 AND 9))
);

-- ---------------------------------------------------------------- tasks & mocks
-- "file" is the storage key of the content JSON (R2 bucket or local content/ folder).
CREATE TABLE IF NOT EXISTS tasks (
  id          bigserial PRIMARY KEY,
  title       text        NOT NULL,
  skill       skill       NOT NULL,
  due         date,
  note        text        NOT NULL DEFAULT '',
  file        text        NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS mocks (
  id          bigserial PRIMARY KEY,
  title       text        NOT NULL,
  skill       skill,                                  -- NULL = full mock (all skills)
  date        date,
  note        text        NOT NULL DEFAULT '',
  file        text        NOT NULL,
  created_by  uuid REFERENCES users(id) ON DELETE SET NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

-- who is assigned what
CREATE TABLE IF NOT EXISTS task_assignments (
  task_id     bigint NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  student_id  uuid   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (task_id, student_id)
);

CREATE TABLE IF NOT EXISTS mock_assignments (
  mock_id     bigint NOT NULL REFERENCES mocks(id) ON DELETE CASCADE,
  student_id  uuid   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  assigned_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (mock_id, student_id)
);

-- ---------------------------------------------------------------- results
-- One row per submission. Exactly one of task_id / mock_id is set.
-- band   : single-skill result (tasks)
-- bands  : per-skill map for mocks, e.g. {"reading":6.5,"listening":7}
CREATE TABLE IF NOT EXISTS results (
  id            bigserial PRIMARY KEY,
  student_id    uuid   NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  task_id       bigint REFERENCES tasks(id) ON DELETE CASCADE,
  mock_id       bigint REFERENCES mocks(id) ON DELETE CASCADE,
  skill         skill,
  band          numeric(2,1) CHECK (band    IS NULL OR band    BETWEEN 0 AND 9),
  bands         jsonb,
  overall       numeric(2,1) CHECK (overall IS NULL OR overall BETWEEN 0 AND 9),
  audio_key     text,                                 -- speaking recording
  answer_text   text,                                 -- writing submission
  submitted_at  timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT results_one_target CHECK ((task_id IS NOT NULL) <> (mock_id IS NOT NULL))
);

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

-- ---------------------------------------------------------------- indexes
CREATE INDEX IF NOT EXISTS idx_users_role         ON users(role);
CREATE INDEX IF NOT EXISTS idx_task_assign_student ON task_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_mock_assign_student ON mock_assignments(student_id);
CREATE INDEX IF NOT EXISTS idx_results_student     ON results(student_id, submitted_at DESC);

-- ---------------------------------------------------------------- updated_at trigger
CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN NEW.updated_at := now(); RETURN NEW; END $$;

DROP TRIGGER IF EXISTS trg_users_touch ON users;
CREATE TRIGGER trg_users_touch BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------------------------------------------------------------- functions the app calls
-- Admin creates a student: username, email, full name AND the password they choose.
CREATE OR REPLACE FUNCTION create_student(
  p_username    text,
  p_email       text,
  p_full_name   text,
  p_password    text,
  p_target_band numeric DEFAULT NULL,
  p_created_by  uuid    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE new_id uuid;
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters' USING ERRCODE = '22023';
  END IF;
  INSERT INTO users (username, email, full_name, password_hash, role, target_band, created_by)
  VALUES (btrim(p_username), btrim(p_email), btrim(p_full_name),
          crypt(p_password, gen_salt('bf', 12)), 'student', p_target_band, p_created_by)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

-- Login by email OR username. Returns the user row only when the password matches.
CREATE OR REPLACE FUNCTION authenticate(p_login text, p_password text)
RETURNS TABLE (id uuid, username citext, email citext, full_name text, role user_role)
LANGUAGE sql STABLE AS $$
  SELECT u.id, u.username, u.email, u.full_name, u.role
  FROM users u
  WHERE u.is_active
    AND (u.email = btrim(p_login)::citext OR u.username = btrim(p_login)::citext)
    AND u.password_hash = crypt(p_password, u.password_hash);
$$;

-- Admin resets a student's password.
CREATE OR REPLACE FUNCTION set_password(p_user uuid, p_password text) RETURNS void
LANGUAGE plpgsql AS $$
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters' USING ERRCODE = '22023';
  END IF;
  UPDATE users SET password_hash = crypt(p_password, gen_salt('bf', 12)) WHERE id = p_user;
END $$;

-- ---------------------------------------------------------------- first admin
INSERT INTO users (username, email, full_name, password_hash, role)
VALUES ('admin', :'admin_email', 'Administrator',
        crypt(:'admin_password', gen_salt('bf', 12)), 'admin')
ON CONFLICT (email) DO NOTHING;

COMMIT;
