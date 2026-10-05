#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
DOMAIN=contrlio.com
ENV_FILE="$ROOT_DIR/.env.production"

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root on the deployment server." >&2
  exit 1
fi
if [ ! -f "$ENV_FILE" ]; then
  echo "Missing .env.production. Run scripts/init-production-env.sh first." >&2
  exit 1
fi
if [ -z "${CERTBOT_EMAIL:-}" ]; then
  echo "Set CERTBOT_EMAIL to the certificate renewal contact before deployment." >&2
  exit 1
fi

cd "$ROOT_DIR"
apt-get update
DEBIAN_FRONTEND=noninteractive apt-get install -y nginx certbot

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp
  ufw allow 443/tcp
fi

install -d -m 755 /var/www/certbot
install -m 644 infrastructure/nginx/contrlio-http-bootstrap.conf /etc/nginx/sites-available/contrlio.conf
ln -sfn /etc/nginx/sites-available/contrlio.conf /etc/nginx/sites-enabled/contrlio.conf
nginx -t
systemctl enable --now nginx
systemctl reload nginx

docker compose --env-file "$ENV_FILE" -f compose.production.yml up -d --build

certbot certonly --webroot -w /var/www/certbot --non-interactive --agree-tos --no-eff-email --email "$CERTBOT_EMAIL" -d "$DOMAIN"

install -m 644 infrastructure/nginx/contrlio-https.conf /etc/nginx/sites-available/contrlio.conf
nginx -t
systemctl reload nginx
systemctl enable --now certbot.timer
install -d -m 755 /etc/letsencrypt/renewal-hooks/deploy
cat > /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh <<'HOOK'
#!/bin/sh
systemctl reload nginx
HOOK
chmod 755 /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
certbot renew --dry-run

curl --fail --silent --show-error https://contrlio.com/health
curl --fail --silent --show-error --output /dev/null --write-out '\nfrontend HTTP %{http_code}\n' https://contrlio.com/
docker compose --env-file "$ENV_FILE" -f compose.production.yml ps
sh scripts/install-health-monitor.sh
