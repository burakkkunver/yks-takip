"""Takipçi ekranı: haftalık özet, konu ısı haritası, notlar, haftalık hedef, WhatsApp metni, CSV."""
import csv
import io
from collections import Counter
from datetime import timedelta

from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from . import clock, logic
from .api_daily import MISTAKE_SELECT, TASK_SELECT, TOPIC_NAME
from .api_exams import trend
from .auth import coach_only, current_user, student_only
from .db import get_db, one, rows

router = APIRouter(prefix="/api")


def week_bounds(week: str | None):
    ws = clock.week_start(clock.parse(week) if week else clock.today())
    return ws, ws + timedelta(days=6)


def build_summary(con, week: str | None = None) -> dict:
    today = clock.today()
    ws, we = week_bounds(week)
    upto = min(we, today)
    s, e, u = clock.iso(ws), clock.iso(we), clock.iso(upto)
    logic.materialize(con, ws, upto)
    tasks = rows(con.execute(TASK_SELECT + " WHERE k.date BETWEEN ? AND ? ORDER BY k.date, k.id", (s, u))) \
        if ws <= today else []
    done = [t for t in tasks if t["completed_at"]]

    # kapatma oranı: görevlerdeki yanlış/boşların ne kadarı "kapatıldı" işaretli
    q_tasks = [t for t in tasks if t["kind"] == "soru"]
    to_close = sum(t["wrong"] + t["blank"] for t in q_tasks)
    closed = sum(t["wrong"] + t["blank"] for t in q_tasks if t["closed"])
    unclosed = [t for t in q_tasks if t["wrong"] + t["blank"] > 0 and not t["closed"]]
    not_started = [t for t in tasks if not logic.task_has_progress(t) and t["date"] < clock.iso(today)]

    # programa uyum: ders bazında
    per_subject: dict = {}
    for t in tasks:
        k = t["subject"] or ("Deneme" if t["kind"] == "deneme" else "Diğer")
        d = per_subject.setdefault(k, {"subject": k, "total": 0, "done": 0})
        d["total"] += 1
        d["done"] += 1 if t["completed_at"] else 0
    adherence = sorted(per_subject.values(), key=lambda x: (x["done"] / x["total"], -x["total"]))
    most_skipped = next((a for a in adherence if a["done"] < a["total"]), None)

    week_mistakes = rows(con.execute(MISTAKE_SELECT + " WHERE m.created_date BETWEEN ? AND ?", (s, e)))
    top_topics = rows(con.execute(
        "SELECT m.topic_id AS id, s.name AS subject, m.subject_id, " + TOPIC_NAME + " AS topic, COUNT(*) AS count,"
        " SUM(m.status='acik') AS open_count, SUM(m.created_date BETWEEN ? AND ?) AS this_week"
        " FROM mistakes m JOIN subjects s ON s.id=m.subject_id LEFT JOIN topics t ON t.id=m.topic_id"
        " LEFT JOIN topics tp ON tp.id=t.parent_id GROUP BY m.topic_id ORDER BY count DESC, open_count DESC LIMIT 5",
        (s, e)))
    reasons_all = Counter(r[0] for r in con.execute("SELECT reason FROM mistakes"))
    reasons_week = Counter(m["reason"] for m in week_mistakes)

    ts = clock.iso(today)
    missed_reviews = rows(con.execute(
        "SELECT r.id, r.due_date, m2.subject, m2.topic, m2.reason FROM reviews r JOIN (" + MISTAKE_SELECT +
        ") m2 ON m2.id=r.mistake_id WHERE r.done_date IS NULL AND r.due_date<? ORDER BY r.due_date", (ts,)))
    pending_today = con.execute("SELECT COUNT(*) FROM reviews WHERE done_date IS NULL AND due_date=?",
                                (ts,)).fetchone()[0]
    upcoming = con.execute("SELECT COUNT(*) FROM reviews WHERE done_date IS NULL AND due_date>?", (ts,)).fetchone()[0]
    rev_week = rows(con.execute("SELECT result FROM reviews WHERE done_date BETWEEN ? AND ?", (s, e)))

    reflections = rows(con.execute(
        "SELECT d.date, d.reflection, d.excused, d.excuse, s.name AS subject, " + TOPIC_NAME + " AS topic FROM days d"
        " LEFT JOIN subjects s ON s.id=d.hard_subject_id LEFT JOIN topics t ON t.id=d.hard_topic_id"
        " LEFT JOIN topics tp ON tp.id=t.parent_id WHERE d.date BETWEEN ? AND ?"
        " AND (d.reflected_at IS NOT NULL OR d.excused=1) ORDER BY d.date", (s, e)))

    suggestions = rows(con.execute(
        "SELECT m.subject_id, m.topic_id, s.name AS subject, " + TOPIC_NAME + " AS topic, COUNT(*) AS open_count,"
        " SUM(m.fail_count) AS fails FROM mistakes m JOIN subjects s ON s.id=m.subject_id"
        " LEFT JOIN topics t ON t.id=m.topic_id LEFT JOIN topics tp ON tp.id=t.parent_id"
        " WHERE m.status='acik' GROUP BY m.topic_id ORDER BY fails DESC, open_count DESC LIMIT 8"))

    exams_week = rows(con.execute("SELECT * FROM exams WHERE date BETWEEN ? AND ? ORDER BY date", (s, e)))
    return {
        "week_start": s, "week_end": e, "today": ts,
        "tasks_total": len(tasks), "tasks_done": len(done),
        "close_total": to_close, "close_done": closed,
        "close_rate": round(100 * closed / to_close) if to_close else None,
        "unclosed": unclosed,
        "not_started": not_started,
        "adherence": adherence,
        "adherence_rate": round(100 * len(done) / len(tasks)) if tasks else None,
        "most_skipped": most_skipped,
        "mistakes_week": len(week_mistakes),
        "mistakes_week_kind": Counter(m["kind"] for m in week_mistakes),
        "top_topics": top_topics,
        "reasons_week": reasons_week.most_common(),
        "reasons_all": reasons_all.most_common(),
        "missed_reviews": missed_reviews,
        "pending_reviews_today": pending_today,
        "upcoming_reviews": upcoming,
        "reviews_week": {"cozdum": sum(1 for r in rev_week if r["result"] == "cozdum"),
                         "yapamadim": sum(1 for r in rev_week if r["result"] == "yapamadim")},
        "stuck": logic.stuck_topics(con),
        "chain": logic.chain(con),
        "week_days": list(logic.day_states(con, ws, we).values()),
        "reflections": reflections,
        "goal": one(con.execute("SELECT * FROM weekly_goals WHERE week_start=?", (s,))),
        "next_goal": one(con.execute("SELECT * FROM weekly_goals WHERE week_start=?",
                                     (clock.iso(ws + timedelta(days=7)),))),
        "suggestions": suggestions,
        "exams_week": exams_week,
        "trend": {"TYT": trend(con, "TYT", 8), "AYT": trend(con, "AYT", 8)},
        "notes": rows(con.execute("SELECT * FROM notes ORDER BY id DESC LIMIT 5")),
    }


@router.get("/ozet")
def summary(week: str | None = None, user=Depends(current_user), con=Depends(get_db)):
    return build_summary(con, week)


@router.get("/isi-haritasi")
def heat(user=Depends(current_user), con=Depends(get_db)):
    return logic.topic_heat(con)


# ---------------------------------------------------------------- notlar

class NoteIn(BaseModel):
    text: str = Field(min_length=1, max_length=500)


@router.post("/notlar")
def add_note(body: NoteIn, user=Depends(coach_only), con=Depends(get_db)):
    nid = con.execute("INSERT INTO notes(text,created_at) VALUES (?,?)", (body.text.strip(), clock.stamp())).lastrowid
    return {"id": nid}


@router.delete("/notlar/{nid}")
def delete_note(nid: int, user=Depends(coach_only), con=Depends(get_db)):
    con.execute("DELETE FROM notes WHERE id=?", (nid,))
    return {"ok": True}


@router.post("/notlar/{nid}/okundu")
def read_note(nid: int, user=Depends(student_only), con=Depends(get_db)):
    con.execute("UPDATE notes SET read_at=? WHERE id=? AND read_at IS NULL", (clock.stamp(), nid))
    return {"ok": True}


# ---------------------------------------------------------------- haftalık hedef

class GoalIn(BaseModel):
    week_start: str
    text: str = Field(min_length=1, max_length=200)


class GoalResult(BaseModel):
    result: str | None = Field(default=None, pattern="^(tuttu|tutmadi)$")


@router.put("/hedef")
def set_goal(body: GoalIn, user=Depends(coach_only), con=Depends(get_db)):
    ws = clock.iso(clock.week_start(clock.parse(body.week_start)))
    con.execute("INSERT INTO weekly_goals(week_start,text) VALUES (?,?) ON CONFLICT(week_start) DO UPDATE SET text=?",
                (ws, body.text.strip(), body.text.strip()))
    return {"week_start": ws}


@router.post("/hedef/{ws}/sonuc")
def goal_result(ws: str, body: GoalResult, user=Depends(coach_only), con=Depends(get_db)):
    if not one(con.execute("SELECT 1 FROM weekly_goals WHERE week_start=?", (ws,))):
        raise HTTPException(404, "Bu hafta için hedef yok")
    con.execute("UPDATE weekly_goals SET result=? WHERE week_start=?", (body.result, ws))
    return {"ok": True}


# ---------------------------------------------------------------- WhatsApp özeti

def fmt_date(ds: str) -> str:
    d = clock.parse(ds)
    aylar = ["Oca", "Şub", "Mar", "Nis", "May", "Haz", "Tem", "Ağu", "Eyl", "Eki", "Kas", "Ara"]
    return f"{d.day} {aylar[d.month - 1]}"


@router.get("/whatsapp")
def whatsapp(week: str | None = None, user=Depends(current_user), con=Depends(get_db)):
    sm = build_summary(con, week)
    lines = [f"📚 YKS haftalık özet ({fmt_date(sm['week_start'])} - {fmt_date(sm['week_end'])})", ""]
    if sm["close_rate"] is not None:
        lines.append(f"✅ Yanlış kapatma: {sm['close_done']}/{sm['close_total']} (%{sm['close_rate']})")
    lines.append(f"📋 Görevler: {sm['tasks_done']}/{sm['tasks_total']} tamamlandı")
    lines.append(f"🔗 Zincir: {sm['chain']['current']} gün (rekor {sm['chain']['best']})")
    if sm["unclosed"]:
        lines.append(f"🔴 Yanlışı kapatılmamış görev: {len(sm['unclosed'])}")
    if sm["missed_reviews"]:
        lines.append(f"⏰ Kaçırılmış tekrar: {len(sm['missed_reviews'])}")
    rw = sm["reviews_week"]
    if rw["cozdum"] or rw["yapamadim"]:
        lines.append(f"🔁 Tekrarlar: {rw['cozdum']} çözdü, {rw['yapamadim']} yine yapamadı")
    if sm["top_topics"]:
        lines += ["", "En çok hata biriken konular:"]
        lines += [f"• {t['subject']} – {t['topic'] or 'Konu yok'} ({t['count']})" for t in sm["top_topics"][:5]]
    if sm["stuck"]:
        lines += ["", "Takıldığı konular: " + ", ".join(t["name"] for t in sm["stuck"][:5])]
    for typ in ("TYT", "AYT"):
        tr = sm["trend"][typ]
        if tr["total"]:
            last = tr["total"][-3:]
            lines.append(f"📈 {typ} son netler: " + " → ".join(f"{x:g}" for x in last))
    if sm["goal"]:
        res = {"tuttu": " ✅", "tutmadi": " ❌"}.get(sm["goal"]["result"] or "", "")
        lines += ["", f"🎯 Haftanın hedefi: {sm['goal']['text']}{res}"]
    return {"text": "\n".join(lines)}


# ---------------------------------------------------------------- CSV dışa aktarma

def _csv(name: str, header: list[str], data: list[list]):
    buf = io.StringIO()
    buf.write("﻿")  # Excel Türkçe karakterleri doğru açsın
    w = csv.writer(buf, delimiter=";")
    w.writerow(header)
    w.writerows(data)
    buf.seek(0)
    return StreamingResponse(iter([buf.getvalue()]), media_type="text/csv; charset=utf-8",
                             headers={"Content-Disposition": f'attachment; filename="{name}"'})


@router.get("/disari/{kind}.csv")
def export(kind: str, user=Depends(current_user), con=Depends(get_db)):
    if kind == "hatalar":
        data = rows(con.execute(MISTAKE_SELECT + " ORDER BY m.id"))
        return _csv("hatalar.csv", ["Tarih", "Ders", "Konu", "Tür", "Sebep", "Not", "Kaynak", "Sayfa", "Soru",
                                    "Durum", "Yine yapamadım"],
                    [[m["created_date"], m["subject"], m["topic"], "Yanlış" if m["kind"] == "yanlis" else "Boş",
                      m["reason"], m["note"], m["source"], m["page"], m["qno"],
                      "Kapandı" if m["status"] == "kapandi" else "Açık", m["fail_count"]] for m in data])
    if kind == "gorevler":
        logic.materialize(con, logic.start_date(con), clock.today())
        data = rows(con.execute(TASK_SELECT + " ORDER BY k.date, k.id"))
        return _csv("gorevler.csv", ["Tarih", "Görev", "Tür", "Ders", "Konu", "Hedef", "Doğru", "Yanlış", "Boş",
                                     "Yanlışlar kapatıldı", "Tamamlandı"],
                    [[t["date"], t["title"], t["kind"], t["subject"], t["topic"], t["target"], t["correct"],
                      t["wrong"], t["blank"], "Evet" if t["closed"] else "", "Evet" if t["completed_at"] else ""]
                     for t in data])
    if kind == "denemeler":
        from .api_exams import exam_with_results
        out = []
        for e in rows(con.execute("SELECT e.*, s.name AS source FROM exams e LEFT JOIN sources s ON s.id=e.source_id"
                                  " ORDER BY e.date")):
            e = exam_with_results(con, e)
            for sec in e["sections"]:
                out.append([e["date"], e["type"], e["source"] or e["name"], sec["name"], sec["correct"],
                            sec["wrong"], sec["blank"], str(sec["net"]).replace(".", ",")])
        return _csv("denemeler.csv", ["Tarih", "Tür", "Yayın", "Ders", "Doğru", "Yanlış", "Boş", "Net"], out)
    raise HTTPException(404)
