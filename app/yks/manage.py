"""Komut satırı yardımcıları.

  python -m yks.manage kullanici <kullanici_adi> <ogrenci|takipci> "<Görünen ad>"   (şifre sorulur)
  python -m yks.manage sifre <kullanici_adi>                                     (yeni şifre sorulur)
  python -m yks.manage listele
"""
import getpass
import sys

from .auth import upsert_user
from .db import init_db, tx


def ask_password() -> str:
    p1 = getpass.getpass("Yeni şifre: ")
    p2 = getpass.getpass("Tekrar: ")
    if p1 != p2 or len(p1) < 6:
        sys.exit("Şifreler aynı değil ya da 6 karakterden kısa.")
    return p1


def main(argv):
    init_db()
    if len(argv) >= 4 and argv[0] == "kullanici":
        with tx() as con:
            upsert_user(con, argv[1].lower(), ask_password(), argv[2], argv[3])
        print("Kullanıcı kaydedildi.")
    elif len(argv) == 2 and argv[0] == "sifre":
        with tx() as con:
            u = con.execute("SELECT role, display_name FROM users WHERE username=?", (argv[1].lower(),)).fetchone()
            if not u:
                sys.exit("Böyle bir kullanıcı yok.")
            upsert_user(con, argv[1].lower(), ask_password(), u["role"], u["display_name"])
        print("Şifre değişti, açık oturumlar kapatıldı.")
    elif argv[:1] == ["listele"]:
        with tx() as con:
            for r in con.execute("SELECT username, role, display_name FROM users"):
                print(f"{r['username']:20} {r['role']:10} {r['display_name']}")
    else:
        print(__doc__)


if __name__ == "__main__":
    main(sys.argv[1:])
