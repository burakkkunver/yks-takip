"""Öğrencinin günlük akışı: bugün ekranı, görevler, haftalık program, hata defteri, tekrarlar, geçmiş."""
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import clock, logic
from .api_core import save_photo
from .auth import coach_only, current_user, student_only
from .db import get_db, one, rows
from .seed import REASONS_BOS, REASONS_YANLIS

router = APIRouter(prefix="/api")

TOPIC_NAME = ("CASE WHEN tp.name IS NULL THEN t.name ELSE tp.name || ' › ' || t.name END")
TASK_SELECT = (
    "SELECT k.*, s.name AS subject, " + TOPIC_NAME + " AS topic, u.role AS creator_role FROM tasks k"
    " LEFT JOIN subjects s ON s.id=k.subject_id LEFT JOIN topics t ON t.id=k.topic_id"
    " LEFT JOIN topics tp ON tp.id=t.parent_id LEFT JOIN users u ON u.id=k.created_by")
MISTAKE_SELECT = (
    "SELECT m.*, s.name AS subject, " + TOPIC_NAME + " AS topic, src.name AS source FROM mistakes m"
    " JOIN subjects s ON s.id=m.subject_id LEFT JOIN topics t ON t.id=m.topic_id"
    " LEFT JOIN topics tp ON tp.id=t.parent_id LEFT JOIN sources src ON src.id=m.source_id")


def tasks_for(con, ds: str) -> list[dict]:
    d = clock.parse(ds)
    logic.materialize(con, d, d)
    out = rows(con.execute(TASK_SELECT + " WHERE k.date=? ORDER BY k.program_item_id IS NULL, k.id", (ds,)))
    editable = logic.student_can_edit(d)
    for t in out:
        t["done"] = bool(t["completed_at"])
        t["editable"] = editable
    return out


def due_reviews(con) -> list[dict]:
    today = clock.iso(clock.today())
    revs = rows(con.execute(
        "SELECT r.id AS review_id, r.stage AS review_stage, r.due_date, m2.* FROM reviews r"
        " JOIN (" + MISTAKE_SELECT + ") m2 ON m2.id=r.mistake_id"
        " WHERE r.done_date IS NULL AND r.due_date<=? ORDER BY r.due_date, r.id", (today,)))
    for r in revs:
        r["overdue"] = r["due_date"] < today
    return revs


# ---------------------------------------------------------------- bugün

@router.get("/bugun")
def today_view(user=Depends(current_user), con=Depends(get_db)):
    today = clock.today()
    ts = clock.iso(today)
    tasks = tasks_for(con, ts)
    ws = clock.iso(clock.week_start(today))
    day = one(con.execute("SELECT * FROM days WHERE date=?", (ts,))) or {}
    all_done = bool(tasks) and all(t["done"] for t in tasks)
    return {
        "date": ts,
        "weekday": clock.GUNLER[today.weekday()],
        "tasks": tasks,
        "reviews": due_reviews(con),
        "chain": logic.chain(con),
        "goal": one(con.execute("SELECT * FROM weekly_goals WHERE week_start=?", (ws,))),
        "notes": rows(con.execute("SELECT * FROM notes ORDER BY id DESC LIMIT 3")),
        "day": day,
        "excuses_left": max(0, logic.MAX_EXCUSES_PER_WEEK - logic.excuses_this_week(con, today)),
        # akşam kapanış sorusu: görevler bitince ya da 19:00'dan sonra, henüz cevaplanmadıysa
        "ask_reflection": not day.get("reflected_at") and not day.get("excused")
                          and (all_done or clock.now().hour >= 19 or clock.now().hour < 4),
    }


# ---------------------------------------------------------------- görevler

class TaskIn(BaseModel):
    date: str
    kind: str = Field(pattern="^(soru|tik|deneme)$")
    title: str | None = Field(default=None, max_length=120)
    subject_id: int | None = None
    topic_id: int | None = None
    target: int | None = Field(default=None, ge=0, le=1000)
    exam_type: str | None = Field(default=None, pattern="^(TYT|AYT)$")
    client_id: str | None = None


class TaskPatch(BaseModel):
    correct: int | None = Field(default=None, ge=0, le=1000)
    wrong: int | None = Field(default=None, ge=0, le=1000)
    blank: int | None = Field(default=None, ge=0, le=1000)
    closed: bool | None = None
    ticked: bool | None = None


def make_title(con, kind, subject_id, topic_id, exam_type, title):
    if title and title.strip():
        return title.strip()
    if kind == "deneme":
        return f"{exam_type or 'TYT'} denemesi"
    parts = []
    if topic_id:
        r = one(con.execute("SELECT " + TOPIC_NAME + " AS n FROM topics t LEFT JOIN topics tp ON tp.id=t.parent_id"
                            " WHERE t.id=?", (topic_id,)))
        if r:
            parts.append(r["n"])
    elif subject_id:
        r = one(con.execute("SELECT name FROM subjects WHERE id=?", (subject_id,)))
        if r:
            parts.append(r["name"])
    if not parts:
        raise HTTPException(400, "Görev için ders/konu ya da başlık seç")
    return parts[0]


def validate_refs(con, subject_id, topic_id):
    if topic_id:
        t = one(con.execute("SELECT subject_id FROM topics WHERE id=?", (topic_id,)))
        if not t:
            raise HTTPException(400, "Konu bulunamadı")
        if subject_id and t["subject_id"] != subject_id:
            raise HTTPException(400, "Konu seçilen derse ait değil")
        return t["subject_id"]
    return subject_id


@router.get("/gorevler")
def list_tasks(date: str, user=Depends(current_user), con=Depends(get_db)):
    clock.parse(date)
    return tasks_for(con, date)


@router.post("/gorevler")
def add_task(body: TaskIn, user=Depends(current_user), con=Depends(get_db)):
    if body.client_id:
        ex = one(con.execute("SELECT id FROM tasks WHERE client_id=?", (body.client_id,)))
        if ex:
            return ex
    d = clock.parse(body.date)
    if user["role"] == "ogrenci" and d < clock.today() - timedelta(days=clock.EDIT_WINDOW_DAYS):
        raise HTTPException(400, "Geçmiş tarihe görev eklenemez")
    subject_id = validate_refs(con, body.subject_id, body.topic_id)
    title = make_title(con, body.kind, subject_id, body.topic_id, body.exam_type, body.title)
    tid = con.execute(
        "INSERT INTO tasks(date,kind,title,subject_id,topic_id,target,exam_type,created_by,created_at,client_id)"
        " VALUES (?,?,?,?,?,?,?,?,?,?)",
        (body.date, body.kind, title, subject_id, body.topic_id, body.target, body.exam_type, user["id"],
         clock.stamp(), body.client_id)).lastrowid
    logic.refresh_task(con, tid)
    return {"id": tid}


@router.patch("/gorevler/{tid}")
def update_task(tid: int, body: TaskPatch, user=Depends(student_only), con=Depends(get_db)):
    t = one(con.execute("SELECT * FROM tasks WHERE id=?", (tid,)))
    if not t:
        raise HTTPException(404, "Görev bulunamadı")
    if not logic.student_can_edit(clock.parse(t["date"])):
        raise HTTPException(400, "Bu gün kilitlendi; 2 günden eski görevler değiştirilemez")
    fields = body.model_dump(exclude_none=True)
    if t["kind"] == "tik":
        fields = {k: v for k, v in fields.items() if k == "ticked"}
    elif t["kind"] == "soru":
        fields.pop("ticked", None)
    else:
        fields = {}
    for k, v in fields.items():
        con.execute(f"UPDATE tasks SET {k}=? WHERE id=?", (int(v), tid))
    t2 = one(con.execute("SELECT * FROM tasks WHERE id=?", (tid,)))
    if t2["kind"] == "soru" and t2["wrong"] + t2["blank"] == 0 and t2["closed"]:
        con.execute("UPDATE tasks SET closed=0 WHERE id=?", (tid,))
    logic.refresh_task(con, tid)
    return one(con.execute(TASK_SELECT + " WHERE k.id=?", (tid,)))


@router.delete("/gorevler/{tid}")
def delete_task(tid: int, user=Depends(current_user), con=Depends(get_db)):
    t = one(con.execute("SELECT * FROM tasks WHERE id=?", (tid,)))
    if not t:
        raise HTTPException(404, "Görev bulunamadı")
    if t["program_item_id"]:
        raise HTTPException(400, "Programdan gelen görev buradan silinmez; haftalık programdan kaldır")
    if t["created_by"] != user["id"]:
        raise HTTPException(403, "Sadece kendi eklediğin görevi silebilirsin")
    if logic.task_has_progress(t) and user["role"] != "ogrenci":
        raise HTTPException(400, "Öğrenci bu göreve başlamış, silinemez")
    con.execute("UPDATE mistakes SET task_id=NULL WHERE task_id=?", (tid,))
    con.execute("DELETE FROM tasks WHERE id=?", (tid,))
    return {"ok": True}


# ---------------------------------------------------------------- haftalık program (kalıcı)

class ProgramIn(BaseModel):
    weekdays: list[int] = Field(min_length=1)
    kind: str = Field(pattern="^(soru|tik|deneme)$")
    title: str | None = Field(default=None, max_length=120)
    subject_id: int | None = None
    topic_id: int | None = None
    target: int | None = Field(default=None, ge=0, le=1000)
    exam_type: str | None = Field(default=None, pattern="^(TYT|AYT)$")


@router.get("/program")
def get_program(user=Depends(current_user), con=Depends(get_db)):
    ts = clock.iso(clock.today())
    items = rows(con.execute(
        "SELECT p.*, s.name AS subject, " + TOPIC_NAME + " AS topic FROM program_items p"
        " LEFT JOIN subjects s ON s.id=p.subject_id LEFT JOIN topics t ON t.id=p.topic_id"
        " LEFT JOIN topics tp ON tp.id=t.parent_id WHERE p.valid_to IS NULL OR p.valid_to>?"
        " ORDER BY p.weekday, p.id", (ts,)))
    days = [{"weekday": i, "name": n, "items": [x for x in items if x["weekday"] == i]}
            for i, n in enumerate(clock.GUNLER)]
    one_offs = rows(con.execute(TASK_SELECT + " WHERE k.program_item_id IS NULL AND k.date>=? ORDER BY k.date, k.id",
                                (ts,)))
    return {"days": days, "one_offs": one_offs}


@router.post("/program")
def add_program(body: ProgramIn, user=Depends(coach_only), con=Depends(get_db)):
    if any(w < 0 or w > 6 for w in body.weekdays):
        raise HTTPException(400, "Geçersiz gün")
    subject_id = validate_refs(con, body.subject_id, body.topic_id)
    title = make_title(con, body.kind, subject_id, body.topic_id, body.exam_type, body.title)
    ids = []
    for wd in sorted(set(body.weekdays)):
        ids.append(con.execute(
            "INSERT INTO program_items(weekday,kind,title,subject_id,topic_id,target,exam_type,valid_from,"
            "created_by,created_at) VALUES (?,?,?,?,?,?,?,?,?,?)",
            (wd, body.kind, title, subject_id, body.topic_id, body.target, body.exam_type,
             clock.iso(clock.today()), user["id"], clock.stamp())).lastrowid)
    return {"ids": ids}


@router.delete("/program/{pid}")
def remove_program(pid: int, user=Depends(coach_only), con=Depends(get_db)):
    p = one(con.execute("SELECT * FROM program_items WHERE id=?", (pid,)))
    if not p:
        raise HTTPException(404, "Program maddesi bulunamadı")
    ts = clock.iso(clock.today())
    if p["valid_from"] >= ts:
        # bugün eklenip bugün kaldırıldıysa iz bırakmadan sil (başlanmamışsa)
        t = one(con.execute("SELECT * FROM tasks WHERE program_item_id=?", (pid,)))
        if t and logic.task_has_progress(t):
            con.execute("UPDATE program_items SET valid_to=? WHERE id=?",
                        (clock.iso(clock.today() + timedelta(days=1)), pid))
            return {"ok": True}
        con.execute("DELETE FROM tasks WHERE program_item_id=?", (pid,))
        con.execute("DELETE FROM program_items WHERE id=?", (pid,))
        return {"ok": True}
    con.execute("UPDATE program_items SET valid_to=? WHERE id=?", (ts, pid))
    t = one(con.execute("SELECT * FROM tasks WHERE program_item_id=? AND date=?", (pid, ts)))
    if t and not logic.task_has_progress(t):
        con.execute("DELETE FROM tasks WHERE id=?", (t["id"],))
    elif t:  # öğrenci bugün başlamışsa bugünkü görev kalsın
        con.execute("UPDATE program_items SET valid_to=? WHERE id=?", (clock.iso(clock.today() + timedelta(days=1)), pid))
    return {"ok": True}


# ---------------------------------------------------------------- gün: mazeret ve akşam kapanışı

class ExcuseIn(BaseModel):
    date: str | None = None
    excuse: str = Field(min_length=1, max_length=120)


class ReflectionIn(BaseModel):
    date: str | None = None
    subject_id: int | None = None
    topic_id: int | None = None
    note: str | None = Field(default=None, max_length=300)
    none: bool = False


def _ensure_day(con, ds):
    con.execute("INSERT OR IGNORE INTO days(date) VALUES (?)", (ds,))


@router.post("/gun/mazeret")
def set_excuse(body: ExcuseIn, user=Depends(student_only), con=Depends(get_db)):
    d = clock.parse(body.date) if body.date else clock.today()
    if not logic.student_can_edit(d):
        raise HTTPException(400, "Bu gün için mazeret girilemez")
    if logic.excuses_this_week(con, d) >= logic.MAX_EXCUSES_PER_WEEK:
        raise HTTPException(400, "Bu hafta mazeret hakkını kullandın (haftada 1 gün)")
    ds = clock.iso(d)
    _ensure_day(con, ds)
    con.execute("UPDATE days SET excused=1, excuse=? WHERE date=?", (body.excuse.strip(), ds))
    return {"ok": True}


@router.delete("/gun/mazeret")
def clear_excuse(date: str | None = None, user=Depends(student_only), con=Depends(get_db)):
    ds = date or clock.iso(clock.today())
    if not logic.student_can_edit(clock.parse(ds)):
        raise HTTPException(400, "Bu gün kilitlendi")
    con.execute("UPDATE days SET excused=0, excuse=NULL WHERE date=?", (ds,))
    return {"ok": True}


@router.post("/gun/kapanis")
def set_reflection(body: ReflectionIn, user=Depends(student_only), con=Depends(get_db)):
    d = clock.parse(body.date) if body.date else clock.today()
    if not logic.student_can_edit(d):
        raise HTTPException(400, "Bu gün kilitlendi")
    ds = clock.iso(d)
    subject_id = validate_refs(con, body.subject_id, body.topic_id)
    _ensure_day(con, ds)
    con.execute("UPDATE days SET hard_subject_id=?, hard_topic_id=?, reflection=?, reflected_at=? WHERE date=?",
                (None if body.none else subject_id, None if body.none else body.topic_id,
                 "Zorlanmadım" if body.none and not body.note else (body.note or None), clock.stamp(), ds))
    return {"ok": True}


# ---------------------------------------------------------------- geçmiş

@router.get("/gecmis")
def history(month: str, user=Depends(current_user), con=Depends(get_db)):
    """month: YYYY-MM -> o ayın günlerinin zincir renkleri."""
    first = clock.parse(month + "-01")
    nxt = (first.replace(day=28) + timedelta(days=4)).replace(day=1)
    states = logic.day_states(con, first, nxt - timedelta(days=1))
    return {"month": month, "days": list(states.values()), "chain": logic.chain(con)}


@router.get("/gun/{ds}")
def day_detail(ds: str, user=Depends(current_user), con=Depends(get_db)):
    d = clock.parse(ds)
    state = logic.day_states(con, d, d)[ds]
    day = one(con.execute(
        "SELECT d.*, s.name AS hard_subject, " + TOPIC_NAME + " AS hard_topic FROM days d"
        " LEFT JOIN subjects s ON s.id=d.hard_subject_id LEFT JOIN topics t ON t.id=d.hard_topic_id"
        " LEFT JOIN topics tp ON tp.id=t.parent_id WHERE d.date=?", (ds,))) or {}
    return {
        "date": ds,
        "weekday": clock.GUNLER[d.weekday()],
        "state": state,
        "tasks": tasks_for(con, ds) if d <= clock.today() else [],
        "mistakes": rows(con.execute(MISTAKE_SELECT + " WHERE m.created_date=? ORDER BY m.id", (ds,))),
        "reviews": rows(con.execute(
            "SELECT r.*, m2.subject, m2.topic FROM reviews r JOIN (" + MISTAKE_SELECT + ") m2 ON m2.id=r.mistake_id"
            " WHERE r.due_date=? OR r.done_date=? ORDER BY r.id", (ds, ds))),
        "exams": rows(con.execute("SELECT * FROM exams WHERE date=?", (ds,))),
        "day": day,
    }


# ---------------------------------------------------------------- hata defteri

class MistakeIn(BaseModel):
    client_id: str | None = None
    subject_id: int
    topic_id: int | None = None
    kind: str = Field(default="yanlis", pattern="^(yanlis|bos)$")
    reason: str
    note: str | None = Field(default=None, max_length=500)
    photo: str | None = None
    solution_photo: str | None = None
    source_id: int | None = None
    page: str | None = Field(default=None, max_length=10)
    qno: str | None = Field(default=None, max_length=10)
    origin: str = Field(default="serbest", pattern="^(serbest|gorev|deneme)$")
    task_id: int | None = None
    exam_id: int | None = None
    date: str | None = None


class MistakePatch(BaseModel):
    note: str | None = Field(default=None, max_length=500)
    solution_photo: str | None = None
    photo: str | None = None


@router.post("/hatalar")
def add_mistake(body: MistakeIn, user=Depends(student_only), con=Depends(get_db)):
    if body.client_id:
        ex = one(con.execute("SELECT id FROM mistakes WHERE client_id=?", (body.client_id,)))
        if ex:
            return ex
    reasons = REASONS_YANLIS if body.kind == "yanlis" else REASONS_BOS
    if body.reason not in reasons:
        raise HTTPException(400, "Sebep listede yok")
    subject_id = validate_refs(con, body.subject_id, body.topic_id)
    d = clock.parse(body.date) if body.date else clock.today()
    if not logic.student_can_edit(d):
        d = clock.today()
    if body.task_id and not one(con.execute("SELECT id FROM tasks WHERE id=?", (body.task_id,))):
        body.task_id = None
    if body.exam_id and not one(con.execute("SELECT id FROM exams WHERE id=?", (body.exam_id,))):
        body.exam_id = None
    mid = con.execute(
        "INSERT INTO mistakes(subject_id,topic_id,kind,reason,note,photo,solution_photo,source_id,page,qno,origin,"
        "task_id,exam_id,created_date,created_at,client_id) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
        (subject_id, body.topic_id, body.kind, body.reason, (body.note or "").strip() or None,
         save_photo(body.photo), save_photo(body.solution_photo), body.source_id, body.page, body.qno,
         body.origin, body.task_id, body.exam_id, clock.iso(d), clock.stamp(), body.client_id)).lastrowid
    logic.schedule_first_review(con, mid, d)
    return {"id": mid}


@router.get("/hatalar")
def list_mistakes(subject_id: int | None = None, topic_id: int | None = None, status: str | None = None,
                  task_id: int | None = None, exam_id: int | None = None, limit: int = 100, offset: int = 0,
                  user=Depends(current_user), con=Depends(get_db)):
    where, args = [], []
    if subject_id:
        where.append("m.subject_id=?"); args.append(subject_id)
    if topic_id:
        where.append("(m.topic_id=? OR t.parent_id=?)"); args += [topic_id, topic_id]
    if status in ("acik", "kapandi"):
        where.append("m.status=?"); args.append(status)
    if task_id:
        where.append("m.task_id=?"); args.append(task_id)
    if exam_id:
        where.append("m.exam_id=?"); args.append(exam_id)
    sql = MISTAKE_SELECT + (" WHERE " + " AND ".join(where) if where else "") + " ORDER BY m.id DESC LIMIT ? OFFSET ?"
    items = rows(con.execute(sql, args + [min(limit, 500), offset]))
    ids = [m["id"] for m in items]
    nxt = {}
    if ids:
        for r in con.execute("SELECT mistake_id, due_date FROM reviews WHERE done_date IS NULL AND mistake_id IN (%s)"
                             % ",".join("?" * len(ids)), ids):
            nxt[r[0]] = r[1]
    for m in items:
        m["next_review"] = nxt.get(m["id"])
    return items


@router.get("/hatalar/{mid}")
def get_mistake(mid: int, user=Depends(current_user), con=Depends(get_db)):
    m = one(con.execute(MISTAKE_SELECT + " WHERE m.id=?", (mid,)))
    if not m:
        raise HTTPException(404, "Kayıt bulunamadı")
    m["reviews"] = rows(con.execute("SELECT * FROM reviews WHERE mistake_id=? ORDER BY id", (mid,)))
    return m


@router.patch("/hatalar/{mid}")
def edit_mistake(mid: int, body: MistakePatch, user=Depends(student_only), con=Depends(get_db)):
    if not one(con.execute("SELECT id FROM mistakes WHERE id=?", (mid,))):
        raise HTTPException(404, "Kayıt bulunamadı")
    if body.note is not None:
        con.execute("UPDATE mistakes SET note=? WHERE id=?", (body.note.strip() or None, mid))
    if body.solution_photo:
        con.execute("UPDATE mistakes SET solution_photo=? WHERE id=?", (save_photo(body.solution_photo), mid))
    if body.photo:
        con.execute("UPDATE mistakes SET photo=? WHERE id=?", (save_photo(body.photo), mid))
    return {"ok": True}


@router.delete("/hatalar/{mid}")
def delete_mistake(mid: int, user=Depends(student_only), con=Depends(get_db)):
    m = one(con.execute("SELECT * FROM mistakes WHERE id=?", (mid,)))
    if not m:
        raise HTTPException(404, "Kayıt bulunamadı")
    if m["created_date"] < clock.iso(clock.today() - timedelta(days=clock.EDIT_WINDOW_DAYS)):
        raise HTTPException(400, "Eski kayıtlar silinemez")
    con.execute("DELETE FROM reviews WHERE mistake_id=?", (mid,))
    con.execute("DELETE FROM mistakes WHERE id=?", (mid,))
    return {"ok": True}


# ---------------------------------------------------------------- tekrarlar

class ReviewIn(BaseModel):
    result: str = Field(pattern="^(cozdum|yapamadim)$")


@router.post("/tekrar/{rid}")
def do_review(rid: int, body: ReviewIn, user=Depends(student_only), con=Depends(get_db)):
    r = one(con.execute("SELECT * FROM reviews WHERE id=?", (rid,)))
    if not r:
        raise HTTPException(404, "Tekrar bulunamadı")
    if r["done_date"]:
        return {"ok": True, "already": True}
    if r["due_date"] > clock.iso(clock.today()):
        raise HTTPException(400, "Bu tekrarın günü henüz gelmedi")
    logic.mark_review(con, r, body.result)
    nxt = one(con.execute("SELECT due_date FROM reviews WHERE mistake_id=? AND done_date IS NULL", (r["mistake_id"],)))
    return {"ok": True, "next_due": nxt["due_date"] if nxt else None}
