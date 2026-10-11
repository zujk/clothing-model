#!/usr/bin/env bash
# Run as root on the VPS, from the server/ folder:   sudo ./deploy/install.sh
# Needs Node 18+ (node -v). Safe to re-run to update; it keeps your key and data.
set -euo pipefail
cd "$(dirname "$0")/.."

install -d /opt/lista /etc/lista
install -m 644 server.js package.json /opt/lista/

if [ ! -f /etc/lista/env ]; then
  KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  printf 'HOUSEHOLD_KEY=%s\nPORT=3000\nDATA_FILE=/var/lib/lista/data.json\n' "$KEY" > /etc/lista/env
  chmod 600 /etc/lista/env
  echo "Created household key: $KEY   (kept in /etc/lista/env)"
fi

install -m 644 deploy/lista.service /etc/systemd/system/lista.service
systemctl daemon-reload
systemctl enable lista >/dev/null
systemctl restart lista
sleep 1
curl -fsS http://127.0.0.1:3000/api/health && echo "  <- server is up"
echo "Household key: $(grep ^HOUSEHOLD_KEY= /etc/lista/env | cut -d= -f2)"
