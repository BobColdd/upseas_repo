-- Run once on your EXISTING database:  psql -d coldschool -f remove_usernames.sql
-- Removes usernames. Students get an ID (STD/001, STD/002, ...) in the order they were created.
-- Login is by email only. Admin accounts have no student ID.
\set ON_ERROR_STOP on
BEGIN;

DROP FUNCTION IF EXISTS authenticate(text, text);   -- also removes the older version that took a username
DROP FUNCTION IF EXISTS create_student(text, text, text, text, numeric, uuid);

ALTER TABLE users ADD COLUMN IF NOT EXISTS student_code text;

-- number the students that have no ID yet, continuing after the highest existing one
WITH base AS (
  SELECT COALESCE(max(substring(student_code FROM 5)::int), 0) AS m FROM users WHERE student_code IS NOT NULL
), n AS (
  SELECT id, row_number() OVER (ORDER BY created_at, id) AS rn FROM users WHERE role = 'student' AND student_code IS NULL
)
UPDATE users u SET student_code = 'STD/' || lpad((n.rn + base.m)::text, 3, '0')
FROM n, base WHERE u.id = n.id;

CREATE UNIQUE INDEX IF NOT EXISTS users_student_code_key ON users (student_code);
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_code_format;
ALTER TABLE users ADD CONSTRAINT users_code_format CHECK (student_code IS NULL OR student_code ~ '^STD/[0-9]{3,}$');
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_student_has_code;
ALTER TABLE users ADD CONSTRAINT users_student_has_code CHECK (role <> 'student' OR student_code IS NOT NULL);

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_username_format;
ALTER TABLE users DROP COLUMN IF EXISTS username;

CREATE OR REPLACE FUNCTION create_student(
  p_email       text,
  p_full_name   text,
  p_password    text,
  p_target_band numeric DEFAULT NULL,
  p_created_by  uuid    DEFAULT NULL
) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE new_id uuid; next_n int; code text;
BEGIN
  IF p_password IS NULL OR length(p_password) < 8 THEN
    RAISE EXCEPTION 'password must be at least 8 characters' USING ERRCODE = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(727001);
  SELECT COALESCE(max(substring(student_code FROM 5)::int), 0) + 1 INTO next_n
    FROM users WHERE student_code IS NOT NULL;
  code := 'STD/' || lpad(next_n::text, 3, '0');
  INSERT INTO users (student_code, email, full_name, password_hash, role, target_band, created_by)
  VALUES (code, btrim(p_email), btrim(p_full_name),
          crypt(p_password, gen_salt('bf', 12)), 'student', p_target_band, p_created_by)
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;

CREATE OR REPLACE FUNCTION authenticate(p_login text, p_password text)
RETURNS TABLE (id uuid, student_code text, email citext, full_name text, role user_role)
LANGUAGE sql STABLE AS $$
  SELECT u.id, u.student_code, u.email, u.full_name, u.role
  FROM users u
  WHERE u.is_active
    AND (u.email = btrim(p_login)::citext OR u.student_code = btrim(p_login))
    AND u.password_hash = crypt(p_password, u.password_hash);
$$;

COMMIT;
