"""Deneme takibi: TYT/AYT girişi, net hesabı (4 yanlış 1 doğruyu götürür), ders bazında trend."""
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from . import clock, logic
from .api_core import save_photo
from .auth import current_user, student_only
from .db import get_db, one, rows
from .seed import EXAM_GROUP_LIMITS, EXAM_SECTIONS

router = APIRouter(prefix="/api")


def net(c: int, w: int) -> float:
    return round(c - w / 4, 2)


class Counts(BaseModel):
    correct: int = Field(default=0, ge=0, le=40)
    wrong: int = Field(default=0, ge=0, le=40)
    blank: int = Field(default=0, ge=0, le=40)


class ExamIn(BaseModel):
    client_id: str | None = None
    type: str = Field(pattern="^(TYT|AYT)$")
    date: str | None = None
    source_id: int | None = None
    name: str | None = Field(default=None, max_length=80)
    photo: str | None = None
    results: dict[str, Counts]


def exam_with_results(con, e: dict) -> dict:
    res = {r["section"]: r for r in rows(con.execute("SELECT * FROM exam_results WHERE exam_id=?", (e["id"],)))}
    sections = []
    total = 0.0
    for key, name, mx, subj in EXAM_SECTIONS[e["type"]]:
        r = res.get(key, {"correct": 0, "wrong": 0, "blank": 0})
        n = net(r["correct"], r["wrong"])
        total += n
        sections.append({"key": key, "name": name, "max": mx, "subject_code": subj, "correct": r["correct"],
                         "wrong": r["wrong"], "blank": r["blank"], "net": n})
    e["sections"] = sections
    e["total_net"] = round(total, 2)
    e["mistakes_logged"] = con.execute("SELECT COUNT(*) FROM mistakes WHERE exam_id=?", (e["id"],)).fetchone()[0]
    return e


@router.post("/denemeler")
def add_exam(body: ExamIn, user=Depends(student_only), con=Depends(get_db)):
    if body.client_id:
        ex = one(con.execute("SELECT id FROM exams WHERE client_id=?", (body.client_id,)))
        if ex:
            return ex
    caps = {k: mx for k, _, mx, _ in EXAM_SECTIONS[body.type]}
    for key, c in body.results.items():
        if key not in caps:
            raise HTTPException(400, f"Bilinmeyen bölüm: {key}")
        if c.correct + c.wrong + c.blank > caps[key]:
            raise HTTPException(400, f"{key}: toplam {caps[key]} soruyu geçemez")
    for keys, limit in EXAM_GROUP_LIMITS.get(body.type, []):
        s = sum(body.results[k].correct + body.results[k].wrong + body.results[k].blank
                for k in keys if k in body.results)
        if s > limit:
            raise HTTPException(400, f"Matematik + geometri toplamı {limit} soruyu geçemez")
    d = clock.parse(body.date) if body.date else clock.today()
    if d > clock.today():
        raise HTTPException(400, "İleri tarihli deneme girilemez")
    eid = con.execute("INSERT INTO exams(type,date,source_id,name,photo,created_at,client_id) VALUES (?,?,?,?,?,?,?)",
                      (body.type, clock.iso(d), body.source_id, (body.name or "").strip() or None,
                       save_photo(body.photo), clock.stamp(), body.client_id)).lastrowid
    for key, c in body.results.items():
        con.execute("INSERT INTO exam_results(exam_id,section,correct,wrong,blank) VALUES (?,?,?,?,?)",
                    (eid, key, c.correct, c.wrong, c.blank))
    for t in con.execute("SELECT id FROM tasks WHERE kind='deneme' AND date=?", (clock.iso(d),)).fetchall():
        logic.refresh_task(con, t[0])
    return {"id": eid}


@router.get("/denemeler")
def list_exams(type: str | None = None, user=Depends(current_user), con=Depends(get_db)):
    q = "SELECT e.*, s.name AS source FROM exams e LEFT JOIN sources s ON s.id=e.source_id"
    args = []
    if type in ("TYT", "AYT"):
        q += " WHERE e.type=?"
        args.append(type)
    q += " ORDER BY e.date DESC, e.id DESC LIMIT 200"
    return [exam_with_results(con, e) for e in rows(con.execute(q, args))]


@router.get("/denemeler/{eid}")
def get_exam(eid: int, user=Depends(current_user), con=Depends(get_db)):
    e = one(con.execute("SELECT e.*, s.name AS source FROM exams e LEFT JOIN sources s ON s.id=e.source_id"
                        " WHERE e.id=?", (eid,)))
    if not e:
        raise HTTPException(404, "Deneme bulunamadı")
    return exam_with_results(con, e)


@router.delete("/denemeler/{eid}")
def delete_exam(eid: int, user=Depends(student_only), con=Depends(get_db)):
    e = one(con.execute("SELECT * FROM exams WHERE id=?", (eid,)))
    if not e:
        raise HTTPException(404, "Deneme bulunamadı")
    con.execute("UPDATE mistakes SET exam_id=NULL WHERE exam_id=?", (eid,))
    con.execute("DELETE FROM exams WHERE id=?", (eid,))
    for t in con.execute("SELECT id FROM tasks WHERE kind='deneme' AND date=?", (e["date"],)).fetchall():
        logic.refresh_task(con, t[0])
    return {"ok": True}


def trend(con, exam_type: str, limit: int = 12) -> dict:
    exams = rows(con.execute("SELECT * FROM exams WHERE type=? ORDER BY date DESC, id DESC LIMIT ?",
                             (exam_type, limit)))[::-1]
    exams = [exam_with_results(con, e) for e in exams]
    series = {}
    for key, name, _, _ in EXAM_SECTIONS[exam_type]:
        series[key] = {"name": name, "points": [s["net"] for e in exams for s in e["sections"] if s["key"] == key]}
    return {"type": exam_type, "dates": [e["date"] for e in exams], "labels": [e.get("name") or "" for e in exams],
            "series": series, "total": [e["total_net"] for e in exams]}


@router.get("/net-trend")
def net_trend(user=Depends(current_user), con=Depends(get_db)):
    return {"TYT": trend(con, "TYT"), "AYT": trend(con, "AYT")}
