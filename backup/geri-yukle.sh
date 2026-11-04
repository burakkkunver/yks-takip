#!/usr/bin/env bash
# Yedekten geri dönme.
#   ./backup/geri-yukle.sh                      -> mevcut yedekleri listeler
#   ./backup/geri-yukle.sh backups/yks-2026-11-04_0330.tar.gz
set -euo pipefail
cd "$(dirname "$0")/.."

if [ $# -eq 0 ]; then
  echo "Mevcut yedekler (en yeni en altta):"
  ls -1 backups/yks-*.tar.gz 2>/dev/null || echo "  (yedek yok)"
  echo
  echo "Kullanım: $0 backups/yks-TARIH.tar.gz"
  exit 0
fi

FILE="$1"
[ -f "$FILE" ] || { echo "Dosya bulunamadı: $FILE"; exit 1; }

read -r -p "Şu anki veriler '$FILE' ile değiştirilecek. Devam? (evet/hayır) " ok
[ "$ok" = "evet" ] || { echo "Vazgeçildi."; exit 0; }

STAMP=$(date +%Y%m%d-%H%M%S)
docker compose stop app backup

# Güvenlik için şu anki hali de sakla
if [ -d data ]; then
  mv data "data.onceki-$STAMP"
  echo "Şu anki veri data.onceki-$STAMP klasörüne taşındı."
fi
mkdir -p data
tar -xzf "$FILE" -C data

docker compose start app backup
echo "Geri yükleme tamam. Uygulama yeniden başladı."
