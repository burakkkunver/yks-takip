"""SQLite bağlantısı ve şema."""
import os
import sqlite3
from contextlib import contextmanager

DATA_DIR = os.environ.get("YKS_DATA_DIR", os.path.join(os.path.dirname(__file__), "..", "data"))
DB_PATH = os.path.join(DATA_DIR, "yks.db")
PHOTO_DIR = os.path.join(DATA_DIR, "photos")

SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    pw_hash TEXT NOT NULL,
    role TEXT NOT NULL CHECK (role IN ('ogrenci','takipci')),
    display_name TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id),
    expires_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS subjects (
    id INTEGER PRIMARY KEY,
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS topics (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    parent_id INTEGER REFERENCES topics(id),
    name TEXT NOT NULL,
    sort INTEGER NOT NULL DEFAULT 0,
    hidden INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS ix_topics_subject ON topics(subject_id);
CREATE TABLE IF NOT EXISTS sources (
    id INTEGER PRIMARY KEY,
    kind TEXT NOT NULL CHECK (kind IN ('kitap','yayin')),
    name TEXT NOT NULL,
    hidden INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS program_items (
    id INTEGER PRIMARY KEY,
    weekday INTEGER NOT NULL CHECK (weekday BETWEEN 0 AND 6),
    kind TEXT NOT NULL CHECK (kind IN ('soru','tik','deneme')),
    title TEXT NOT NULL,
    subject_id INTEGER REFERENCES subjects(id),
    topic_id INTEGER REFERENCES topics(id),
    target INTEGER,
    exam_type TEXT,
    valid_from TEXT NOT NULL,
    valid_to TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY,
    date TEXT NOT NULL,
    program_item_id INTEGER REFERENCES program_items(id),
    kind TEXT NOT NULL CHECK (kind IN ('soru','tik','deneme')),
    title TEXT NOT NULL,
    subject_id INTEGER REFERENCES subjects(id),
    topic_id INTEGER REFERENCES topics(id),
    target INTEGER,
    exam_type TEXT,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    blank INTEGER NOT NULL DEFAULT 0,
    closed INTEGER NOT NULL DEFAULT 0,
    ticked INTEGER NOT NULL DEFAULT 0,
    completed_at TEXT,
    created_by INTEGER REFERENCES users(id),
    created_at TEXT NOT NULL,
    client_id TEXT UNIQUE,
    UNIQUE (program_item_id, date)
);
CREATE INDEX IF NOT EXISTS ix_tasks_date ON tasks(date);
CREATE TABLE IF NOT EXISTS mistakes (
    id INTEGER PRIMARY KEY,
    subject_id INTEGER NOT NULL REFERENCES subjects(id),
    topic_id INTEGER REFERENCES topics(id),
    kind TEXT NOT NULL CHECK (kind IN ('yanlis','bos')),
    reason TEXT NOT NULL,
    note TEXT,
    photo TEXT,
    solution_photo TEXT,
    source_id INTEGER REFERENCES sources(id),
    page TEXT,
    qno TEXT,
    origin TEXT NOT NULL DEFAULT 'serbest',
    task_id INTEGER REFERENCES tasks(id),
    exam_id INTEGER REFERENCES exams(id),
    created_date TEXT NOT NULL,
    created_at TEXT NOT NULL,
    stage INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'acik' CHECK (status IN ('acik','kapandi')),
    client_id TEXT UNIQUE
);
CREATE INDEX IF NOT EXISTS ix_mistakes_topic ON mistakes(topic_id);
CREATE TABLE IF NOT EXISTS reviews (
    id INTEGER PRIMARY KEY,
    mistake_id INTEGER NOT NULL REFERENCES mistakes(id) ON DELETE CASCADE,
    stage INTEGER NOT NULL,
    due_date TEXT NOT NULL,
    done_date TEXT,
    result TEXT CHECK (result IN ('cozdum','yapamadim'))
);
CREATE INDEX IF NOT EXISTS ix_reviews_due ON reviews(due_date);
CREATE TABLE IF NOT EXISTS exams (
    id INTEGER PRIMARY KEY,
    type TEXT NOT NULL CHECK (type IN ('TYT','AYT')),
    date TEXT NOT NULL,
    source_id INTEGER REFERENCES sources(id),
    name TEXT,
    photo TEXT,
    created_at TEXT NOT NULL,
    client_id TEXT UNIQUE
);
CREATE TABLE IF NOT EXISTS exam_results (
    exam_id INTEGER NOT NULL REFERENCES exams(id) ON DELETE CASCADE,
    section TEXT NOT NULL,
    correct INTEGER NOT NULL DEFAULT 0,
    wrong INTEGER NOT NULL DEFAULT 0,
    blank INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (exam_id, section)
);
CREATE TABLE IF NOT EXISTS days (
    date TEXT PRIMARY KEY,
    excused INTEGER NOT NULL DEFAULT 0,
    excuse TEXT,
    hard_topic_id INTEGER REFERENCES topics(id),
    hard_subject_id INTEGER REFERENCES subjects(id),
    reflection TEXT,
    reflected_at TEXT
);
CREATE TABLE IF NOT EXISTS notes (
    id INTEGER PRIMARY KEY,
    text TEXT NOT NULL,
    created_at TEXT NOT NULL,
    read_at TEXT
);
CREATE TABLE IF NOT EXISTS weekly_goals (
    week_start TEXT PRIMARY KEY,
    text TEXT NOT NULL,
    result TEXT CHECK (result IN ('tuttu','tutmadi'))
);
CREATE TABLE IF NOT EXISTS meta (
    key TEXT PRIMARY KEY,
    value TEXT
);
"""


def connect() -> sqlite3.Connection:
    os.makedirs(DATA_DIR, exist_ok=True)
    os.makedirs(PHOTO_DIR, exist_ok=True)
    con = sqlite3.connect(DB_PATH, timeout=15)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    con.execute("PRAGMA journal_mode = WAL")
    return con


@contextmanager
def tx():
    con = connect()
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def get_db():
    """FastAPI bağımlılığı: istek başına bir bağlantı, sonunda commit."""
    con = connect()
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def init_db():
    with tx() as con:
        con.executescript(SCHEMA)


def rows(cur) -> list[dict]:
    return [dict(r) for r in cur.fetchall()]


def one(cur) -> dict | None:
    r = cur.fetchone()
    return dict(r) if r else None
