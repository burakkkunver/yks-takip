"""YKS Takip uygulaması: FastAPI giriş noktası."""
import os
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.responses import FileResponse, RedirectResponse
from fastapi.staticfiles import StaticFiles

from . import clock
from .api_coach import router as coach_router
from .api_core import router as core_router
from .api_daily import router as daily_router
from .api_exams import router as exams_router
from .auth import upsert_user
from .db import init_db, tx
from .seed import seed

STATIC = os.path.join(os.path.dirname(__file__), "static")


def bootstrap():
    init_db()
    with tx() as con:
        if not con.execute("SELECT 1 FROM meta WHERE key='start_date'").fetchone():
            con.execute("INSERT INTO meta(key,value) VALUES ('start_date',?)", (clock.iso(clock.today()),))
        start = con.execute("SELECT value FROM meta WHERE key='start_date'").fetchone()[0]
        seed(con, start)
        # İlk kurulumda .env'deki kullanıcıları oluştur (sonradan şifre değişikliği: python -m yks.manage)
        for role, prefix, default_name in (("ogrenci", "OGRENCI", "Öğrenci"), ("takipci", "TAKIPCI", "Takipçi")):
            u, p = os.environ.get(f"YKS_{prefix}_KULLANICI"), os.environ.get(f"YKS_{prefix}_SIFRE")
            name = os.environ.get(f"YKS_{prefix}_AD", default_name)
            if u and p and not con.execute("SELECT 1 FROM users WHERE username=?", (u.lower(),)).fetchone():
                upsert_user(con, u.lower(), p, role, name)


@asynccontextmanager
async def lifespan(_app):
    bootstrap()
    yield


app = FastAPI(title="YKS Takip", docs_url=None, redoc_url=None, lifespan=lifespan)
for r in (core_router, daily_router, exams_router, coach_router):
    app.include_router(r)


@app.get("/saglik")
def health():
    return {"ok": True}


NO_CACHE = {"Cache-Control": "no-cache"}


@app.get("/")
def index():
    return FileResponse(os.path.join(STATIC, "index.html"), headers=NO_CACHE)


@app.get("/sw.js")
def sw():
    return FileResponse(os.path.join(STATIC, "sw.js"), media_type="application/javascript",
                        headers={**NO_CACHE, "Service-Worker-Allowed": "/"})


@app.get("/manifest.webmanifest")
def manifest():
    return FileResponse(os.path.join(STATIC, "manifest.webmanifest"), media_type="application/manifest+json",
                        headers=NO_CACHE)


@app.post("/paylas")
def share_fallback():
    # Service worker paylaşımı yakalayamadıysa (ilk açılış) hata ekleme ekranına yönlendir
    return RedirectResponse("/#/hata-ekle", status_code=303)


app.mount("/static", StaticFiles(directory=STATIC), name="static")
