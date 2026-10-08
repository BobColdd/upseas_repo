UPSEAS CONSULTANTS: IELTS training platform (Flask + PostgreSQL + Cloudflare R2)

Run:   pip install -r requirements.txt, copy .env.example to .env and fill it in, then  python app.py
       (never commit .env; it is listed in .gitignore)

Student pages (public/)
  dashboard.html + dashboard.js   landing page after login: task counts, "Up next", new-task alert
  practice.html  + practice.js    assigned practice tests -> Start task -> countdown -> exam screen -> submit
  notes.html     + notes.js       study notes (overview cards, one skill at a time)
  index.html                      the public home page (the "Home" tab)
  tasks.js                        shared helpers: skill icons, due dates, task status, brand name
  shell.js / common.js            nav highlighting, account menu, page protection
  app.css                         all styling (exam screen styles are under "EXAM MODE")
Admin: admin.html + admin.js (students, tasks, mocks) + admin-content.js (content editor); same shell as the student pages.
No Home tab after login: "/" sends logged-in users to their dashboard (the public home page is for visitors).
Old /quiz.html links redirect to /practice.html.

Audio: keep mp3 files in R2 (audio/...). Local test files go in audio/ and are git-ignored.
