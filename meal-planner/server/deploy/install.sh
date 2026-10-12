#!/usr/bin/env bash
# Run as root on the VPS, from the server/ folder:   sudo ./deploy/install.sh
# Needs Node 18+ (node -v). Safe to re-run to update; it keeps your key and data.
set -euo pipefail
cd "$(dirname "$0")/.."

NODE=$(command -v node || true)
if [ -z "$NODE" ] || [ "$("$NODE" -p 'process.versions.node.split(".")[0]')" -lt 18 ]; then
  echo "Node 18+ is required. Install it first, e.g.:" >&2
  echo "  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y nodejs" >&2
  exit 1
fi
NODE=$(readlink -f "$NODE")

install -d /opt/lista /etc/lista
install -m 644 server.js package.json /opt/lista/

if [ ! -f /etc/lista/env ]; then
  KEY=$(head -c 32 /dev/urandom | base64 | tr -dc 'A-Za-z0-9' | head -c 24)
  printf 'HOUSEHOLD_KEY=%s\nPORT=3000\nDATA_FILE=/var/lib/lista/data.json\n' "$KEY" > /etc/lista/env
  chmod 600 /etc/lista/env
  echo "Created household key: $KEY   (kept in /etc/lista/env)"
fi

sed "s|@NODE@|$NODE|" deploy/lista.service > /etc/systemd/system/lista.service
chmod 644 /etc/systemd/system/lista.service
systemctl daemon-reload
systemctl enable lista >/dev/null
systemctl restart lista
sleep 1
curl -fsS http://127.0.0.1:3000/api/health && echo "  <- server is up"
echo "Household key: $(grep ^HOUSEHOLD_KEY= /etc/lista/env | cut -d= -f2)"
