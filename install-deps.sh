#!/bin/bash
set -e

BOT_DIR="${BOT_DIR:-/root/BotVPN}"
APP_NAME="${APP_NAME:-sellvpn}"
START_PM2="${START_PM2:-1}"

log(){ echo -e "\033[1;32m[OK]\033[0m $*"; }
warn(){ echo -e "\033[1;33m[WARN]\033[0m $*"; }
fail(){ echo -e "\033[1;31m[ERR]\033[0m $*"; exit 1; }

wait_apt_lock(){
  local waited=0
  while fuser /var/lib/dpkg/lock-frontend >/dev/null 2>&1 || \
        fuser /var/lib/dpkg/lock >/dev/null 2>&1 || \
        fuser /var/cache/apt/archives/lock >/dev/null 2>&1; do
    warn "APT/dpkg sedang dipakai proses lain. Menunggu 10 detik..."
    sleep 10
    waited=$((waited+10))
    if [ "$waited" -ge 900 ]; then
      fail "APT lock terlalu lama. Cek proses: ps aux | grep -E 'apt|dpkg|unattended'"
    fi
  done
}

install_base_packages(){
  wait_apt_lock
  apt update -y
  wait_apt_lock
  DEBIAN_FRONTEND=noninteractive apt install -y curl git unzip jq cron ca-certificates build-essential python3 make g++ sqlite3 libsqlite3-dev
}

install_node_pm2(){
  if ! command -v node >/dev/null 2>&1 || ! node -v | grep -q '^v20\.'; then
    warn "Menginstall Node.js 20.x"
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    wait_apt_lock
    DEBIAN_FRONTEND=noninteractive apt install -y nodejs
  else
    log "Node.js sudah ada: $(node -v)"
  fi

  npm install -g pm2@latest
  pm2 update || true
}

install_node_modules(){
  cd "$BOT_DIR"

  # Jangan pakai npm install sqlite3 biasa di Ubuntu 20, karena bisa ambil binary GLIBC baru.
  npm install --save express@^4.18.2 axios@^1.8.4 telegraf@^4.16.3 winston@^3.17.0 dotenv@^16.4.7
  rm -rf node_modules/sqlite3
  npm_config_build_from_source=true npm install --save sqlite3@5.1.6

  node -e "require('winston'); require('axios'); require('telegraf'); require('express'); require('sqlite3'); console.log('ALL MODULE OK')"
}

start_pm2(){
  cd "$BOT_DIR"
  pm2 delete "$APP_NAME" >/dev/null 2>&1 || true
  if [ -f ecosystem.config.js ]; then
    pm2 start ecosystem.config.js --only "$APP_NAME" || pm2 start app.js --name "$APP_NAME"
  else
    pm2 start app.js --name "$APP_NAME"
  fi
  pm2 save
}

main(){
  [ -d "$BOT_DIR" ] || fail "Folder bot tidak ditemukan: $BOT_DIR"
  install_base_packages
  install_node_pm2
  install_node_modules
  if [ "$START_PM2" = "1" ]; then
    start_pm2
    pm2 list
  else
    log "START_PM2=0, dependency saja tanpa menjalankan PM2."
  fi
  log "Dependency sudah aman. SQLite3 sudah build-from-source, Winston/Telegraf/Axios/Express sudah terinstall."
}

main "$@"
