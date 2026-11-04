"""Giriş, sabit listeler (ders/konu/sebep/kaynak) ve fotoğraflar."""
import base64
import os
import re
import secrets

from fastapi import APIRouter, Depends, HTTPException, Response
from fastapi.responses import FileResponse
from pydantic import BaseModel, Field

from . import clock
from .auth import COOKIE, SESSION_DAYS, coach_only, create_session, current_user, verify_password
from .db import PHOTO_DIR, get_db, one, rows
from .seed import EXAM_SECTIONS, REASONS_BOS, REASONS_YANLIS

router = APIRouter(prefix="/api")


class LoginIn(BaseModel):
    username: str
    password: str


@router.post("/giris")
def login(body: LoginIn, response: Response, con=Depends(get_db)):
    u = one(con.execute("SELECT * FROM users WHERE username=?", (body.username.strip().lower(),)))
    if not u or not verify_password(body.password, u["pw_hash"]):
        raise HTTPException(401, "Kullanıcı adı veya şifre hatalı")
    token = create_session(con, u["id"])
    response.set_cookie(COOKIE, token, max_age=SESSION_DAYS * 86400, httponly=True, samesite="lax",
                        secure=os.environ.get("YKS_SECURE_COOKIE", "1") == "1")
    return {"id": u["id"], "username": u["username"], "role": u["role"], "display_name": u["display_name"]}


@router.post("/cikis")
def logout(response: Response):
    response.delete_cookie(COOKIE)
    return {"ok": True}


@router.get("/ben")
def me(user=Depends(current_user)):
    return {**user, "today": clock.iso(clock.today())}


@router.get("/meta")
def meta(user=Depends(current_user), con=Depends(get_db)):
    subjects = rows(con.execute("SELECT id,code,name FROM subjects WHERE hidden=0 ORDER BY sort"))
    topics = rows(con.execute("SELECT id,subject_id,parent_id,name FROM topics WHERE hidden=0 ORDER BY sort,id"))
    by_parent: dict = {}
    for t in topics:
        by_parent.setdefault(t["parent_id"], []).append(t)
    for s in subjects:
        s["topics"] = [{**t, "children": by_parent.get(t["id"], [])}
                       for t in by_parent.get(None, []) if t["subject_id"] == s["id"]]
    # son kullanılanlar listenin başına gelsin diye
    recent_subjects = [r[0] for r in con.execute(
        "SELECT subject_id FROM mistakes GROUP BY subject_id ORDER BY MAX(id) DESC LIMIT 5")]
    recent_topics = [r[0] for r in con.execute(
        "SELECT topic_id FROM mistakes WHERE topic_id IS NOT NULL GROUP BY topic_id ORDER BY MAX(id) DESC LIMIT 30")]
    sources = rows(con.execute("SELECT id,kind,name FROM sources WHERE hidden=0 ORDER BY name"))
    exam_sections = {k: [{"key": a, "name": b, "max": c, "subject_code": d} for a, b, c, d in v]
                     for k, v in EXAM_SECTIONS.items()}
    return {
        "subjects": subjects,
        "recent_subjects": recent_subjects,
        "recent_topics": recent_topics,
        "reasons": {"yanlis": REASONS_YANLIS, "bos": REASONS_BOS},
        "sources": sources,
        "exam_sections": exam_sections,
        "weekdays": clock.GUNLER,
    }


# ---------------------------------------------------------------- kaynaklar (kitap / deneme yayını)

class SourceIn(BaseModel):
    kind: str = Field(pattern="^(kitap|yayin)$")
    name: str = Field(min_length=1, max_length=80)


@router.post("/kaynaklar")
def add_source(body: SourceIn, user=Depends(current_user), con=Depends(get_db)):
    name = body.name.strip()
    ex = one(con.execute("SELECT id FROM sources WHERE kind=? AND lower(name)=lower(?)", (body.kind, name)))
    if ex:
        con.execute("UPDATE sources SET hidden=0 WHERE id=?", (ex["id"],))
        return {"id": ex["id"], "kind": body.kind, "name": name}
    sid = con.execute("INSERT INTO sources(kind,name) VALUES (?,?)", (body.kind, name)).lastrowid
    return {"id": sid, "kind": body.kind, "name": name}


@router.delete("/kaynaklar/{sid}")
def hide_source(sid: int, user=Depends(current_user), con=Depends(get_db)):
    con.execute("UPDATE sources SET hidden=1 WHERE id=?", (sid,))
    return {"ok": True}


# ---------------------------------------------------------------- konu yönetimi (takipçi)

class TopicIn(BaseModel):
    subject_id: int
    parent_id: int | None = None
    name: str = Field(min_length=1, max_length=100)


class TopicPatch(BaseModel):
    name: str | None = Field(default=None, min_length=1, max_length=100)
    hidden: bool | None = None


@router.get("/konular/tum")
def all_topics(user=Depends(coach_only), con=Depends(get_db)):
    """Gizlenenler dahil tüm konular (yönetim ekranı için)."""
    return {
        "subjects": rows(con.execute("SELECT id,name FROM subjects ORDER BY sort")),
        "topics": rows(con.execute("SELECT id,subject_id,parent_id,name,hidden FROM topics ORDER BY sort,id")),
    }


@router.post("/konular")
def add_topic(body: TopicIn, user=Depends(coach_only), con=Depends(get_db)):
    if not one(con.execute("SELECT id FROM subjects WHERE id=?", (body.subject_id,))):
        raise HTTPException(404, "Ders bulunamadı")
    if body.parent_id and not one(con.execute(
            "SELECT id FROM topics WHERE id=? AND subject_id=? AND parent_id IS NULL", (body.parent_id, body.subject_id))):
        raise HTTPException(400, "Üst konu bu derse ait değil")
    sort = con.execute("SELECT COALESCE(MAX(sort),0)+1 FROM topics WHERE subject_id=? AND parent_id IS ?",
                       (body.subject_id, body.parent_id)).fetchone()[0]
    tid = con.execute("INSERT INTO topics(subject_id,parent_id,name,sort) VALUES (?,?,?,?)",
                      (body.subject_id, body.parent_id, body.name.strip(), sort)).lastrowid
    return {"id": tid}


@router.patch("/konular/{tid}")
def edit_topic(tid: int, body: TopicPatch, user=Depends(coach_only), con=Depends(get_db)):
    if body.name is not None:
        con.execute("UPDATE topics SET name=? WHERE id=?", (body.name.strip(), tid))
    if body.hidden is not None:
        con.execute("UPDATE topics SET hidden=? WHERE id=? OR parent_id=?", (int(body.hidden), tid, tid))
    return {"ok": True}


# ---------------------------------------------------------------- fotoğraflar

_DATAURL = re.compile(r"^data:image/(jpeg|png|webp);base64,(.+)$", re.S)
MAX_PHOTO_BYTES = 6 * 1024 * 1024


def save_photo(data_url: str | None) -> str | None:
    """Tarayıcıda küçültülmüş görseli (data URL) diske yazar, dosya adını döner."""
    if not data_url:
        return None
    m = _DATAURL.match(data_url)
    if not m:
        raise HTTPException(400, "Görsel biçimi desteklenmiyor")
    raw = base64.b64decode(m.group(2), validate=False)
    if len(raw) > MAX_PHOTO_BYTES:
        raise HTTPException(413, "Görsel çok büyük")
    ext = {"jpeg": "jpg", "png": "png", "webp": "webp"}[m.group(1)]
    name = f"{clock.today():%Y%m}-{secrets.token_hex(8)}.{ext}"
    os.makedirs(PHOTO_DIR, exist_ok=True)
    with open(os.path.join(PHOTO_DIR, name), "wb") as f:
        f.write(raw)
    return name


@router.get("/foto/{name}")
def photo(name: str, user=Depends(current_user)):
    if not re.fullmatch(r"[0-9]{6}-[0-9a-f]{16}\.(jpg|png|webp)", name):
        raise HTTPException(404)
    path = os.path.join(PHOTO_DIR, name)
    if not os.path.exists(path):
        raise HTTPException(404)
    return FileResponse(path, headers={"Cache-Control": "private, max-age=31536000, immutable"})
