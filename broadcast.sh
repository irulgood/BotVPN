#!/bin/bash

read -p "Masukkan BOT TOKEN: " BOT_TOKEN
read -p "Masukkan direct link sellvpn.db: " DB_URL

echo ""
echo "Tulis pesan broadcast."
echo "Kalau sudah selesai, tekan ENTER lalu ketik: END"
echo "--------------------------------------------"

MESSAGE=""
while IFS= read -r LINE; do
  if [ "$LINE" = "END" ]; then
    break
  fi
  MESSAGE="${MESSAGE}${LINE}
"
done

DB_FILE="/tmp/sellvpn-broadcast-$(date +%s).db"

if [ -z "$BOT_TOKEN" ]; then
  echo "BOT TOKEN tidak boleh kosong."
  exit 1
fi

if [ -z "$DB_URL" ]; then
  echo "Link database tidak boleh kosong."
  exit 1
fi

if [ -z "$MESSAGE" ]; then
  echo "Pesan broadcast tidak boleh kosong."
  exit 1
fi

command -v curl >/dev/null 2>&1 || {
  echo "curl belum terinstall. Install dulu: apt install -y curl"
  exit 1
}

command -v sqlite3 >/dev/null 2>&1 || {
  echo "sqlite3 belum terinstall. Install dulu: apt install -y sqlite3"
  exit 1
}

echo ""
echo "Download database..."
curl -L --fail --silent --show-error -o "$DB_FILE" "$DB_URL"

if [ ! -s "$DB_FILE" ]; then
  echo "Gagal download database atau file kosong."
  exit 1
fi

if ! sqlite3 "$DB_FILE" "SELECT name FROM sqlite_master WHERE type='table' AND name='users';" | grep -q users; then
  echo "Database tidak valid atau tabel users tidak ditemukan."
  rm -f "$DB_FILE"
  exit 1
fi

TOTAL=$(sqlite3 "$DB_FILE" "SELECT COUNT(*) FROM users;")
echo "Total user ditemukan: $TOTAL"

echo ""
echo "Preview pesan:"
echo "--------------------------------------------"
printf "%s\n" "$MESSAGE"
echo "--------------------------------------------"

read -p "Lanjut broadcast? ketik YA untuk lanjut: " CONFIRM
if [ "$CONFIRM" != "YA" ]; then
  echo "Broadcast dibatalkan."
  rm -f "$DB_FILE"
  exit 0
fi

echo ""
echo "Mulai broadcast..."

SUCCESS=0
FAILED=0

while read -r USER_ID; do
  [ -z "$USER_ID" ] && continue

  RESPONSE=$(curl -s -X POST "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d chat_id="$USER_ID" \
    --data-urlencode text="$MESSAGE")

  if echo "$RESPONSE" | grep -q '"ok":true'; then
    echo "Sukses kirim ke $USER_ID"
    SUCCESS=$((SUCCESS + 1))
  else
    echo "Gagal kirim ke $USER_ID | $RESPONSE"
    FAILED=$((FAILED + 1))
  fi

  sleep 0.1
done < <(sqlite3 "$DB_FILE" "SELECT user_id FROM users;")

rm -f "$DB_FILE"

echo ""
echo "Broadcast selesai."
echo "Sukses: $SUCCESS"
echo "Gagal : $FAILED"
