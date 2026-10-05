#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env.production"

if [ "$(id -u)" -ne 0 ]; then
  echo "请在生产服务器上以 root 身份安装定时健康检查。" >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "缺少 .env.production；先完成生产环境初始化。" >&2
  exit 1
fi

cat > /etc/systemd/system/contrlio-healthcheck.service <<UNIT
[Unit]
Description=Contrlio service health check and limited recovery
After=docker.service network-online.target
Wants=network-online.target

[Service]
Type=oneshot
User=root
WorkingDirectory=$ROOT_DIR
ExecStart=$ROOT_DIR/scripts/healthcheck-repair.sh
TimeoutStartSec=90
UNIT

cat > /etc/systemd/system/contrlio-healthcheck.timer <<'UNIT'
[Unit]
Description=Run Contrlio health check every five minutes

[Timer]
OnBootSec=2min
OnUnitActiveSec=5min
AccuracySec=30s
Unit=contrlio-healthcheck.service

[Install]
WantedBy=timers.target
UNIT

chmod 0644 /etc/systemd/system/contrlio-healthcheck.service /etc/systemd/system/contrlio-healthcheck.timer
systemctl daemon-reload
systemctl enable --now contrlio-healthcheck.timer
systemctl start contrlio-healthcheck.service
systemctl list-timers contrlio-healthcheck.timer --no-pager
