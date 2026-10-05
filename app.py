"""Flask backend: PostgreSQL logins, protected pages, and JSON/audio content from Cloudflare R2."""
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone
from functools import wraps
from pathlib import Path

import psycopg
from dotenv import load_dotenv
from psycopg.rows import dict_row
from psycopg.types.json import Jsonb
from psycopg_pool import ConnectionPool
from flask import Flask, Response, abort, jsonify, redirect, request, send_from_directory, session

load_dotenv()

BASE = Path(__file__).resolve().parent
PUBLIC_DIR = BASE / "public"                      # html, css, js
LOCAL_DIR = BASE / os.environ.get("LOCAL_CONTENT_DIR", "content")  # used only when R2 is not configured
CACHE_SECONDS = int(os.environ.get("CACHE_SECONDS", "60"))
MAX_JSON_BYTES = 1_000_000
STATE_KEY = "data/admin-data.json"  # students, tasks and mocks saved by the admin page
# Kept out of the admin's Content tab: students' answers (read them from the Students tab) and the admin's own state file.
HIDDEN_PREFIXES = ("submissions/",)
HIDDEN_KEYS = {STATE_KEY}


def cms_listed(key):
    """Only editable JSON content is listed: no audio, no submissions, no internal state."""
    return key.endswith(".json") and not key.startswith(HIDDEN_PREFIXES) and key not in HIDDEN_KEYS

app = Flask(__name__, static_folder=None)
app.secret_key = os.environ.get("SECRET_KEY") or secrets.token_hex(32)  # set SECRET_KEY, or sessions reset on restart
app.config.update(
    SESSION_COOKIE_HTTPONLY=True,
    SESSION_COOKIE_SAMESITE="Lax",
    SESSION_COOKIE_SECURE=os.environ.get("COOKIE_SECURE") == "1",  # set COOKIE_SECURE=1 behind HTTPS
    PERMANENT_SESSION_LIFETIME=8 * 3600,
)

# ---------------------------------------------------------------- database (PostgreSQL)
# Create it once with schema.sql, then set DATABASE_URL, e.g. postgresql://user:pass@localhost:5432/coldschool
DATABASE_URL = os.environ.get("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL is not set (see .env.example)")
pool = ConnectionPool(DATABASE_URL, min_size=1, max_size=int(os.environ.get("DB_POOL_MAX", "5")),
                      kwargs={"row_factory": dict_row}, open=False)
pool.open()

EMAIL_RE = re.compile(r"^\S+@\S+\.\S+$")
USERNAME_RE = re.compile(r"^[A-Za-z0-9._-]{3,32}$")
# Skill folders in the bucket (reading/reading-passages.json, listening/..., and so on)
CONTENT_FOLDERS = ("reading", "listening", "writing", "speaking")

# page -> who may open it (None = public)
PAGES = {"index.html": None, "login.html": None, "notes.html": "user", "quiz.html": "user", "admin.html": "admin"}

# ---------------------------------------------------------------- storage (R2 or local folder)
R2_OK = all(os.environ.get(k) for k in ("R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET"))
PREFIX = os.environ.get("R2_KEY_PREFIX", "")      # optional folder inside the bucket, e.g. "upseas/"
if R2_OK:
    import boto3
    from botocore.config import Config
    from botocore.exceptions import ClientError

    BUCKET = os.environ["R2_BUCKET"]
    s3 = boto3.client(
        "s3",
        endpoint_url=f"https://{os.environ['R2_ACCOUNT_ID']}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
        config=Config(signature_version="s3v4"),
    )

KEY_RE = re.compile(r"^[A-Za-z0-9_\-./]{1,200}$")


def valid_key(key):
    return bool(KEY_RE.match(key)) and ".." not in key and not key.startswith("/")


def _local_path(key):
    p = (LOCAL_DIR / key).resolve()
    return p if LOCAL_DIR.resolve() in p.parents else None


def store_list():
    out = []
    if R2_OK:
        token = None
        while True:
            kw = {"Bucket": BUCKET, "Prefix": PREFIX, "MaxKeys": 1000}
            if token:
                kw["ContinuationToken"] = token
            r = s3.list_objects_v2(**kw)
            for o in r.get("Contents", []):
                k = o["Key"][len(PREFIX):]
                if k and not k.endswith("/"):
                    out.append({"key": k, "size": o["Size"], "modified": o["LastModified"].isoformat()})
            if not r.get("IsTruncated"):
                break
            token = r["NextContinuationToken"]
        return out
    if LOCAL_DIR.exists():
        for p in LOCAL_DIR.rglob("*"):
            if p.is_file():
                st = p.stat()
                out.append({
                    "key": p.relative_to(LOCAL_DIR).as_posix(),
                    "size": st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                })
    return out


def store_get(key):
    if R2_OK:
        try:
            return s3.get_object(Bucket=BUCKET, Key=PREFIX + key)["Body"].read()
        except ClientError as e:
            if e.response["Error"]["Code"] in ("NoSuchKey", "404", "NotFound"):
                return None
            raise
    p = _local_path(key)
    return p.read_bytes() if p and p.is_file() else None


def store_put(key, data):
    if R2_OK:
        s3.put_object(Bucket=BUCKET, Key=PREFIX + key, Body=data, ContentType="application/json")
        return
    p = _local_path(key)
    if not p:
        abort(400)
    p.parent.mkdir(parents=True, exist_ok=True)
    p.write_bytes(data)


CACHE = {}  # per-process; each worker keeps its own copy


def cached_get(key):
    hit = CACHE.get(key)
    if hit and time.time() - hit[0] < CACHE_SECONDS:
        return hit[1]
    data = store_get(key)
    if data is not None:
        CACHE[key] = (time.time(), data)
    return data


# ---------------------------------------------------------------- auth helpers
def assigned_tasks(user):
    """Tasks the admin has assigned to this user (matched by email). Never exposes other students."""
    try:
        raw = store_get(STATE_KEY)
        data = json.loads(raw) if raw else {}
    except Exception:
        app.logger.exception("could not read admin data")
        return []
    students = data.get("students", [])
    me = (next((s for s in students if s.get("id") == user["id"]), None)
          or next((s for s in students if str(s.get("email", "")).lower() == user["email"].lower()), None))
    if not me:
        return []
    return [t for t in data.get("tasks", []) if me["id"] in t.get("assignedTo", [])]

FAILS = {}  # ip -> list of failure timestamps (in memory)


def too_many(ip):
    now = time.time()
    FAILS[ip] = [t for t in FAILS.get(ip, []) if now - t < 300]
    return len(FAILS[ip]) >= 5


def landing_for(user):
    return "admin.html" if user["role"] == "admin" else "notes.html"


def current_user():
    return session.get("user")


def api_user(role=None):
    def deco(f):
        @wraps(f)
        def wrapper(*a, **kw):
            u = current_user()
            if not u:
                return jsonify(error="login_required"), 401
            if role and u["role"] != role:
                return jsonify(error="forbidden"), 403
            return f(*a, **kw)
        return wrapper
    return deco


@app.after_request
def headers(resp):
    resp.headers["X-Content-Type-Options"] = "nosniff"
    if request.path.startswith("/api/"):
        resp.headers["Cache-Control"] = "no-store"
    return resp


@app.post("/api/login")
def api_login():
    ip = request.headers.get("CF-Connecting-IP") or request.remote_addr or "?"
    if too_many(ip):
        return jsonify(error="too_many"), 429
    d = request.get_json(silent=True) or {}
    login = str(d.get("email") or d.get("login") or "").strip()[:254]   # email or username
    password = str(d.get("password", ""))
    if not login or not password or len(password) > 1024:
        return jsonify(error="invalid"), 401
    with pool.connection() as conn:
        user = conn.execute(
            "SELECT id, username::text AS username, email::text AS email, full_name, role::text AS role "
            "FROM authenticate(%s, %s)", (login, password)).fetchone()
        if not user:  # burn the same bcrypt time so unknown accounts can't be told apart by speed
            conn.execute("SELECT crypt(%s, gen_salt('bf', 12))", (password,))
    if not user:
        FAILS.setdefault(ip, []).append(time.time())
        return jsonify(error="invalid"), 401
    session.clear()
    session.permanent = True
    session["user"] = {"id": str(user["id"]), "email": user["email"], "username": user["username"],
                       "name": user["full_name"], "role": user["role"]}
    user = session["user"]
    nxt = str(d.get("next") or "")
    ok_next = nxt in PAGES and nxt != "login.html" and (PAGES[nxt] != "admin" or user["role"] == "admin")
    if not ok_next:
        nxt = landing_for(user)
    return jsonify(ok=True, name=user["name"], role=user["role"], redirect="/" + nxt)


@app.post("/api/logout")
def api_logout():
    session.clear()
    return jsonify(ok=True)


REF_RE = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


def sub_key(student_id, ref):
    """Where a student's answers live in R2: submissions/<student-id>/<task-id>.json"""
    return f"submissions/{student_id}/{ref}.json"


@app.get("/api/my/tasks")
@api_user()
def api_my_tasks():
    u = current_user()
    with pool.connection() as conn:
        done = {r["task_ref"] for r in conn.execute(
            "SELECT task_ref FROM submission_status WHERE student_id = %s AND status = 'YES'", (u["id"],)).fetchall()}
    tasks = [{**{k: t.get(k, "") for k in ("id", "title", "skill", "due", "note", "file")},
              "submitted": t.get("id") in done} for t in assigned_tasks(u)]
    return jsonify(tasks=tasks)


@app.post("/api/my/submissions")
@api_user()
def api_submit():
    """Student submits all answers for one assigned task, once. Answers -> R2 (JSON), status -> DB ('YES')."""
    u = current_user()
    if request.content_length and request.content_length > 300_000:
        return jsonify(error="too_large"), 413
    d = request.get_json(silent=True) or {}
    ref = str(d.get("task", ""))
    task = next((t for t in assigned_tasks(u) if str(t.get("id")) == ref), None)
    if not task or not REF_RE.match(ref):          # not assigned to this student
        return jsonify(error="forbidden"), 403
    answers, review = d.get("answers"), d.get("review")
    if not isinstance(answers, dict) or not isinstance(review, list):
        return jsonify(error="bad_payload"), 400
    secs = d.get("secondsLeft")
    secs = secs if isinstance(secs, int) and not isinstance(secs, bool) and 0 <= secs <= 86400 else None
    key = sub_key(u["id"], ref)
    payload = {
        "version": 1,
        "student": {"id": u["id"], "username": u.get("username"), "name": u["name"], "email": u["email"]},
        "task": {"id": ref, "title": task.get("title", ""), "skill": task.get("skill", ""), "file": task.get("file", "")},
        "submittedAt": datetime.now(timezone.utc).isoformat(),
        "secondsLeft": secs,
        "auto": bool(d.get("auto")),               # true when the timer ran out
        "answers": answers,                        # raw: {questionId: value}
        "review": review,                          # readable copy for the admin page
    }
    try:
        with pool.connection() as conn:
            # claim the slot first (a second click waits here, then gets 409); roll back if R2 fails
            row = conn.execute(
                "INSERT INTO submission_status (student_id, task_ref, status, r2_key, submitted_at) "
                "VALUES (%s, %s, 'YES', %s, now()) "
                "ON CONFLICT (student_id, task_ref) DO UPDATE "
                "SET status = 'YES', r2_key = EXCLUDED.r2_key, submitted_at = now() "
                "WHERE submission_status.status = 'NO' RETURNING task_ref",
                (u["id"], ref, key)).fetchone()
            if not row:
                return jsonify(error="already_submitted"), 409
            store_put(key, json.dumps(payload, ensure_ascii=False).encode("utf-8"))
    except Exception:
        app.logger.exception("submission failed")
        return jsonify(error="storage_error"), 502
    return jsonify(ok=True), 201


@app.get("/api/me")
@api_user()
def api_me():
    return jsonify(current_user())


# ---------------------------------------------------------------- content served to the site
@app.get("/data/<path:rest>")
def data_file(rest):
    key = "data/" + rest
    if not valid_key(key) or not key.endswith(".json"):
        abort(404)
    u = current_user()
    low = rest.lower()
    if "answers" in low or low.startswith("admin"):      # answers and admin data: admin only
        if not (u and u["role"] == "admin"):
            abort(403)
    elif low.startswith(("quiz/", "notes/")) and not u:  # study content: logged-in users
        abort(401)
    try:
        data = cached_get(key)
    except Exception:
        app.logger.exception("storage read failed")
        abort(502)
    if data is None:
        abort(404)
    return Response(data, mimetype="application/json", headers={"Cache-Control": "private, max-age=0, must-revalidate"})




@app.get("/content/<path:key>")
def content_file(key):
    if not valid_key(key) or not key.endswith(".json") or key.split("/")[0] not in CONTENT_FOLDERS:
        abort(404)
    u = current_user()
    if not u:
        abort(401)
    if "answers" in key.lower() and u["role"] != "admin":  # answer files: admin only
        abort(403)
    if u["role"] != "admin":                               # students: only files assigned to them
        allowed = set()
        for t in assigned_tasks(u):
            f = t.get("file") or ""
            allowed |= {f, re.sub("passages", "questions", f, flags=re.I)}
        if key not in allowed:
            abort(403)
    try:
        data = cached_get(key)
    except Exception:
        app.logger.exception("storage read failed")
        abort(502)
    if data is None:
        abort(404)
    return Response(data, mimetype="application/json", headers={"Cache-Control": "private, max-age=0, must-revalidate"})


@app.get("/audio/<path:rest>")
def audio_file(rest):
    key = "audio/" + rest
    if not current_user():
        abort(401)
    if not valid_key(key) or not re.search(r"\.(mp3|m4a|wav|ogg)$", key, re.I):
        abort(404)
    if R2_OK:
        url = s3.generate_presigned_url(
            "get_object", Params={"Bucket": BUCKET, "Key": PREFIX + key}, ExpiresIn=3600)
        return redirect(url, 302)
    p = _local_path(key)
    if not p or not p.is_file():
        abort(404)
    return send_from_directory(p.parent, p.name, conditional=True)


# ---------------------------------------------------------------- admin: students (PostgreSQL)
def student_json(r):
    t = r["target_band"]
    return {"id": str(r["id"]), "name": r["full_name"], "email": r["email"], "username": r["username"],
            "target": float(t) if t is not None else "", "assignedTo": [],
            "submitted": int(r.get("submitted") or 0)}


STUDENT_COLS = "id, username::text AS username, email::text AS email, full_name, target_band"


@app.get("/api/admin/students")
@api_user("admin")
def admin_students():
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT u.id, u.username::text AS username, u.email::text AS email, u.full_name, u.target_band, "
            "(SELECT count(*) FROM submission_status s WHERE s.student_id = u.id AND s.status = 'YES') AS submitted "
            "FROM users u WHERE u.role = 'student' AND u.is_active ORDER BY u.full_name").fetchall()
    return jsonify(students=[student_json(r) for r in rows])


@app.post("/api/admin/students")
@api_user("admin")
def admin_add_student():
    d = request.get_json(silent=True) or {}
    name = str(d.get("name", "")).strip()
    username = str(d.get("username", "")).strip()
    email = str(d.get("email", "")).strip()
    password = str(d.get("password", ""))
    try:
        target = float(d["target"]) if d.get("target") not in (None, "") else None
    except (TypeError, ValueError):
        return jsonify(error="bad_target"), 400
    if not name or len(name) > 200:
        return jsonify(error="bad_name"), 400
    if not USERNAME_RE.match(username):
        return jsonify(error="bad_username"), 400
    if not EMAIL_RE.match(email) or len(email) > 254:
        return jsonify(error="bad_email"), 400
    if not (8 <= len(password) and len(password.encode()) <= 72):   # bcrypt only reads 72 bytes
        return jsonify(error="bad_password"), 400
    if target is not None and not (4 <= target <= 9):
        return jsonify(error="bad_target"), 400
    try:
        with pool.connection() as conn:
            new_id = conn.execute("SELECT create_student(%s::text, %s::text, %s::text, %s::text, %s::numeric, %s::uuid) AS id",
                                  (username, email, name, password, target, current_user()["id"])).fetchone()["id"]
            row = conn.execute(f"SELECT {STUDENT_COLS} FROM users WHERE id = %s", (new_id,)).fetchone()
    except psycopg.errors.UniqueViolation as e:
        which = "duplicate_username" if "username" in (e.diag.constraint_name or "") else "duplicate_email"
        return jsonify(error=which), 409
    except psycopg.Error:
        app.logger.exception("create student failed")
        return jsonify(error="db_error"), 500
    return jsonify(ok=True, student=student_json(row)), 201


@app.post("/api/admin/students/<uuid:sid>/password")
@api_user("admin")
def admin_reset_password(sid):
    password = str((request.get_json(silent=True) or {}).get("password", ""))
    if not (8 <= len(password) and len(password.encode()) <= 72):
        return jsonify(error="bad_password"), 400
    with pool.connection() as conn:
        done = conn.execute("UPDATE users SET password_hash = crypt(%s, gen_salt('bf', 12)) "
                            "WHERE id = %s AND role = 'student' RETURNING id", (password, str(sid))).fetchone()
    return (jsonify(ok=True) if done else (jsonify(error="not_found"), 404))


@app.get("/api/admin/students/<uuid:sid>/submissions")
@api_user("admin")
def admin_student_submissions(sid):
    """Submission status per task for one student (tasks with no row are 'NO')."""
    with pool.connection() as conn:
        rows = conn.execute(
            "SELECT task_ref, status, submitted_at FROM submission_status WHERE student_id = %s "
            "ORDER BY submitted_at DESC NULLS LAST", (str(sid),)).fetchall()
    return jsonify(submissions=[{
        "task": r["task_ref"], "status": r["status"],
        "submittedAt": r["submitted_at"].isoformat() if r["submitted_at"] else None} for r in rows])


@app.get("/api/admin/students/<uuid:sid>/submissions/<ref>")
@api_user("admin")
def admin_submission(sid, ref):
    """The answers JSON stored in R2 for one student + task."""
    if not REF_RE.match(ref):
        return jsonify(error="bad_key"), 400
    with pool.connection() as conn:
        row = conn.execute("SELECT status FROM submission_status WHERE student_id = %s AND task_ref = %s",
                           (str(sid), ref)).fetchone()
    if not row or row["status"] != "YES":
        return jsonify(error="not_submitted"), 404
    try:
        data = store_get(sub_key(sid, ref))
    except Exception:
        app.logger.exception("storage read failed")
        return jsonify(error="storage_error"), 502
    if data is None:
        return jsonify(error="file_missing"), 404
    return Response(data, mimetype="application/json", headers={"Cache-Control": "no-store"})


@app.post("/api/admin/students/<uuid:sid>/submissions/<ref>/reopen")
@api_user("admin")
def admin_reopen(sid, ref):
    """Set status back to 'NO' so the student can retake. The old answers are archived in R2, not deleted."""
    if not REF_RE.match(ref):
        return jsonify(error="bad_key"), 400
    try:
        with pool.connection() as conn:
            row = conn.execute("UPDATE submission_status SET status = 'NO', submitted_at = NULL "
                               "WHERE student_id = %s AND task_ref = %s AND status = 'YES' RETURNING task_ref",
                               (str(sid), ref)).fetchone()
            if not row:
                return jsonify(error="not_found"), 404
            old = store_get(sub_key(sid, ref))
            if old is not None:
                stamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")
                store_put(f"submissions/_archive/{sid}/{ref}-{stamp}.json", old)
    except Exception:
        app.logger.exception("reopen failed")
        return jsonify(error="storage_error"), 502
    return jsonify(ok=True)


# ---------------------------------------------------------------- admin content manager API
@app.get("/api/admin/content")
@api_user("admin")
def admin_list():
    try:
        files = sorted((f for f in store_list() if cms_listed(f["key"])), key=lambda f: f["key"])
    except Exception:
        app.logger.exception("storage list failed")
        return jsonify(error="storage_error"), 502
    return jsonify(files=files, backend="Cloudflare R2" if R2_OK else "local folder")


@app.get("/api/admin/content/<path:key>")
@api_user("admin")
def admin_read(key):
    if not valid_key(key) or not key.endswith(".json") or key.startswith(HIDDEN_PREFIXES):
        return jsonify(error="bad_key"), 400
    try:
        data = store_get(key)
    except Exception:
        app.logger.exception("storage read failed")
        return jsonify(error="storage_error"), 502
    if data is None:
        return jsonify(error="not_found"), 404
    return Response(data, mimetype="application/json")


@app.put("/api/admin/content/<path:key>")
@api_user("admin")
def admin_write(key):
    if not valid_key(key) or not key.endswith(".json") or key.startswith(HIDDEN_PREFIXES):
        return jsonify(error="bad_key"), 400
    raw = request.get_data()
    if len(raw) > MAX_JSON_BYTES:
        return jsonify(error="too_large"), 413
    try:
        json.loads(raw.decode("utf-8"))
    except (UnicodeDecodeError, ValueError) as e:
        return jsonify(error="invalid_json", detail=str(e)), 400
    try:
        store_put(key, raw)
    except Exception:
        app.logger.exception("storage write failed")
        return jsonify(error="storage_error"), 502
    CACHE.pop(key, None)
    return jsonify(ok=True)


# ---------------------------------------------------------------- pages and static files
@app.get("/")
def home():
    return send_from_directory(PUBLIC_DIR, "index.html")


@app.get("/<path:name>")
def public_file(name):
    if name in PAGES:
        need, u = PAGES[name], current_user()
        if name == "login.html" and u:
            return redirect("/" + landing_for(u))
        if need and not u:
            return redirect(f"/login.html?next={name}")
        if need == "admin" and u["role"] != "admin":
            abort(403)
        return send_from_directory(PUBLIC_DIR, name)
    if re.fullmatch(r"[\w.-]+\.(css|js)", name):
        return send_from_directory(PUBLIC_DIR, name)
    abort(404)


if __name__ == "__main__":
    app.run(debug=True)
