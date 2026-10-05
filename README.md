UPSEAS CONSULTANCY templates

Run from this folder:  python3 -m http.server  then open http://localhost:8000
(pages load JSON with fetch, so they will not work from file://)

theme.css / styles.css   colours, fonts, layout
data/ui.json             labels, buttons, nav, footer
(landing page text lives in public/index.html, login page text in public/login.html; no JSON)
data/skills.json         the four skills (id, name, summary)
(study notes now live in public/notes.html, no JSON)
data/quiz/<skill>.json   quiz content
audio/                   MP3 files (see audio/README.txt)
