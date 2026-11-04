"""Kullanıcı adı/şifre girişi ve uzun ömürlü oturum (180 gün, HttpOnly çerez)."""
import hashlib
import hmac
import secrets
from datetime import datetime, timedelta, timezone

from fastapi import Depends, HTTPException, Request

from .db import get_db

COOKIE = "yks_oturum"
SESSION_DAYS = 180
_ITER = 200_000


def hash_password(pw: str) -> str:
    salt = secrets.token_bytes(16)
    dk = hashlib.pbkdf2_hmac("sha256", pw.encode(), salt, _ITER)
    return f"pbkdf2${_ITER}${salt.hex()}${dk.hex()}"


def verify_password(pw: str, stored: str) -> bool:
    try:
        _, it, salt, dk = stored.split("$")
        calc = hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), int(it))
        return hmac.compare_digest(calc.hex(), dk)
    except Exception:
        return False


def create_session(con, user_id: int) -> str:
    token = secrets.token_urlsafe(32)
    exp = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
    con.execute("INSERT INTO sessions(token,user_id,expires_at) VALUES (?,?,?)", (token, user_id, exp.isoformat()))
    return token


def upsert_user(con, username: str, password: str, role: str, display_name: str):
    row = con.execute("SELECT id FROM users WHERE username=?", (username,)).fetchone()
    if row:
        con.execute("UPDATE users SET pw_hash=?, role=?, display_name=? WHERE id=?",
                    (hash_password(password), role, display_name, row[0]))
        con.execute("DELETE FROM sessions WHERE user_id=?", (row[0],))
    else:
        con.execute("INSERT INTO users(username,pw_hash,role,display_name) VALUES (?,?,?,?)",
                    (username, hash_password(password), role, display_name))


def current_user(request: Request, con=Depends(get_db)) -> dict:
    token = request.cookies.get(COOKIE)
    if not token:
        raise HTTPException(401, "Giriş yapmalısın")
    row = con.execute(
        "SELECT u.id,u.username,u.role,u.display_name,s.expires_at FROM sessions s JOIN users u ON u.id=s.user_id"
        " WHERE s.token=?", (token,)).fetchone()
    if not row or row["expires_at"] < datetime.now(timezone.utc).isoformat():
        raise HTTPException(401, "Oturum süresi doldu, tekrar giriş yap")
    # Kullanıldıkça oturum süresini uzat (haftada bir yeterli)
    exp = datetime.fromisoformat(row["expires_at"])
    if exp - datetime.now(timezone.utc) < timedelta(days=SESSION_DAYS - 7):
        new_exp = datetime.now(timezone.utc) + timedelta(days=SESSION_DAYS)
        con.execute("UPDATE sessions SET expires_at=? WHERE token=?", (new_exp.isoformat(), token))
    return {k: row[k] for k in ("id", "username", "role", "display_name")}


def student_only(user=Depends(current_user)) -> dict:
    if user["role"] != "ogrenci":
        raise HTTPException(403, "Bu işlem sadece öğrenci hesabıyla yapılır")
    return user


def coach_only(user=Depends(current_user)) -> dict:
    if user["role"] != "takipci":
        raise HTTPException(403, "Bu işlem sadece takipçi hesabıyla yapılır")
    return user
