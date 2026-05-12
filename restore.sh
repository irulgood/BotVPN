#!/bin/bash

BOT_DIR="/root/BotVPN"
TMP_DIR="/tmp/botvpn-restore-$(date +%s)"

echo "=== Restore Backup BotVPN ==="
echo ""

read -p "Masukkan direct link file backup ZIP: " BACKUP_URL

if [ -z "$BACKUP_URL" ]; then
  echo "Link backup tidak boleh kosong."
  exit 1
fi

if [ ! -d "$BOT_DIR" ]; then
  echo "Folder bot tidak ditemukan: $BOT_DIR"
  exit 1
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl belum terinstall. Install dulu: apt install -y curl"
  exit 1
}

command -v unzip >/dev/null 2>&1 || {
  echo "unzip belum terinstall. Install dulu: apt install -y unzip"
  exit 1
}

mkdir -p "$TMP_DIR"
ZIP_FILE="$TMP_DIR/backup.zip"

echo ""
echo "Download backup..."
curl -L --fail --silent --show-error -o "$ZIP_FILE" "$BACKUP_URL"

if [ ! -s "$ZIP_FILE" ]; then
  echo "Gagal download backup atau file kosong."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Extract backup..."
unzip -q "$ZIP_FILE" -d "$TMP_DIR/extracted"

SELLVPN_DB=$(find "$TMP_DIR/extracted" -type f -name "sellvpn.db" | head -n 1)
TRIAL_DB=$(find "$TMP_DIR/extracted" -type f -name "trial.db" | head -n 1)
RESSEL_DB=$(find "$TMP_DIR/extracted" -type f -name "ressel.db" | head -n 1)

if [ -z "$SELLVPN_DB" ]; then
  echo "File sellvpn.db tidak ditemukan di dalam backup ZIP."
  echo "Isi file ZIP:"
  find "$TMP_DIR/extracted" -type f
  rm -rf "$TMP_DIR"
  exit 1
fi

echo ""
echo "File ditemukan:"
echo "- sellvpn.db: $SELLVPN_DB"
[ -n "$TRIAL_DB" ] && echo "- trial.db: $TRIAL_DB" || echo "- trial.db: tidak ada, dilewati"
[ -n "$RESSEL_DB" ] && echo "- ressel.db: $RESSEL_DB" || echo "- ressel.db: tidak ada, dilewati"

echo ""
read -p "Lanjut restore dan TIMPA database lama? ketik YA untuk lanjut: " CONFIRM

if [ "$CONFIRM" != "YA" ]; then
  echo "Restore dibatalkan."
  rm -rf "$TMP_DIR"
  exit 0
fi

echo ""
echo "Stop PM2 sellvpn..."
pm2 stop sellvpn 2>/dev/null || true

echo ""
echo "Restore file database..."

cp "$SELLVPN_DB" "$BOT_DIR/sellvpn.db"
echo "Restored: sellvpn.db"

if [ -n "$TRIAL_DB" ]; then
  cp "$TRIAL_DB" "$BOT_DIR/trial.db"
  echo "Restored: trial.db"
fi

if [ -n "$RESSEL_DB" ]; then
  cp "$RESSEL_DB" "$BOT_DIR/ressel.db"
  echo "Restored: ressel.db"
fi

chmod 600 "$BOT_DIR"/*.db 2>/dev/null || true

echo ""
echo "Restart PM2 sellvpn..."
pm2 restart sellvpn 2>/dev/null || pm2 start "$BOT_DIR/app.js" --name sellvpn

pm2 save

rm -rf "$TMP_DIR"

echo ""
echo "Restore selesai."
pm2 list
