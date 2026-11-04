"""Tarih yardımcıları.

Gün sabah 04:00'te kapanır: gece 00:30'da işaretlenen görev önceki güne sayılır.
"""
import os
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

TZ = ZoneInfo(os.environ.get("YKS_TZ", "Europe/Istanbul"))
DAY_CUTOFF_HOURS = 4
EDIT_WINDOW_DAYS = 2  # öğrenci en fazla 2 gün geriye dönük işaretleyebilir

_override: date | None = None  # testler için


def now() -> datetime:
    return datetime.now(TZ)


def today() -> date:
    if _override:
        return _override
    return (now() - timedelta(hours=DAY_CUTOFF_HOURS)).date()


def set_today(d: date | None):
    global _override
    _override = d


def iso(d: date) -> str:
    return d.isoformat()


def parse(s: str) -> date:
    return date.fromisoformat(s)


def week_start(d: date) -> date:
    return d - timedelta(days=d.weekday())


def stamp() -> str:
    return now().isoformat(timespec="seconds")


def daterange(a: date, b: date):
    d = a
    while d <= b:
        yield d
        d += timedelta(days=1)


GUNLER = ["Pazartesi", "Salı", "Çarşamba", "Perşembe", "Cuma", "Cumartesi", "Pazar"]
