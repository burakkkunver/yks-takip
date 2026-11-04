"""İş kuralları: programdan görev üretme, görev tamamlanma, tekrar sistemi, zincir, konu durumu."""
from datetime import date, timedelta

from . import clock
from .db import rows

# ---------------------------------------------------------------- program -> görev


def active_program_items(con, d: date) -> list[dict]:
    ds = clock.iso(d)
    return rows(con.execute(
        "SELECT * FROM program_items WHERE weekday=? AND valid_from<=? AND (valid_to IS NULL OR valid_to>?)"
        " ORDER BY id", (d.weekday(), ds, ds)))


def materialize(con, start: date, end: date):
    """Haftalık programdaki maddeleri start..end (en fazla bugün) arasındaki günlere görev olarak yazar.

    Program değiştirilmedikçe her hafta aynen tekrar eder; geçmiş günlerin görevleri sabit kalır.
    """
    end = min(end, clock.today())
    if start > end:
        return
    items = rows(con.execute(
        "SELECT * FROM program_items WHERE valid_from<=? AND (valid_to IS NULL OR valid_to>?)",
        (clock.iso(end), clock.iso(start))))
    if not items:
        return
    for d in clock.daterange(start, end):
        ds = clock.iso(d)
        for it in items:
            if it["weekday"] != d.weekday() or it["valid_from"] > ds or (it["valid_to"] and it["valid_to"] <= ds):
                continue
            con.execute(
                "INSERT OR IGNORE INTO tasks(date,program_item_id,kind,title,subject_id,topic_id,target,exam_type,"
                "created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
                (ds, it["id"], it["kind"], it["title"], it["subject_id"], it["topic_id"], it["target"],
                 it["exam_type"], it["created_by"], clock.stamp()))
            if it["kind"] == "deneme":
                tid = con.execute("SELECT id FROM tasks WHERE program_item_id=? AND date=?", (it["id"], ds)).fetchone()[0]
                refresh_task(con, tid)


def task_is_complete(t: dict, has_exam: bool = False) -> bool:
    if t["kind"] == "tik":
        return bool(t["ticked"])
    if t["kind"] == "deneme":
        return has_exam
    answered = t["correct"] + t["wrong"] + t["blank"]
    if answered <= 0:
        return False
    return (t["wrong"] + t["blank"] == 0) or bool(t["closed"])


def task_has_progress(t: dict) -> bool:
    return bool(t["ticked"]) or (t["correct"] + t["wrong"] + t["blank"]) > 0 or bool(t["completed_at"])


def refresh_task(con, task_id: int):
    t = dict(con.execute("SELECT * FROM tasks WHERE id=?", (task_id,)).fetchone())
    has_exam = False
    if t["kind"] == "deneme":
        q = "SELECT 1 FROM exams WHERE date=?" + (" AND type=?" if t["exam_type"] else "")
        args = (t["date"], t["exam_type"]) if t["exam_type"] else (t["date"],)
        has_exam = con.execute(q, args).fetchone() is not None
    done = task_is_complete(t, has_exam)
    if done and not t["completed_at"]:
        con.execute("UPDATE tasks SET completed_at=? WHERE id=?", (clock.stamp(), task_id))
    elif not done and t["completed_at"]:
        con.execute("UPDATE tasks SET completed_at=NULL WHERE id=?", (task_id,))


def student_can_edit(d: date) -> bool:
    today = clock.today()
    return today - timedelta(days=clock.EDIT_WINDOW_DAYS) <= d <= today


# ---------------------------------------------------------------- tekrar sistemi

FIRST_GAP = 2   # hata girildikten 2 gün sonra
SECOND_AT = 7   # hata girildikten 7 gün sonra
RETRY_GAP = 2   # "yine yapamadım" -> 2 gün sonra tekrar


def schedule_first_review(con, mistake_id: int, created: date):
    con.execute("INSERT INTO reviews(mistake_id,stage,due_date) VALUES (?,?,?)",
                (mistake_id, 0, clock.iso(created + timedelta(days=FIRST_GAP))))


def mark_review(con, review: dict, result: str):
    today = clock.today()
    con.execute("UPDATE reviews SET done_date=?, result=? WHERE id=?", (clock.iso(today), result, review["id"]))
    m = dict(con.execute("SELECT * FROM mistakes WHERE id=?", (review["mistake_id"],)).fetchone())
    if result == "yapamadim":
        con.execute("UPDATE mistakes SET fail_count=fail_count+1 WHERE id=?", (m["id"],))
        con.execute("INSERT INTO reviews(mistake_id,stage,due_date) VALUES (?,?,?)",
                    (m["id"], review["stage"], clock.iso(today + timedelta(days=RETRY_GAP))))
    elif review["stage"] == 0:
        created = clock.parse(m["created_date"])
        due = max(created + timedelta(days=SECOND_AT), today + timedelta(days=1))
        con.execute("UPDATE mistakes SET stage=1 WHERE id=?", (m["id"],))
        con.execute("INSERT INTO reviews(mistake_id,stage,due_date) VALUES (?,?,?)", (m["id"], 1, clock.iso(due)))
    else:
        con.execute("UPDATE mistakes SET stage=2, status='kapandi' WHERE id=?", (m["id"],))


# ---------------------------------------------------------------- günler ve zincir

MAX_EXCUSES_PER_WEEK = 1


def start_date(con) -> date:
    r = con.execute("SELECT value FROM meta WHERE key='start_date'").fetchone()
    return clock.parse(r[0]) if r else clock.today()


def day_states(con, start: date, end: date) -> dict[str, dict]:
    """Her gün için durum: green / yellow / red / open / excused / empty / future."""
    today = clock.today()
    materialize(con, start, end)
    s, e = clock.iso(start), clock.iso(end)
    tasks_by_day: dict[str, list] = {}
    for t in rows(con.execute("SELECT * FROM tasks WHERE date BETWEEN ? AND ?", (s, e))):
        tasks_by_day.setdefault(t["date"], []).append(t)
    reviews_by_day: dict[str, list] = {}
    for r in rows(con.execute("SELECT * FROM reviews WHERE due_date BETWEEN ? AND ?", (s, e))):
        reviews_by_day.setdefault(r["due_date"], []).append(r)
    excused = {r["date"]: r for r in rows(con.execute(
        "SELECT * FROM days WHERE date BETWEEN ? AND ?", (s, e)))}
    first = start_date(con)
    out = {}
    for d in clock.daterange(start, end):
        ds = clock.iso(d)
        tasks = tasks_by_day.get(ds, [])
        revs = reviews_by_day.get(ds, [])
        n_done = sum(1 for t in tasks if t["completed_at"])
        limit = clock.iso(d + timedelta(days=clock.EDIT_WINDOW_DAYS))
        r_done = sum(1 for r in revs if r["done_date"] and r["done_date"] <= limit)
        info = {"date": ds, "tasks": len(tasks), "tasks_done": n_done, "reviews": len(revs), "reviews_done": r_done}
        if d > today:
            state = "future"
        elif d < first:
            state = "before"
        elif excused.get(ds, {}).get("excused"):
            state = "excused"
        elif not tasks and not revs:
            state = "empty"
        elif n_done == len(tasks) and r_done == len(revs):
            state = "green"
        elif d == today:
            state = "yellow" if all(task_has_progress(t) for t in tasks) and tasks else "open"
        else:
            state = "red"
        info["state"] = state
        out[ds] = info
    return out


def chain(con) -> dict:
    today = clock.today()
    first = start_date(con)
    states = day_states(con, first, today)
    ordered = [states[clock.iso(d)]["state"] for d in clock.daterange(first, today)]
    # güncel zincir: bugünden geriye; bugün henüz bitmediyse zinciri kırmaz
    current = 0
    for i, st in enumerate(reversed(ordered)):
        if st == "green":
            current += 1
        elif st in ("excused", "empty", "before") or (i == 0 and st in ("open", "yellow")):
            continue
        else:
            break
    best = run = 0
    for i, st in enumerate(ordered):
        if st == "green":
            run += 1
            best = max(best, run)
        elif st in ("excused", "empty", "before") or (i == len(ordered) - 1 and st in ("open", "yellow")):
            continue
        else:
            run = 0
    last14 = [states[clock.iso(d)] for d in clock.daterange(max(first, today - timedelta(days=13)), today)]
    return {"current": current, "best": best, "last14": [{"date": x["date"], "state": x["state"]} for x in last14]}


def excuses_this_week(con, d: date) -> int:
    ws = clock.week_start(d)
    return con.execute("SELECT COUNT(*) FROM days WHERE excused=1 AND date BETWEEN ? AND ? AND date<>?",
                       (clock.iso(ws), clock.iso(ws + timedelta(days=6)), clock.iso(d))).fetchone()[0]


# ---------------------------------------------------------------- konu durumu (ısı haritası)


def topic_heat(con) -> list[dict]:
    """Her dersin ana konuları için renk: kirmizi / sari / yesil / gri."""
    recent = clock.iso(clock.today() - timedelta(days=14))
    stats = {}
    for r in rows(con.execute(
            "SELECT COALESCE(t.parent_id, t.id) AS tid, m.status, m.fail_count, m.created_date"
            " FROM mistakes m JOIN topics t ON t.id=m.topic_id")):
        s = stats.setdefault(r["tid"], {"open": 0, "total": 0, "fails": 0, "recent": 0})
        s["total"] += 1
        if r["status"] == "acik":
            s["open"] += 1
            s["fails"] += r["fail_count"]
        if r["created_date"] >= recent:
            s["recent"] += 1
    out = []
    for subj in rows(con.execute("SELECT id,name FROM subjects WHERE hidden=0 ORDER BY sort")):
        topics = []
        for t in rows(con.execute(
                "SELECT id,name FROM topics WHERE subject_id=? AND parent_id IS NULL AND hidden=0 ORDER BY sort",
                (subj["id"],))):
            s = stats.get(t["id"], {"open": 0, "total": 0, "fails": 0, "recent": 0})
            if s["open"] >= 3 or s["fails"] >= 2:
                color = "kirmizi"
            elif s["open"] > 0 or s["recent"] > 0:
                color = "sari"
            elif s["total"] > 0:
                color = "yesil"
            else:
                color = "gri"
            topics.append({**t, **s, "color": color, "stuck": s["fails"] >= 2})
        out.append({**subj, "topics": topics})
    return out


def stuck_topics(con) -> list[dict]:
    """Aynı konuda en az 2 kez 'yine yapamadım' denmiş, hâlâ açık hatalar."""
    return rows(con.execute(
        "SELECT t.id, t.name, s.name AS subject, SUM(m.fail_count) AS fails, COUNT(*) AS open_count"
        " FROM mistakes m JOIN topics t ON t.id=m.topic_id JOIN subjects s ON s.id=m.subject_id"
        " WHERE m.status='acik' GROUP BY t.id HAVING SUM(m.fail_count)>=2 ORDER BY fails DESC"))
