"""Marking logic (no Flask, no database), so it can be tested on its own.

Reading / Listening : compare the student's answers with an answer key, count the correct ones,
                      turn the raw score into an IELTS band with a score table.
Writing             : the tutor gives each task a band for the 4 IELTS criteria; the task band and the
                      overall writing band are worked out here.
"""
import math
import re

# Raw score (out of 40) -> band. Each row is [lowest score that earns it, band]. Official IELTS tables
# (Listening, and Reading Academic). To use your own table, create data/band-scale.json in R2:
#   {"listening": [[35, 9], [32, 8.5], ...], "reading": [[...]]}
DEFAULT_BANDS = {
    "listening": [[39, 9], [37, 8.5], [35, 8], [32, 7.5], [30, 7], [26, 6.5], [23, 6], [18, 5.5], [16, 5],
                  [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1]],
    "reading":   [[39, 9], [37, 8.5], [35, 8], [33, 7.5], [30, 7], [27, 6.5], [23, 6], [19, 5.5], [15, 5],
                  [13, 4.5], [10, 4], [8, 3.5], [6, 3], [4, 2.5], [3, 2], [2, 1.5], [1, 1]],
}
CRITERIA = ("ta", "cc", "lr", "gra")   # Task Achievement/Response, Coherence, Lexical Resource, Grammar


def round_half(x):
    """IELTS rounding to the nearest half band: 6.25 -> 6.5, 6.75 -> 7.0, 6.1 -> 6.0"""
    return math.floor(x * 2 + 0.5) / 2


def valid_scale(table):
    return (isinstance(table, list) and table and
            all(isinstance(r, list) and len(r) == 2 and all(isinstance(v, (int, float)) and not isinstance(v, bool) for v in r)
                for r in table))


def band_for(skill, score, total, scale=None):
    table = (scale or {}).get(skill)
    if not valid_scale(table):
        table = DEFAULT_BANDS.get(skill)
    if not table or not total:
        return None
    s40 = score if total == 40 else round(score * 40 / total)   # a shorter test is scaled up to 40
    for lo, band in sorted(table, key=lambda r: -r[0]):
        if s40 >= lo:
            return float(band)
    return 0.0


_SYN = {"t": "true", "f": "false", "ng": "not given", "notgiven": "not given", "nt": "not given"}


def norm(s):
    s = re.sub(r"\s+", " ", str(s).strip().lower())
    s = re.sub(r"(?<=\d),(?=\d{3})", "", s)          # 1,000 = 1000
    s = s.strip(" .,;:!?\"'\u2018\u2019\u201c\u201d")
    return _SYN.get(s, s)


def _shown(e):
    return chr(65 + e) if isinstance(e, int) and not isinstance(e, bool) and 0 <= e < 26 else str(e)


def _plain(v):
    return isinstance(v, (str, int, float)) and not isinstance(v, bool) or (isinstance(v, list) and v and all(isinstance(x, (str, int, float)) for x in v))


def extract_key(obj):
    """Turns an answer file into {question id: answer}. Accepted shapes (the id is the question id used in the test file):
         {"q1": "12", "q2": ["bee", "bees"]}                          flat map
         {"answers": {"q1": "12"}}                                    wrapped
         [{"id": "q1", "answer": "12"}, ...]                          list
         the test file's own structure, with an "answer" next to each question's "id"."""
    key = {}

    def walk(o):
        if isinstance(o, dict):
            if "id" in o and any(k in o for k in ("answer", "answers", "correct")):
                key[str(o["id"])] = o.get("answer", o.get("answers", o.get("correct")))
            for v in o.values():
                walk(v)
        elif isinstance(o, list):
            for x in o:
                walk(x)

    walk(obj)
    if not key and isinstance(obj, dict):
        flat = obj["answers"] if isinstance(obj.get("answers"), dict) else obj
        key = {str(k): v for k, v in flat.items() if _plain(v)}
    return {k: v for k, v in key.items() if not k.startswith("_") and v not in (None, "", [])}


def grade(key, answers, review):
    """key: {"q1": "12", "q2": ["bee", "bees"], "q11": "B", "q21": "True"}  (or {"answers": {...}}).
    Text answers ignore capitals, extra spaces and end punctuation; a list gives several accepted spellings.
    mcq / map: a letter ("B") or the option number (0 = first). tfng: "True", "False", "Not given" (T / F / NG also work)."""
    if isinstance(key.get("answers"), dict):
        key = key["answers"]
    key = {k: v for k, v in key.items() if not str(k).startswith("_") and v not in (None, "", [])}
    given, order = {}, {}
    for sec in review if isinstance(review, list) else []:
        for it in (sec.get("items") or []) if isinstance(sec, dict) else []:
            if isinstance(it, dict) and it.get("id") is not None:
                given[it["id"]] = str(it.get("a") or "")
                order[it["id"]] = len(order) + 1            # same numbering the student saw
    out, score = [], 0
    for qid, exp in key.items():
        alts = exp if isinstance(exp, list) else [exp]
        raw = answers.get(qid) if isinstance(answers, dict) else None
        text = given.get(qid, "")
        ok = False
        if raw is not None and raw != "":
            if isinstance(raw, int) and not isinstance(raw, bool):      # mcq / true-false-not-given: stored as option number
                forms = {norm(text)}
                m = re.match(r"^([A-Za-z])\.\s", text)
                if m:
                    forms.add(m.group(1).lower())
                ok = any((e == raw) if isinstance(e, int) and not isinstance(e, bool) else norm(e) in forms for e in alts)
            else:
                ok = any(norm(e) == norm(raw) for e in alts if not isinstance(e, bool) and not isinstance(e, int)) or \
                     any(isinstance(e, int) and not isinstance(e, bool) and norm(chr(65 + e)) == norm(raw) for e in alts if 0 <= e < 26)
        score += ok
        out.append({"id": qid, "n": order.get(qid), "correct": bool(ok), "given": text or (str(raw) if raw not in (None, "") else ""),
                    "expected": " / ".join(_shown(e) for e in alts)})
    out.sort(key=lambda q: (q["n"] is None, q["n"] or 0))
    return {"score": score, "total": len(out), "questions": out}


def writing_result(tasks, labels):
    """tasks: [{"ta": 6.5, "cc": 6, "lr": 6, "gra": 7}, ...] one per writing task. Returns (overall band, details)."""
    if not isinstance(tasks, list) or not (1 <= len(tasks) <= len(labels)) or len(tasks) != len(labels):
        raise ValueError("tasks")
    done = []
    for t, label in zip(tasks, labels):
        row = {"label": label}
        for c in CRITERIA:
            v = t.get(c) if isinstance(t, dict) else None
            if isinstance(v, bool) or not isinstance(v, (int, float)) or not (0 <= v <= 9) or (v * 2) % 1:
                raise ValueError(c)
            row[c] = float(v)
        row["band"] = round_half(sum(row[c] for c in CRITERIA) / 4)
        done.append(row)
    # Task 2 carries twice the weight of Task 1
    overall = done[0]["band"] if len(done) == 1 else round_half((done[0]["band"] + 2 * done[1]["band"]) / 3)
    return overall, done
