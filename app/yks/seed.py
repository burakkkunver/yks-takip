"""Hazır gelen veriler: dersler, konular (TYT/AYT sayısal müfredatı), sebepler, deneme bölümleri.

Konular uygulamadan (takipçi > Konular) eklenip gizlenebilir; burası sadece ilk kurulumda yüklenir.
Kaynak: ÖSYM 2026-YKS kapsamı. 2027 için resmi bir konu değişikliği duyurulmadı
(MEB: yeni müfredata uygun soru modeli 2028 YKS'de başlıyor).
"""

# (kod, ad, konular). Konu ya düz metin ya da (ana konu, [alt konular]).
SUBJECTS = [
    ("turkce", "Türkçe", [
        "Sözcükte Anlam",
        "Söz Öbekleri ve Deyimler",
        "Cümlede Anlam",
        ("Paragraf", ["Ana Düşünce", "Yardımcı Düşünce", "Paragrafın Yapısı", "Anlatım Biçimleri ve Düşünceyi Geliştirme", "Paragraf Tamamlama / Sıralama"]),
        "Ses Bilgisi",
        "Yazım Kuralları",
        "Noktalama İşaretleri",
        ("Sözcük Türleri", ["İsim", "Sıfat", "Zamir", "Zarf", "Edat-Bağlaç-Ünlem"]),
        "Sözcükte Yapı (Kök-Ek)",
        ("Fiiller", ["Fiilde Kip ve Kişi", "Ek Fiil", "Fiilimsiler", "Fiilde Çatı"]),
        "Cümlenin Ögeleri",
        "Cümle Türleri",
        "Anlatım Bozuklukları",
    ]),
    ("tyt_mat", "TYT Matematik", [
        "Temel Kavramlar",
        "Sayı Basamakları",
        "Bölme ve Bölünebilme",
        "EBOB - EKOK",
        "Rasyonel Sayılar",
        "Basit Eşitsizlikler",
        "Mutlak Değer",
        "Üslü Sayılar",
        "Köklü Sayılar",
        "Çarpanlara Ayırma",
        "Oran - Orantı",
        "Denklem Çözme",
        ("Problemler", ["Sayı Problemleri", "Kesir Problemleri", "Yaş Problemleri", "İşçi Problemleri", "Hareket Problemleri", "Yüzde - Kâr - Zarar", "Karışım Problemleri", "Grafik Problemleri", "Rutin Olmayan Problemler"]),
        "Kümeler",
        "Mantık",
        "Fonksiyonlar",
        ("Permütasyon - Kombinasyon - Olasılık", ["Sayma ve Permütasyon", "Kombinasyon", "Binom", "Olasılık"]),
        "Veri - İstatistik",
        "Polinomlar",
        "2. Dereceden Denklemler",
    ]),
    ("geometri", "Geometri", [
        "Doğruda ve Üçgende Açılar",
        ("Üçgenler", ["Üçgende Açı", "Eşlik ve Benzerlik", "Açıortay", "Kenarortay", "Dik Üçgen ve Pisagor", "Üçgende Alan", "Açı-Kenar Bağıntıları"]),
        "Çokgenler",
        ("Dörtgenler", ["Dörtgen Genel", "Yamuk", "Paralelkenar", "Eşkenar Dörtgen", "Dikdörtgen", "Kare", "Deltoid"]),
        ("Çember ve Daire", ["Çemberde Açı", "Çemberde Uzunluk", "Dairede Alan"]),
        ("Analitik Geometri", ["Noktanın Analitiği", "Doğrunun Analitiği", "Çemberin Analitiği", "Dönüşümler (Öteleme-Yansıma-Dönme)"]),
        ("Katı Cisimler", ["Prizmalar", "Küp ve Dikdörtgenler Prizması", "Silindir", "Piramit", "Koni", "Küre"]),
    ]),
    ("tyt_fiz", "TYT Fizik", [
        "Fizik Bilimine Giriş",
        "Madde ve Özellikleri",
        "Hareket ve Kuvvet",
        "İş, Güç ve Enerji",
        "Isı, Sıcaklık ve Genleşme",
        "Elektrostatik",
        "Elektrik Akımı ve Devreler",
        "Manyetizma",
        "Basınç",
        "Kaldırma Kuvveti",
        "Dalgalar",
        "Optik",
    ]),
    ("tyt_kim", "TYT Kimya", [
        "Kimya Bilimi",
        "Atom ve Periyodik Sistem",
        "Kimyasal Türler Arası Etkileşimler",
        "Maddenin Halleri",
        "Doğa ve Kimya",
        "Kimyanın Temel Kanunları",
        "Mol Kavramı ve Kimyasal Hesaplamalar",
        "Kimyasal Tepkimeler",
        "Karışımlar",
        "Asitler, Bazlar ve Tuzlar",
        "Kimya Her Yerde",
    ]),
    ("tyt_biy", "TYT Biyoloji", [
        "Yaşam Bilimi Biyoloji (Canlıların Ortak Özellikleri)",
        "Canlıların Temel Bileşenleri",
        "Hücre ve Organeller",
        "Madde Geçişleri",
        "Canlıların Sınıflandırılması",
        "Hücre Bölünmeleri (Mitoz-Mayoz)",
        "Eşeyli ve Eşeysiz Üreme",
        "Kalıtımın Genel İlkeleri",
        "Ekosistem Ekolojisi",
        "Güncel Çevre Sorunları",
    ]),
    ("sosyal", "TYT Sosyal", [
        ("Tarih", ["Tarih ve Zaman", "İlk ve Orta Çağ Türk Dünyası", "İslam Medeniyeti ve İlk Türk-İslam Devletleri", "Selçuklu Türkiyesi", "Osmanlı Kuruluş ve Yükseliş", "Osmanlı Değişim ve Dağılma", "Millî Mücadele", "Atatürk Dönemi ve İnkılaplar"]),
        ("Coğrafya", ["Doğa ve İnsan", "Dünya'nın Şekli ve Hareketleri", "Coğrafi Konum", "Harita Bilgisi", "İklim", "Yer Şekilleri", "Nüfus ve Göç", "Yerleşme ve Ekonomik Faaliyetler", "Bölgeler", "Doğal Afetler"]),
        ("Felsefe", ["Felsefeyi Tanıma", "Bilgi Felsefesi", "Varlık Felsefesi", "Ahlak Felsefesi", "Sanat, Din ve Siyaset Felsefesi", "Felsefe Tarihi"]),
        ("Din Kültürü", ["Bilgi ve İnanç", "İbadet", "Ahlak ve Değerler", "Hz. Muhammed'in Hayatı", "İslam Düşüncesinde Yorumlar", "Din ve Hayat"]),
    ]),
    ("ayt_mat", "AYT Matematik", [
        ("Fonksiyonlar", ["Fonksiyon Kavramı", "Bileşke ve Ters Fonksiyon", "Fonksiyon Grafikleri ve Dönüşümleri"]),
        "Polinomlar",
        ("2. Dereceden Denklemler ve Parabol", ["2. Dereceden Denklemler", "Karmaşık Sayılar", "Parabol"]),
        "Eşitsizlikler ve Eşitsizlik Sistemleri",
        ("Trigonometri", ["Birim Çember ve Trigonometrik Oranlar", "Trigonometrik Fonksiyonlar ve Grafikler", "Toplam-Fark ve İki Kat Açı", "Trigonometrik Denklemler", "Sinüs ve Kosinüs Teoremi"]),
        ("Üstel ve Logaritmik Fonksiyonlar", ["Üstel Fonksiyon", "Logaritma", "Üstel ve Logaritmik Denklem-Eşitsizlik"]),
        ("Diziler", ["Dizi Kavramı", "Aritmetik Dizi", "Geometrik Dizi"]),
        "Permütasyon - Kombinasyon - Olasılık",
        ("Limit ve Süreklilik", ["Limit", "Süreklilik"]),
        ("Türev", ["Türev Alma Kuralları", "Türevin Geometrik Yorumu", "Artan-Azalan ve Ekstremum", "Maksimum-Minimum Problemleri", "Grafik Çizimi"]),
        ("İntegral", ["Belirsiz İntegral", "Belirli İntegral", "İntegral ile Alan"]),
    ]),
    ("ayt_fiz", "AYT Fizik", [
        "Vektörler",
        "Bağıl Hareket",
        "Newton'un Hareket Yasaları",
        "Bir Boyutta Sabit İvmeli Hareket",
        "Atışlar (İki Boyutta Hareket)",
        "Enerji ve Hareket",
        "İtme ve Çizgisel Momentum",
        "Tork ve Denge",
        "Kütle Merkezi",
        "Basit Makineler",
        "Elektriksel Kuvvet, Alan ve Potansiyel",
        "Düzgün Elektrik Alan ve Sığa",
        "Manyetizma ve Elektromanyetik İndüksiyon",
        "Alternatif Akım ve Transformatörler",
        "Çembersel Hareket",
        "Dönme, Yuvarlanma ve Açısal Momentum",
        "Kütle Çekim ve Kepler Yasaları",
        "Basit Harmonik Hareket",
        "Dalga Mekaniği",
        "Atom Fiziğine Giriş ve Radyoaktivite",
        "Modern Fizik (Özel Görelilik, Fotoelektrik, Compton)",
        "Modern Fiziğin Teknolojideki Uygulamaları",
    ]),
    ("ayt_kim", "AYT Kimya", [
        "Modern Atom Teorisi",
        "Gazlar",
        "Sıvı Çözeltiler ve Çözünürlük",
        "Kimyasal Tepkimelerde Enerji",
        "Kimyasal Tepkimelerde Hız",
        "Kimyasal Tepkimelerde Denge",
        "Asit-Baz Dengesi",
        "Çözünürlük Dengesi",
        "Kimya ve Elektrik",
        "Karbon Kimyasına Giriş",
        ("Organik Bileşikler", ["Hidrokarbonlar", "Alkoller ve Eterler", "Aldehit ve Ketonlar", "Karboksilli Asitler ve Esterler"]),
        "Enerji Kaynakları ve Bilimsel Gelişmeler",
    ]),
    ("ayt_biy", "AYT Biyoloji", [
        ("İnsan Fizyolojisi", ["Sinir Sistemi", "Endokrin Sistem", "Duyu Organları", "Destek ve Hareket Sistemi", "Sindirim Sistemi", "Dolaşım ve Bağışıklık Sistemi", "Solunum Sistemi", "Boşaltım Sistemi", "Üreme Sistemi ve Embriyonik Gelişim"]),
        "Komünite ve Popülasyon Ekolojisi",
        ("Genden Proteine", ["Nükleik Asitler", "Genetik Şifre ve Protein Sentezi"]),
        ("Canlılarda Enerji Dönüşümleri", ["Fotosentez", "Kemosentez", "Hücresel Solunum"]),
        "Bitki Biyolojisi",
        "Canlılar ve Çevre",
    ]),
]

REASONS_YANLIS = ["Konuyu bilmiyorum", "Dikkatsizlik", "İşlem hatası", "Süre yetmedi", "Soruyu yanlış yorumladım"]
REASONS_BOS = ["Hiç fikrim yoktu", "Başladım ama bitiremedim", "Süre yetmedi"]

# Deneme bölümleri: (bölüm kodu, ad, soru sayısı üst sınırı, hata defterindeki ders kodu)
EXAM_SECTIONS = {
    "TYT": [
        ("turkce", "Türkçe", 40, "turkce"),
        ("sosyal", "Sosyal", 20, "sosyal"),
        ("mat", "Matematik", 40, "tyt_mat"),
        ("geo", "Geometri", 40, "geometri"),
        ("fiz", "Fizik", 7, "tyt_fiz"),
        ("kim", "Kimya", 7, "tyt_kim"),
        ("biy", "Biyoloji", 6, "tyt_biy"),
    ],
    "AYT": [
        ("mat", "Matematik", 40, "ayt_mat"),
        ("geo", "Geometri", 40, "geometri"),
        ("fiz", "Fizik", 14, "ayt_fiz"),
        ("kim", "Kimya", 13, "ayt_kim"),
        ("biy", "Biyoloji", 13, "ayt_biy"),
    ],
}
# TYT'de matematik + geometri toplamı, AYT'de matematik + geometri toplamı 40 soruyu geçemez.
EXAM_GROUP_LIMITS = {"TYT": [(("mat", "geo"), 40)], "AYT": [(("mat", "geo"), 40)]}


def seed(con, start_date: str):
    """Boş veritabanına ders/konu ve varsayılan rutin görevleri yükler."""
    if con.execute("SELECT COUNT(*) FROM subjects").fetchone()[0]:
        return
    for s_i, (code, name, topics) in enumerate(SUBJECTS):
        sid = con.execute("INSERT INTO subjects(code,name,sort) VALUES (?,?,?)", (code, name, s_i)).lastrowid
        for t_i, t in enumerate(topics):
            tname, subs = (t, []) if isinstance(t, str) else t
            tid = con.execute(
                "INSERT INTO topics(subject_id,name,sort) VALUES (?,?,?)", (sid, tname, t_i)
            ).lastrowid
            for u_i, sub in enumerate(subs):
                con.execute(
                    "INSERT INTO topics(subject_id,parent_id,name,sort) VALUES (?,?,?,?)", (sid, tid, sub, u_i)
                )

    def topic_id(subject_code, name):
        return con.execute(
            "SELECT t.id FROM topics t JOIN subjects s ON s.id=t.subject_id WHERE s.code=? AND t.name=?",
            (subject_code, name),
        ).fetchone()[0]

    def subject_id(code):
        return con.execute("SELECT id FROM subjects WHERE code=?", (code,)).fetchone()[0]

    # Sabit günlük rutinler: her gün 1 problem testi, 1 paragraf testi
    routines = [
        ("1 problem testi", "tyt_mat", "Problemler"),
        ("1 paragraf testi", "turkce", "Paragraf"),
    ]
    from .clock import stamp
    for title, scode, tname in routines:
        for wd in range(7):
            con.execute(
                "INSERT INTO program_items(weekday,kind,title,subject_id,topic_id,valid_from,created_at)"
                " VALUES (?,?,?,?,?,?,?)",
                (wd, "soru", title, subject_id(scode), topic_id(scode, tname), start_date, stamp()),
            )
