"""Günlük otomatik yedek.

Her gece 03:30'da (Türkiye saati) veritabanının tutarlı bir kopyasını ve fotoğrafları
/backups/yks-YYYY-MM-DD.tar.gz dosyasına yazar. Son YKS_BACKUP_KEEP (varsayılan 30) yedek saklanır.

  python -m yks.backup          -> sürekli çalışır (docker compose'daki backup servisi)
  python -m yks.backup simdi    -> hemen bir yedek alır
"""
import glob
import os
import sqlite3
import sys
import tarfile
import tempfile
import time
from datetime import datetime, timedelta

from .clock import TZ
from .db import DATA_DIR, DB_PATH, PHOTO_DIR

BACKUP_DIR = os.environ.get("YKS_BACKUP_DIR", "/backups")
KEEP = int(os.environ.get("YKS_BACKUP_KEEP", "30"))
HOUR, MINUTE = 3, 30


def backup_now() -> str:
    os.makedirs(BACKUP_DIR, exist_ok=True)
    stamp = datetime.now(TZ).strftime("%Y-%m-%d_%H%M")
    out = os.path.join(BACKUP_DIR, f"yks-{stamp}.tar.gz")
    with tempfile.TemporaryDirectory() as tmp:
        db_copy = os.path.join(tmp, "yks.db")
        src = sqlite3.connect(DB_PATH)
        dst = sqlite3.connect(db_copy)
        with dst:
            src.backup(dst)  # uygulama çalışırken de tutarlı kopya
        src.close()
        dst.close()
        with tarfile.open(out + ".tmp", "w:gz") as tar:
            tar.add(db_copy, arcname="yks.db")
            if os.path.isdir(PHOTO_DIR):
                tar.add(PHOTO_DIR, arcname="photos")
    os.replace(out + ".tmp", out)
    for old in sorted(glob.glob(os.path.join(BACKUP_DIR, "yks-*.tar.gz")))[:-KEEP]:
        os.remove(old)
    return out


def seconds_until_next() -> float:
    now = datetime.now(TZ)
    nxt = now.replace(hour=HOUR, minute=MINUTE, second=0, microsecond=0)
    if nxt <= now:
        nxt += timedelta(days=1)
    return (nxt - now).total_seconds()


def loop():
    print(f"Yedek servisi başladı. Veri: {DATA_DIR}, yedekler: {BACKUP_DIR}, saklanan: {KEEP}", flush=True)
    while True:
        time.sleep(seconds_until_next())
        try:
            if os.path.exists(DB_PATH):
                print("Yedek alındı:", backup_now(), flush=True)
        except Exception as e:  # servis düşmesin, ertesi gece tekrar dener
            print("YEDEK HATASI:", e, flush=True)
            time.sleep(60)


if __name__ == "__main__":
    if sys.argv[1:] == ["simdi"]:
        print(backup_now())
    else:
        loop()
