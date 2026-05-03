#!/bin/bash
set -e

BOT_DIR="/root/BotVPN"
APP_NAME="sellvpn"

log(){ echo -e "\033[1;32m[OK]\033[0m $*"; }
warn(){ echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail(){ echo -e "\033[1;31m[ERR]\033[0m $*"; exit 1; }

[ -d "$BOT_DIR" ] || fail "Folder $BOT_DIR tidak ditemukan"
cd "$BOT_DIR"

# Backup config/database dulu
mkdir -p /root/BotVPN-backup
cp -f .vars.json /root/BotVPN-backup/.vars.json.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
cp -f sellvpn.db /root/BotVPN-backup/sellvpn.db.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
cp -f trial.db /root/BotVPN-backup/trial.db.$(date +%Y%m%d%H%M%S) 2>/dev/null || true
cp -f ressel.db /root/BotVPN-backup/ressel.db.$(date +%Y%m%d%H%M%S) 2>/dev/null || true

if [ -d .git ]; then
  warn "Update dari GitHub..."
  git fetch --all || true
  git reset --hard origin/main || true
else
  warn "Folder bukan git repo. Skip git update, hanya repair dependency."
fi

chmod +x "$BOT_DIR"/*.sh "$BOT_DIR"/start "$BOT_DIR"/install-deps.sh 2>/dev/null || true

if [ -f "$BOT_DIR/install-deps.sh" ]; then
  APP_NAME="$APP_NAME" BOT_DIR="$BOT_DIR" bash "$BOT_DIR/install-deps.sh"
else
  apt update -y
  apt install -y build-essential python3 make g++ sqlite3 libsqlite3-dev jq curl git cron
  npm install -g pm2@latest
  npm install express axios telegraf winston dotenv
  rm -rf node_modules/sqlite3
  npm_config_build_from_source=true npm install sqlite3@5.1.6
  node -e "require('winston'); require('axios'); require('telegraf'); require('express'); require('sqlite3'); console.log('ALL MODULE OK')"
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  pm2 start app.js --name "$APP_NAME"
  pm2 save
fi

log "Update/repair selesai."
pm2 list
