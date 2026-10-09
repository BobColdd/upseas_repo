-- Run once if you ALREADY ran the earlier remove_usernames.sql (IDs looked like "STD 001").
--   psql -d coldschool -f student_id_format.sql
-- Changes the IDs to STD/001 and lets students log in with their ID as well as their email.
-- (If you have not run remove_usernames.sql yet, skip this file: the new remove_usernames.sql already does all of it.)
\set ON_ERROR_STOP on
BEGIN;

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_code_format;
UPDATE users SET student_code = 'STD/' || substring(student_code FROM 5) WHERE student_code LIKE 'STD %';
ALTER TABLE users ADD CONSTRAINT users_code_format CHECK (student_code IS NULL OR student_code ~ '^STD/[0-9]{3,}$');

DROP FUNCTION IF EXISTS authenticate(text, text);
CREATE OR REPLACE FUNCTION authenticate(p_login text, p_password text)
RETURNS TABLE (id uuid, student_code text, email citext, full_name text, role user_role)
LANGUAGE sql STABLE AS $$
  SELECT u.id, u.student_code, u.email, u.full_name, u.role
  FROM users u
  WHERE u.is_active
    AND (u.email = btrim(p_login)::citext OR u.student_code = btrim(p_login))
    AND u.password_hash = crypt(p_password, u.password_hash);
$$;

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

COMMIT;
