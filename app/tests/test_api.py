from datetime import date, timedelta

from conftest import ids

PNG = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")


def test_login_and_roles(env):
    s, c = env["s"], env["c"]
    assert s.get("/api/ben").json()["role"] == "ogrenci"
    assert c.get("/api/ben").json()["role"] == "takipci"
    from fastapi.testclient import TestClient
    from yks.main import app
    anon = TestClient(app)
    assert anon.get("/api/bugun").status_code == 401
    assert anon.post("/api/giris", json={"username": "ali", "password": "yanlis"}).status_code == 401


def test_seed_topics(env):
    meta = env["s"].get("/api/meta").json()
    codes = [x["code"] for x in meta["subjects"]]
    assert codes[:3] == ["turkce", "tyt_mat", "geometri"]
    assert "ayt_biy" in codes
    sid, tid = ids(meta, "tyt_mat", "Yaş Problemleri")
    sid2, _ = ids(meta, "geometri", "Açıortay")
    assert sid != sid2
    assert "İşlem hatası" in meta["reasons"]["yanlis"]
    assert "Hiç fikrim yoktu" in meta["reasons"]["bos"]


def test_routine_tasks_and_completion_rule(env):
    s, c = env["s"], env["c"]
    today = s.get("/api/bugun").json()
    titles = [t["title"] for t in today["tasks"]]
    assert titles == ["1 problem testi", "1 paragraf testi"]
    t = today["tasks"][0]
    # takipçi öğrencinin görevini değiştiremez
    assert c.patch(f"/api/gorevler/{t['id']}", json={"correct": 5}).status_code == 403
    r = s.patch(f"/api/gorevler/{t['id']}", json={"correct": 8, "wrong": 3, "blank": 1}).json()
    assert r["completed_at"] is None  # yanlışlar kapatılmadan tamamlanmaz
    r = s.patch(f"/api/gorevler/{t['id']}", json={"closed": True}).json()
    assert r["completed_at"]
    t2 = today["tasks"][1]
    r = s.patch(f"/api/gorevler/{t2['id']}", json={"correct": 10, "wrong": 0, "blank": 0}).json()
    assert r["completed_at"]  # yanlış/boş yoksa onay gerekmez


def test_program_persists_every_week(env):
    s, c, clock = env["s"], env["c"], env["clock"]
    meta = c.get("/api/meta").json()
    sid, tid = ids(meta, "geometri", "Üçgende Açı")
    # öğrenci programı değiştiremez
    assert s.post("/api/program", json={"weekdays": [0], "kind": "soru", "topic_id": tid}).status_code == 403
    r = c.post("/api/program", json={"weekdays": [0, 2], "kind": "soru", "topic_id": tid, "target": 20})
    assert r.status_code == 200
    c.post("/api/program", json={"weekdays": [1], "kind": "tik", "title": "Formül kartlarına bak"})
    prog = c.get("/api/program").json()
    assert [i["title"] for i in prog["days"][0]["items"]][-1] == "Üçgenler › Üçgende Açı"
    # 3 hafta sonraki pazartesi aynı görev yine geliyor
    clock.set_today(date(2026, 11, 23))
    titles = [t["title"] for t in s.get("/api/bugun").json()["tasks"]]
    assert "Üçgenler › Üçgende Açı" in titles
    clock.set_today(date(2026, 11, 24))
    tasks = s.get("/api/bugun").json()["tasks"]
    tik = next(t for t in tasks if t["kind"] == "tik")
    assert s.patch(f"/api/gorevler/{tik['id']}", json={"ticked": True}).json()["completed_at"]
    # programdan kaldırınca sonraki haftalarda gelmez, geçmiş kalır
    item = next(i for i in c.get("/api/program").json()["days"][1]["items"] if i["kind"] == "tik")
    assert c.delete(f"/api/program/{item['id']}").status_code == 200
    clock.set_today(date(2026, 12, 1))
    assert not any(t["kind"] == "tik" for t in s.get("/api/bugun").json()["tasks"])
    past = s.get("/api/gun/2026-11-24").json()
    assert any(t["kind"] == "tik" and t["done"] for t in past["tasks"])


def test_edit_window_lock(env):
    s, clock = env["s"], env["clock"]
    t = s.get("/api/bugun").json()["tasks"][0]
    clock.set_today(date(2026, 11, 4))
    assert s.patch(f"/api/gorevler/{t['id']}", json={"correct": 3}).status_code == 200
    clock.set_today(date(2026, 11, 5))
    assert s.patch(f"/api/gorevler/{t['id']}", json={"correct": 4}).status_code == 400


def test_mistake_and_review_cycle(env):
    s, c, clock = env["s"], env["c"], env["clock"]
    meta = s.get("/api/meta").json()
    sid, tid = ids(meta, "tyt_mat", "Yaş Problemleri")
    assert c.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "Dikkatsizlik"}).status_code == 403
    assert s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "Uydurma"}).status_code == 400
    r = s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "Konuyu bilmiyorum",
                                     "photo": PNG, "client_id": "abc"})
    mid = r.json()["id"]
    assert s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "Konuyu bilmiyorum",
                                        "client_id": "abc"}).json()["id"] == mid  # çevrimdışı tekrar gönderim
    m = s.get(f"/api/hatalar/{mid}").json()
    assert m["photo"] and s.get(f"/api/foto/{m['photo']}").status_code == 200
    assert m["reviews"][0]["due_date"] == "2026-11-04"
    assert s.get("/api/bugun").json()["reviews"] == []
    clock.set_today(date(2026, 11, 4))
    revs = s.get("/api/bugun").json()["reviews"]
    assert len(revs) == 1 and revs[0]["topic"] == "Problemler › Yaş Problemleri"
    # yine yapamadım -> 2 gün sonra
    assert s.post(f"/api/tekrar/{revs[0]['review_id']}", json={"result": "yapamadim"}).json()["next_due"] == "2026-11-06"
    clock.set_today(date(2026, 11, 6))
    rv = s.get("/api/bugun").json()["reviews"][0]
    assert s.post(f"/api/tekrar/{rv['review_id']}", json={"result": "yapamadim"}).json()["next_due"] == "2026-11-08"
    stuck = c.get("/api/ozet").json()["stuck"]
    assert stuck and stuck[0]["name"] == "Yaş Problemleri"
    clock.set_today(date(2026, 11, 8))
    rv = s.get("/api/bugun").json()["reviews"][0]
    # çözdüm -> 7. gün tekrarı (hata 2'sinde girildi -> 9'u)
    assert s.post(f"/api/tekrar/{rv['review_id']}", json={"result": "cozdum"}).json()["next_due"] == "2026-11-09"
    clock.set_today(date(2026, 11, 9))
    rv = s.get("/api/bugun").json()["reviews"][0]
    assert s.post(f"/api/tekrar/{rv['review_id']}", json={"result": "cozdum"}).json()["next_due"] is None
    assert s.get(f"/api/hatalar/{mid}").json()["status"] == "kapandi"


def test_missed_review_shows_overdue(env):
    s, c, clock = env["s"], env["c"], env["clock"]
    meta = s.get("/api/meta").json()
    sid, tid = ids(meta, "geometri", "Açıortay")
    s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "kind": "bos", "reason": "Hiç fikrim yoktu"})
    clock.set_today(date(2026, 11, 7))
    revs = s.get("/api/bugun").json()["reviews"]
    assert revs[0]["overdue"]
    assert len(c.get("/api/ozet").json()["missed_reviews"]) == 1


def complete_day(s):
    for t in s.get("/api/bugun").json()["tasks"]:
        s.patch(f"/api/gorevler/{t['id']}", json={"correct": 10})


def test_chain_and_excuse(env):
    s, clock = env["s"], env["clock"]
    d0 = date(2026, 11, 2)
    for i in range(3):
        clock.set_today(d0 + timedelta(days=i))
        complete_day(s)
    assert s.get("/api/bugun").json()["chain"]["current"] == 3
    # 4. gün mazeret (zinciri dondurur)
    clock.set_today(d0 + timedelta(days=3))
    assert s.post("/api/gun/mazeret", json={"excuse": "Hastayım"}).status_code == 200
    clock.set_today(d0 + timedelta(days=4))
    assert s.post("/api/gun/mazeret", json={"excuse": "Yine"}).status_code == 400  # haftada 1
    ch = s.get("/api/bugun").json()["chain"]
    assert ch["current"] == 3  # bugün henüz bitmedi, kırılmaz
    complete_day(s)
    assert s.get("/api/bugun").json()["chain"]["current"] == 4
    # 6. gün hiçbir şey yapılmadı -> 7. gün zincir 0 ama rekor 4
    clock.set_today(d0 + timedelta(days=6))
    ch = s.get("/api/bugun").json()["chain"]
    assert ch["current"] == 0 and ch["best"] == 4
    hist = s.get("/api/gecmis?month=2026-11").json()["days"]
    states = {d["date"]: d["state"] for d in hist}
    assert states["2026-11-05"] == "excused" and states["2026-11-07"] == "red" and states["2026-11-30"] == "future"


def test_review_due_blocks_chain(env):
    s, clock = env["s"], env["clock"]
    meta = s.get("/api/meta").json()
    sid, tid = ids(meta, "tyt_mat", "Mutlak Değer")
    s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "Dikkatsizlik"})
    clock.set_today(date(2026, 11, 4))
    complete_day(s)
    day = s.get("/api/gun/2026-11-04").json()
    assert day["state"]["state"] == "yellow"  # görevler bitti, tekrar kaldı
    rv = s.get("/api/bugun").json()["reviews"][0]
    s.post(f"/api/tekrar/{rv['review_id']}", json={"result": "cozdum"})
    assert s.get("/api/gun/2026-11-04").json()["state"]["state"] == "green"


def test_exam_net_and_deneme_task(env):
    s, c, clock = env["s"], env["c"], env["clock"]
    c.post("/api/program", json={"weekdays": [5], "kind": "deneme", "exam_type": "TYT"})
    clock.set_today(date(2026, 11, 7))  # Cumartesi
    task = next(t for t in s.get("/api/bugun").json()["tasks"] if t["kind"] == "deneme")
    assert not task["done"]
    bad = {"type": "TYT", "results": {"mat": {"correct": 30, "wrong": 5, "blank": 0},
                                      "geo": {"correct": 8, "wrong": 0, "blank": 0}}}
    assert s.post("/api/denemeler", json=bad).status_code == 400  # mat+geo > 40
    body = {"type": "TYT", "results": {
        "turkce": {"correct": 25, "wrong": 8, "blank": 7}, "sosyal": {"correct": 15, "wrong": 3, "blank": 2},
        "mat": {"correct": 11, "wrong": 4, "blank": 15}, "geo": {"correct": 1, "wrong": 2, "blank": 7},
        "fiz": {"correct": 2, "wrong": 1, "blank": 4}, "kim": {"correct": 3, "wrong": 0, "blank": 4},
        "biy": {"correct": 2, "wrong": 2, "blank": 2}}}
    eid = s.post("/api/denemeler", json=body).json()["id"]
    e = s.get(f"/api/denemeler/{eid}").json()
    nets = {x["key"]: x["net"] for x in e["sections"]}
    assert nets["turkce"] == 23 and nets["mat"] == 10 and nets["geo"] == 0.5
    assert e["total_net"] == 23 + 14.25 + 10 + 0.5 + 1.75 + 3 + 1.5
    task = next(t for t in s.get("/api/bugun").json()["tasks"] if t["kind"] == "deneme")
    assert task["done"]
    meta = s.get("/api/meta").json()
    sid, tid = ids(meta, "geometri", "Açıortay")
    s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "Konuyu bilmiyorum",
                                 "origin": "deneme", "exam_id": eid})
    assert s.get(f"/api/denemeler/{eid}").json()["mistakes_logged"] == 1
    tr = c.get("/api/net-trend").json()["TYT"]
    assert tr["series"]["mat"]["points"] == [10.0]


def test_coach_summary_whatsapp_csv(env):
    s, c, clock = env["s"], env["c"], env["clock"]
    meta = s.get("/api/meta").json()
    tasks = s.get("/api/bugun").json()["tasks"]
    s.patch(f"/api/gorevler/{tasks[0]['id']}", json={"correct": 5, "wrong": 4})
    s.patch(f"/api/gorevler/{tasks[1]['id']}", json={"correct": 5, "wrong": 2, "closed": True})
    sid, tid = ids(meta, "tyt_mat", "Hareket Problemleri")
    for _ in range(3):
        s.post("/api/hatalar", json={"subject_id": sid, "topic_id": tid, "reason": "İşlem hatası"})
    s.post("/api/gun/kapanis", json={"subject_id": sid, "topic_id": tid, "note": "Hareket zor"})
    c.put("/api/hedef", json={"week_start": "2026-11-02", "text": "Problemleri kapat"})
    c.post("/api/notlar", json={"text": "Aferin!"})
    sm = c.get("/api/ozet").json()
    assert sm["close_total"] == 6 and sm["close_done"] == 2 and sm["close_rate"] == 33
    assert len(sm["unclosed"]) == 1
    assert sm["top_topics"][0]["count"] == 3
    assert sm["reasons_week"][0] == ["İşlem hatası", 3]
    assert sm["reflections"][0]["reflection"] == "Hareket zor"
    assert sm["goal"]["text"] == "Problemleri kapat"
    assert sm["suggestions"][0]["topic_id"] == tid
    heat = c.get("/api/isi-haritasi").json()
    mat = next(x for x in heat if x["name"] == "TYT Matematik")
    assert next(t for t in mat["topics"] if t["name"] == "Problemler")["color"] == "kirmizi"
    txt = c.get("/api/whatsapp").json()["text"]
    assert "Yanlış kapatma: 2/6" in txt and "Problemleri kapat" in txt
    home = s.get("/api/bugun").json()
    assert home["notes"][0]["text"] == "Aferin!" and home["goal"]["text"] == "Problemleri kapat"
    for kind in ("hatalar", "gorevler", "denemeler"):
        r = c.get(f"/api/disari/{kind}.csv")
        assert r.status_code == 200 and r.text.startswith("﻿")
    assert "Hareket Problemleri" in c.get("/api/disari/hatalar.csv").text


def test_coach_topic_management(env):
    c, s = env["c"], env["s"]
    meta = c.get("/api/meta").json()
    sid, tid = ids(meta, "tyt_mat", "Mantık")
    assert s.post("/api/konular", json={"subject_id": sid, "name": "X"}).status_code == 403
    new = c.post("/api/konular", json={"subject_id": sid, "name": "Sayı Doğrusu"}).json()["id"]
    c.patch(f"/api/konular/{tid}", json={"hidden": True})
    names = [t["name"] for t in next(x for x in c.get("/api/meta").json()["subjects"] if x["id"] == sid)["topics"]]
    assert "Sayı Doğrusu" in names and "Mantık" not in names
    assert new


def test_one_off_task_by_student_and_coach(env):
    s, c = env["s"], env["c"]
    meta = s.get("/api/meta").json()
    sid, tid = ids(meta, "ayt_mat", "Limit")
    r = s.post("/api/gorevler", json={"date": "2026-11-02", "kind": "soru", "topic_id": tid, "target": 15})
    assert r.status_code == 200
    r2 = c.post("/api/gorevler", json={"date": "2026-11-03", "kind": "tik", "title": "Video izle"})
    tasks = s.get("/api/bugun").json()["tasks"]
    assert tasks[-1]["title"] == "Limit ve Süreklilik › Limit" and tasks[-1]["creator_role"] == "ogrenci"
    assert s.delete(f"/api/gorevler/{r2.json()['id']}").status_code == 403
    assert c.delete(f"/api/gorevler/{r2.json()['id']}").status_code == 200
    assert s.delete(f"/api/gorevler/{tasks[0]['id']}").status_code == 400  # programdan gelen
