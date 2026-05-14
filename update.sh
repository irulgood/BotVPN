#!/bin/bash
set -e

# Update BotVPN tanpa install ulang.
# Yang di-update:
# - app.js
# - app_user.js
# - semua file di folder modules/
#
# Yang TIDAK disentuh:
# - .vars.json
# - sellvpn.db
# - trial.db
# - ressel.db
# - receipts/
#
# Default:
BOT_DIR="${BOT_DIR:-/root/BotVPN}"
REPO_ZIP="${REPO_ZIP:-https://github.com/irulgood/BotVpn/archive/refs/heads/main.zip}"
PM2_NAME="${PM2_NAME:-sellvpn}"

TMP_DIR="/tmp/botvpn-update-$(date +%s)"
ZIP_FILE="$TMP_DIR/repo.zip"

echo "=== BotVPN Update Script ==="
echo "BOT_DIR : $BOT_DIR"
echo "REPO_ZIP: $REPO_ZIP"
echo "PM2_NAME: $PM2_NAME"
echo ""

if [ ! -d "$BOT_DIR" ]; then
  echo "ERROR: Folder bot tidak ditemukan: $BOT_DIR"
  exit 1
fi

command -v curl >/dev/null 2>&1 || {
  echo "ERROR: curl belum terinstall. Install: apt install -y curl"
  exit 1
}

command -v unzip >/dev/null 2>&1 || {
  echo "ERROR: unzip belum terinstall. Install: apt install -y unzip"
  exit 1
}

mkdir -p "$TMP_DIR"

echo "[1/7] Download repo terbaru..."
curl -L --fail --silent --show-error -o "$ZIP_FILE" "$REPO_ZIP"

if [ ! -s "$ZIP_FILE" ]; then
  echo "ERROR: Gagal download repo atau file kosong."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "[2/7] Extract repo..."
unzip -q "$ZIP_FILE" -d "$TMP_DIR"

SRC_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d -name 'BotVpn-*' -o -name 'BotVPN-*' | head -n 1)"

if [ -z "$SRC_DIR" ]; then
  SRC_DIR="$(find "$TMP_DIR" -maxdepth 1 -type d | grep -v "^$TMP_DIR$" | head -n 1)"
fi

if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
  echo "ERROR: Folder hasil extract repo tidak ditemukan."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "Source: $SRC_DIR"

echo "[3/7] Validasi file sumber..."
if [ ! -f "$SRC_DIR/app.js" ]; then
  echo "ERROR: app.js tidak ditemukan di repo."
  rm -rf "$TMP_DIR"
  exit 1
fi

if [ ! -f "$SRC_DIR/app_user.js" ]; then
  echo "ERROR: app_user.js tidak ditemukan di repo."
  rm -rf "$TMP_DIR"
  exit 1
fi

if [ ! -d "$SRC_DIR/modules" ]; then
  echo "ERROR: folder modules/ tidak ditemukan di repo."
  rm -rf "$TMP_DIR"
  exit 1
fi

echo "[4/7] Backup file lama..."
BACKUP_DIR="$BOT_DIR/backup-before-update-$(date +%Y%m%d-%H%M%S)"
mkdir -p "$BACKUP_DIR"

[ -f "$BOT_DIR/app.js" ] && cp "$BOT_DIR/app.js" "$BACKUP_DIR/app.js"
[ -f "$BOT_DIR/app_user.js" ] && cp "$BOT_DIR/app_user.js" "$BACKUP_DIR/app_user.js"
[ -d "$BOT_DIR/modules" ] && cp -r "$BOT_DIR/modules" "$BACKUP_DIR/modules"

echo "Backup tersimpan di: $BACKUP_DIR"

echo "[5/7] Update app.js, app_user.js, dan modules/..."
cp "$SRC_DIR/app.js" "$BOT_DIR/app.js"
cp "$SRC_DIR/app_user.js" "$BOT_DIR/app_user.js"

mkdir -p "$BOT_DIR/modules"
cp -r "$SRC_DIR/modules/." "$BOT_DIR/modules/"

echo "[6/7] Cek syntax Node.js..."
cd "$BOT_DIR"

if command -v node >/dev/null 2>&1; then
  node -c app.js
  node -c app_user.js

  if [ -f "modules/payment-service.js" ]; then
    node -c modules/payment-service.js
  fi
else
  echo "WARNING: node tidak ditemukan, skip syntax check."
fi

echo "[7/7] Restart PM2..."
if command -v pm2 >/dev/null 2>&1; then
  if pm2 describe "$PM2_NAME" >/dev/null 2>&1; then
    pm2 restart "$PM2_NAME"
  else
    pm2 start app.js --name "$PM2_NAME"
  fi
  pm2 save
  pm2 list
else
  echo "WARNING: pm2 tidak ditemukan. Jalankan manual: node app.js"
fi

rm -rf "$TMP_DIR"

echo ""
echo "Update selesai."
echo "Yang diupdate: app.js, app_user.js, modules/"
echo "Yang aman/tidak disentuh: .vars.json, sellvpn.db, trial.db, ressel.db"
