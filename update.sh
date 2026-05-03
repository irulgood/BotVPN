#!/usr/bin/env bash
set -Eeuo pipefail

# BotVPN safe updater
# Tujuan: update file bot tanpa install ulang dan tanpa mengisi ulang .vars.json.
# File penting seperti .vars.json, database, reseller/trial db, dan receipts akan dibackup lalu direstore.

APP_NAME="${APP_NAME:-sellvpn}"
BOT_DIR="${BOT_DIR:-/root/BotVPN}"
REPO_URL="${REPO_URL:-https://github.com/irulgood/BotVPN.git}"
BRANCH="${BRANCH:-main}"
BACKUP_ROOT="${BACKUP_ROOT:-/root/BotVPN-backups}"

TS="$(date +%Y%m%d-%H%M%S)"
BACKUP_DIR="$BACKUP_ROOT/update-$TS"
TMP_DIR="/tmp/botvpn-update-$TS"

log() { echo -e "\033[1;32m[UPDATE]\033[0m $*"; }
warn() { echo -e "\033[1;33m[WARN]\033[0m $*"; }
err() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }

need_cmd() {
  command -v "$1" >/dev/null 2>&1 || {
    err "Command '$1' belum ada. Install dulu: apt install -y $1"
    exit 1
  }
}

backup_path() {
  local p="$1"
  if [ -e "$BOT_DIR/$p" ]; then
    mkdir -p "$BACKUP_DIR/$(dirname "$p")"
    cp -a "$BOT_DIR/$p" "$BACKUP_DIR/$p"
    log "Backup: $p"
  fi
}

restore_path() {
  local p="$1"
  if [ -e "$BACKUP_DIR/$p" ]; then
    mkdir -p "$BOT_DIR/$(dirname "$p")"
    rm -rf "$BOT_DIR/$p"
    cp -a "$BACKUP_DIR/$p" "$BOT_DIR/$p"
    log "Restore: $p"
  fi
}

log "Mulai update BotVPN"
log "Folder bot : $BOT_DIR"
log "App PM2    : $APP_NAME"

need_cmd pm2
need_cmd node
need_cmd npm
need_cmd curl
need_cmd tar

mkdir -p "$BOT_DIR" "$BACKUP_DIR"
cd "$BOT_DIR"

# Simpan checksum package.json untuk tahu perlu npm install atau tidak.
OLD_PKG_SUM=""
if [ -f package.json ]; then
  OLD_PKG_SUM="$(sha256sum package.json | awk '{print $1}')"
fi

# Backup file yang tidak boleh hilang saat update.
backup_path ".vars.json"
backup_path "sellvpn.db"
backup_path "ressel.db"
backup_path "trial.db"
backup_path "bot-combined.log"
backup_path "bot-error.log"
backup_path "receipts"
backup_path "qris-cooldown-state.json"
backup_path "qris-history-state.json"
backup_path "orkut-rate-limit.json"
backup_path "modules"

# Stop sementara supaya file aman saat replace.
pm2 stop "$APP_NAME" >/dev/null 2>&1 || true

# Metode 1: kalau folder ini repo git, pakai git pull/reset.
if [ -d .git ] && command -v git >/dev/null 2>&1; then
  log "Mode update: git"
  git remote get-url origin >/dev/null 2>&1 || git remote add origin "$REPO_URL"
  git fetch origin "$BRANCH"
  git reset --hard "origin/$BRANCH"
else
  # Metode 2: download ZIP dari GitHub lalu copy, tanpa menghapus file penting.
  log "Mode update: download zip GitHub"
  rm -rf "$TMP_DIR"
  mkdir -p "$TMP_DIR"
  ZIP_URL="${ZIP_URL:-https://github.com/irulgood/BotVPN/archive/refs/heads/$BRANCH.tar.gz}"
  log "Download: $ZIP_URL"
  curl -L --retry 3 --connect-timeout 20 -o "$TMP_DIR/source.tar.gz" "$ZIP_URL"
  tar -xzf "$TMP_DIR/source.tar.gz" -C "$TMP_DIR"
  SRC_DIR="$(find "$TMP_DIR" -mindepth 1 -maxdepth 1 -type d | head -n 1)"
  if [ -z "$SRC_DIR" ] || [ ! -d "$SRC_DIR" ]; then
    err "Gagal membaca hasil download repo."
    exit 1
  fi

  # Copy file baru. File penting akan direstore setelahnya.
  shopt -s dotglob
  for item in "$SRC_DIR"/*; do
    base="$(basename "$item")"
    case "$base" in
      .git|node_modules|.vars.json|sellvpn.db|ressel.db|trial.db|receipts|bot-combined.log|bot-error.log)
        continue
        ;;
    esac
    rm -rf "$BOT_DIR/$base"
    cp -a "$item" "$BOT_DIR/$base"
  done
  shopt -u dotglob
fi

# Restore file penting setelah update.
restore_path ".vars.json"
restore_path "sellvpn.db"
restore_path "ressel.db"
restore_path "trial.db"
restore_path "receipts"
restore_path "qris-cooldown-state.json"
restore_path "qris-history-state.json"
restore_path "orkut-rate-limit.json"

# Pastikan .vars.json tetap ada.
if [ ! -f "$BOT_DIR/.vars.json" ]; then
  warn ".vars.json tidak ditemukan. Kalau ini install pertama, isi dulu .vars.json sebelum start bot."
fi

# Install dependency hanya kalau package.json berubah atau node_modules belum lengkap.
NEW_PKG_SUM=""
if [ -f package.json ]; then
  NEW_PKG_SUM="$(sha256sum package.json | awk '{print $1}')"
fi

NEED_NPM=0
if [ ! -d node_modules ]; then
  NEED_NPM=1
elif [ "$OLD_PKG_SUM" != "$NEW_PKG_SUM" ]; then
  NEED_NPM=1
elif ! node -e "require('winston'); require('axios'); require('telegraf'); require('express'); require('sqlite3')" >/dev/null 2>&1; then
  NEED_NPM=1
fi

if [ "$NEED_NPM" = "1" ]; then
  log "Dependency berubah/belum lengkap. Menjalankan npm install aman."
  npm install winston axios telegraf express dotenv >/dev/null
  npm_config_build_from_source=true npm install sqlite3@5.1.6 >/dev/null
else
  log "Dependency sudah lengkap. Skip npm install."
fi

# Validasi module utama.
node -e "require('winston'); require('axios'); require('telegraf'); require('express'); require('sqlite3'); console.log('MODULE OK')"

# Cek syntax file utama kalau ada.
if [ -f app.js ]; then node --check app.js >/dev/null; fi
if [ -f app_user.js ]; then node --check app_user.js >/dev/null; fi
if [ -f modules/payment-service.js ]; then node --check modules/payment-service.js >/dev/null; fi

# Restart/start PM2.
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  log "Restart PM2: $APP_NAME"
  pm2 restart "$APP_NAME" --update-env
else
  log "Start PM2 baru: $APP_NAME"
  pm2 start app.js --name "$APP_NAME" --restart-delay 5000 --max-memory-restart 300M
fi

pm2 save >/dev/null || true
pm2 list

log "Update selesai. Backup tersimpan di: $BACKUP_DIR"
log "Cek log: pm2 logs $APP_NAME --lines 50"
