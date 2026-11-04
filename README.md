# YKS Takip

TYT/AYT sayısal öğrencisi için **yanlışları kapatma** takip uygulaması. Amaç soru sayısını büyütmek değil,
yanlış ve boşların çözümüne bakılıp hata defterine girilmesini ve 2. ve 7. günde yeniden çözülmesini sağlamak.

- Öğrenci her gün 2-3 dakikada veri girer. Takipçi haftada bir özet ekranına bakar.
- Telefonda "Ana ekrana ekle" ile uygulama gibi açılır (PWA). İnternet yokken de açılır, girilenler sonra gönderilir.
- Bilerek **yok**: çalışma kronometresi, toplam soru sıralaması, puan/rozet.

## Özellikler

**Öğrenci**
- **Bugün ekranı:** zincir (🔗 kaç gün), haftanın hedefi, takipçiden gelen not, bugünün görevleri, bugünkü tekrarlar ve büyük "+ Hata ekle" düğmesi.
- **Görevler:**
  - *Soru görevi*: doğru/yanlış/boş +/− ile girilir. Yanlış ya da boş varsa **"Yanlışlarımı kapattım"** tiki atılmadan görev tamamlanmaz; yanlış/boş yoksa bu adım atlanır. Yanlışlar karttan tek dokunuşla hata defterine eklenir ("2/3 eklendi").
  - *Tik görevi* (konu anlatımı izle vb.): tek dokunuşla tiklenir.
  - *Deneme görevi*: o gün deneme sonucu girilince kendiliğinden tiklenir.
  - Öğrenci kendine de görev ekleyebilir.
- **Hata ekleme (3 dokunuş):** ders → konu → sebep. Sebebe dokununca kaydedilir.
  - İsteğe bağlı ekler: soru fotoğrafı, çözüm fotoğrafı, kitap/sayfa/soru no, kısa not.
  - Son kullanılan ders ve konular listenin üstünde çıkar.
  - Galeride bir ekran görüntüsünü **Paylaş → YKS Takip** ile göndermek doğrudan hata ekleme ekranını açar.
- **Sebepler:**
  - Yanlış için: Konuyu bilmiyorum / Dikkatsizlik / İşlem hatası / Süre yetmedi / Soruyu yanlış yorumladım.
  - Boş için: Hiç fikrim yoktu / Başladım ama bitiremedim / Süre yetmedi.
- **Tekrar sistemi:**
  - Her hata 2. günde ve 7. günde "Bugün tekrar çöz" listesine düşer.
  - Tekrarda önce sadece soru görünür; çözüm "Çözümü göster" ile açılır.
  - "Yine yapamadım" denirse hata 2 gün sonra tekrar çıkar. Kaçırılan tekrarlar "gecikti" etiketiyle listede kalır.
- **Denemeler:**
  - TYT ve AYT için ders ders doğru/yanlış/boş girilir; net kendiliğinden hesaplanır (4 yanlış 1 doğruyu götürür).
  - Ders bazında net grafikleri ve tablo görünümü vardır.
  - Kaydettikten sonra "Bu denemedeki yanlışları hata defterine ekle" akışı açılır.
- **Zincir ve geçmiş:**
  - Bir gün, o günün bütün görevleri (yanlışlar kapatılmış olarak) ve o güne düşen tekrarlar bitince yeşil sayılır.
  - Gün sabah 04:00'te kapanır.
  - "Bugün çalışamadım" zinciri kırmaz, dondurur; haftada 1 gün hakkı vardır.
  - Takvimden her günün ayrıntısı görülür. 2 günden eski günler kilitlenir.
- **Akşam kapanışı:** "Bugün en çok nerede zorlandın?" sorusuna konu seçilerek ya da kısa notla cevap verilir.

**Takipçi**
- **Haftalık özet:**
  - En üstte bu haftanın **yanlış kapatma oranı**; ayrıca görev tamamlama ve zincir.
  - Yanlışları kapatılmamış görevler kırmızı listede.
  - Programa uyum ve en çok atlanan ders.
  - Bekleyen ve kaçırılmış tekrarlar.
  - "Takıldığı konular": aynı konuda en az 2 kez "yine yapamadım" denenler.
  - En çok hata biriken 5 konu ve hata sebeplerinin dağılımı.
  - Akşam notları ve net trendi.
  - Haftalık hedef (tuttu/tutmadı), öğrenciye not, **WhatsApp'a gönder** ve CSV dışa aktarma.
- **Haftalık program:**
  - Bir kez kurulur ve **her hafta aynen tekrar eder**.
  - Değişiklik bugünden itibaren geçerli olur, geçmiş günler değişmez.
  - "Her gün / Hafta içi / Hafta sonu" kısayolları var.
  - En çok hata biriken konular öneri olarak gösterilir.
  - Belli bir güne tek seferlik görev de eklenebilir.
- **Konu durumu:**
  - Ders ders konu ısı haritası: kırmızı = çok hata ya da takılıyor, sarı = kapatılıyor, yeşil = 2 haftadır hata yok.
  - Konu ekleme, ad değiştirme ve gizleme (ÖSYM kılavuzu değişirse kod değiştirmeden güncellenir).
  - Kitap ve deneme yayını listesi yönetimi.
- Takipçi öğrencinin verisini değiştiremez, sadece görür.

Konu listesi TYT/AYT sayısal (2026 ÖSYM kapsamı) olarak hazır gelir. 2027 için resmî bir konu değişikliği
duyurulmadı; MEB'e göre yeni müfredata uygun soru modeli 2028 YKS'de başlıyor. Kılavuz çıkınca
**Konular → Konuları düzenle** ekranından güncelleyebilirsin.

---

## Kurulum (sunucuda bir kez)

Gerekenler:
- Docker ve Docker Compose eklentisi kurulu bir Linux sunucu.
- Sunucuda 80 ve 443 portları dışarıya açık olmalı.

```bash
# 1) Docker yoksa (Ubuntu/Debian):
curl -fsSL https://get.docker.com | sh

# 2) Kodu al
git clone https://github.com/burakkkunver/yks-takip.git
cd yks-takip

# 3) Ayar dosyası
cp .env.example .env
nano .env
```

`.env` içinde:
- **DOMAIN:** Alan adın yoksa sunucunun IP adresindeki noktaları tireye çevir ve sonuna `.sslip.io` ekle.
  Örnek: IP `95.12.34.56` ise `DOMAIN=95-12-34-56.sslip.io`. (sslip.io ücretsizdir, bu adı otomatik olarak IP'ne yönlendirir.)
  IP adresini öğrenmek için: `curl -4 ifconfig.me`.
- **Şifreler:** Öğrenci ve takipçi için kullanıcı adı ve güçlü bir şifre yaz.

```bash
# 4) Başlat
docker compose up -d --build

# 5) Kontrol
docker compose ps                  # app "healthy", caddy ve backup "Up" olmalı
docker compose logs -f caddy       # ilk açılışta sertifika alınır (birkaç saniye), Ctrl+C ile çık
```

Tarayıcıda `https://DOMAIN` adresini aç ve `.env`'deki kullanıcı adı/şifre ile gir.

> Güvenlik duvarı (ufw) kullanıyorsan: `sudo ufw allow 80,443/tcp`
> Bulut sağlayıcının panelinde (Hetzner, AWS vb.) de 80 ve 443 portlarına izin ver.

## Güncelleme

```bash
cd yks-takip
git pull
docker compose up -d --build
```

Veriler (`data/`) ve yedekler (`backups/`) güncellemede silinmez. Telefondaki uygulama bir sonraki açılışta yeni sürümü kendisi alır.

## Yedekler

- Her gece **03:30'da** (Türkiye saati) `backups/yks-TARIH.tar.gz` oluşur. İçinde veritabanı ve bütün fotoğraflar var.
- Son 30 yedek saklanır (`.env` içinde `YKS_BACKUP_KEEP` ile değişir).
- Elle yedek almak için: `docker compose exec backup python -m yks.backup simdi`
- Sunucu bozulursa diye yedekleri arada bir kendi bilgisayarına da indir:
  `scp kullanici@sunucu:~/yks-takip/backups/*.tar.gz .`

### Yedekten geri dönme

```bash
cd yks-takip
./backup/geri-yukle.sh                                       # yedekleri listeler
./backup/geri-yukle.sh backups/yks-2026-11-04_0330.tar.gz    # "evet" yazınca geri yükler
```

Betik uygulamayı durdurur ve şu anki veriyi silmez, `data.onceki-TARIH` klasörüne taşır. Sonra yedeği açar ve uygulamayı yeniden başlatır.

**Başka bir sunucuya taşıma:** Yeni sunucuda kurulumu yap, yedek dosyasını `backups/` klasörüne kopyala ve aynı komutu çalıştır.

## Şifre ve kullanıcı işlemleri

```bash
docker compose exec app python -m yks.manage sifre ogrenci        # yeni şifre sorar, açık oturumları kapatır
docker compose exec app python -m yks.manage listele
docker compose exec app python -m yks.manage kullanici ayse takipci "Ayşe"   # ikinci bir takipçi ekle
```

Oturum 180 gün açık kalır; uygulama kullanıldıkça süre uzar.

## Telefona "Ana ekrana ekle" (Android)

1. Telefonda **Chrome** ile `https://DOMAIN` adresini aç ve giriş yap.
2. Sağ üstteki **⋮** menüsüne dokun.
3. **"Ana ekrana ekle"** ya da **"Uygulamayı yükle"** seçeneğine dokun, sonra **Yükle / Ekle** de.
4. Ana ekranda **YKS Takip** simgesi çıkar. Uygulama gibi tam ekran açılır ve oturum açık kalır.
5. Simgeye uzun basınca **"Hata ekle"** ve **"Deneme gir"** kısayolları çıkar.
6. Ekran görüntüsünden hata eklemek için: galeride görsele dokun → **Paylaş** → **YKS Takip**.

> iPhone: Safari ile aç → Paylaş düğmesi → "Ana Ekrana Ekle". (iPhone'da galeriden paylaşma özelliği çalışmaz.)

## Geliştirme

```bash
cd app
pip install -r requirements.txt pytest httpx
python -m pytest -q tests                      # API testleri
YKS_DATA_DIR=./data YKS_SECURE_COOKIE=0 \
YKS_OGRENCI_KULLANICI=ali YKS_OGRENCI_SIFRE=ogrenci123 \
YKS_TAKIPCI_KULLANICI=burak YKS_TAKIPCI_SIFRE=takipci123 \
python -m uvicorn yks.main:app --reload --port 8000
```

Klasör yapısı:

```
docker-compose.yml   Caddyfile   .env.example
backup/geri-yukle.sh
app/
  Dockerfile  requirements.txt
  yks/
    main.py        uygulama girişi
    db.py          SQLite şeması
    seed.py        dersler, TYT/AYT konuları, sebepler, deneme bölümleri
    logic.py       program → günlük görev, tamamlanma kuralı, tekrar, zincir, konu durumu
    api_*.py       uç noktalar (giriş/sabitler, günlük akış, denemeler, takipçi)
    backup.py      gece yedeği     manage.py   şifre/kullanıcı komutları
    static/        arayüz (HTML/CSS/JS, derleme adımı yok), manifest ve service worker
  tests/
```

## Sonraki sürümler için fikirler (henüz yok)

- Elle işaretlenen konu haritası (başlamadım / çalışıyorum / oturdu)
- Akşam hatırlatma bildirimi (web push)
- Özel ders öğretmeni için PDF hata raporu
