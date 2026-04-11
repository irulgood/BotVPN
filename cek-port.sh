#!/bin/bash

# Urutan tampilan (INI yang bikin rapi)
server_order=(
  "SG-VIP"
  "SG-VVIP"
  "SG-VVIP2"
  "SG-TEAM1"
  "ID-NUSA"
  "ID-NUSA2"
  "ID-NUSA-STB"
)

# Alias => domain
declare -A servers=(
  ["SG-VIP"]="sgvip.rajaserverpremium.web.id"
  ["SG-VVIP"]="sgvvip.rajaserverpremium.web.id"
  ["SG-VVIP2"]="sgvvip2.rajaserverpremium.web.id"
  ["SG-TEAM1"]="sgteam1.rajaserverpremium.web.id"
  ["ID-NUSA"]="idnusa.rajaserverpremium.web.id"
  ["ID-NUSA2"]="idnusa2.rajaserverpremium.web.id"
  ["ID-NUSA-STB"]="idnusastb.rajaserverpremium.web.id"
)

# Port + label
declare -A ports=(
  [22]="VPS LOGIN"
  [80]="NO TLS"
  [443]="TLS"
)

green="\e[32m"; red="\e[31m"; nc="\e[0m"

echo "🔍 Cek status server"
echo "-------------------------------------------"

for alias in "${server_order[@]}"; do
  host="${servers[$alias]}"
  echo -e "\n🌐 Server: $alias"

  for port in 22 80 443; do
    timeout 2 bash -c "</dev/tcp/$host/$port" &>/dev/null
    if [[ $? -eq 0 ]]; then
      echo -e "  Port $port (${ports[$port]}): ${green}OPEN${nc}"
    else
      echo -e "  Port $port (${ports[$port]}): ${red}CLOSED${nc}"
    fi
  done
done
