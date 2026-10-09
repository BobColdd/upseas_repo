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

Marking
  marking.py                     score -> band tables, answer checking, writing band maths (no Flask / DB)
  Answer keys (R2)               answers/listening/ and answers/reading/, one file per test, named like the test file:
                                   test: listening/test-1.json  ->  answers/listening/test-1.json (or answers/test-1.json)
                                   reading: also tried under the questions file name, e.g. answers/reading/reading-questions.json
                                 Matched by question id (the ids in the test file). Shapes accepted:
                                   {"q1": "12", "q2": ["bee","bees"], "q11": "B", "q21": "True"}   |   {"answers": {...}}
                                   [{"id":"q1","answer":"12"}, ...]   |   the test file's own structure with "answer" on each question
  Reading / Listening            marked automatically on submit; the student sees the result at once
  Writing                        tutor picks 4 criteria bands per task (admin > student > submission); the task and
                                 overall bands are calculated; the student sees it once "Release to the student" is ticked
  Own score table (optional)     data/band-scale.json: {"listening": [[39,9],[37,8.5],...], "reading": [[...]]}
  Database                       run marking.sql once (table submission_marks)

Reading files (R2): upload ONE file, the passage file, and make it the task's file.
  reading/passage.json (or reading-passages.json)  ->  questions found as reading/questions.json (or reading-questions.json)
  answers found in answers/reading/ under the same name (passage.json), or questions.json / answers.json
