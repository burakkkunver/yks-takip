import os
import sys
import tempfile
from datetime import date

import pytest

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


@pytest.fixture()
def env(monkeypatch):
    tmp = tempfile.mkdtemp()
    monkeypatch.setenv("YKS_SECURE_COOKIE", "0")
    from yks import clock, db
    monkeypatch.setattr(db, "DATA_DIR", tmp)
    monkeypatch.setattr(db, "DB_PATH", os.path.join(tmp, "yks.db"))
    monkeypatch.setattr(db, "PHOTO_DIR", os.path.join(tmp, "photos"))
    import yks.api_core as core
    monkeypatch.setattr(core, "PHOTO_DIR", os.path.join(tmp, "photos"))
    clock.set_today(date(2026, 11, 2))  # Pazartesi
    monkeypatch.setenv("YKS_OGRENCI_KULLANICI", "ali")
    monkeypatch.setenv("YKS_OGRENCI_SIFRE", "ogrenci123")
    monkeypatch.setenv("YKS_TAKIPCI_KULLANICI", "burak")
    monkeypatch.setenv("YKS_TAKIPCI_SIFRE", "takipci123")
    from fastapi.testclient import TestClient
    from yks.main import app, bootstrap
    bootstrap()
    student = TestClient(app)
    coach = TestClient(app)
    assert student.post("/api/giris", json={"username": "ali", "password": "ogrenci123"}).status_code == 200
    assert coach.post("/api/giris", json={"username": "Burak", "password": "takipci123"}).status_code == 200
    yield {"s": student, "c": coach, "clock": clock, "tmp": tmp}
    clock.set_today(None)


def ids(meta, subject_code, topic_name):
    s = next(x for x in meta["subjects"] if x["code"] == subject_code)
    for t in s["topics"]:
        if t["name"] == topic_name:
            return s["id"], t["id"]
        for c in t["children"]:
            if c["name"] == topic_name:
                return s["id"], c["id"]
    raise KeyError(topic_name)
