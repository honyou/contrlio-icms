#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env.production"
CREDENTIAL_FILE=/root/contrlio-admin-login.txt

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script as root on the deployment server." >&2
  exit 1
fi
if [ -e "$ENV_FILE" ] || [ -e "$CREDENTIAL_FILE" ]; then
  echo "Refusing to overwrite existing production configuration or login credentials." >&2
  exit 1
fi

python3 - "$ENV_FILE" "$CREDENTIAL_FILE" <<'PY'
from pathlib import Path
import base64
import secrets
import sys

env_path = Path(sys.argv[1])
credential_path = Path(sys.argv[2])
admin_email = "admin@contrlio.com"
admin_password = secrets.token_urlsafe(24)
database_password = secrets.token_urlsafe(32)
minio_password = secrets.token_urlsafe(36)
jwt_secret = secrets.token_urlsafe(48)
fernet_key = base64.urlsafe_b64encode(secrets.token_bytes(32)).decode("ascii")

values = {
    "APP_ENV": "production",
    "FRONTEND_URL": "https://contrlio.com",
    "API_URL": "https://contrlio.com",
    "DATABASE_URL": f"postgresql+psycopg://icms:{database_password}@postgres:5432/icms",
    "POSTGRES_DB": "icms",
    "POSTGRES_USER": "icms",
    "POSTGRES_PASSWORD": database_password,
    "REDIS_URL": "redis://redis:6379/0",
    "MINIO_ENDPOINT": "minio:9000",
    "MINIO_ACCESS_KEY": "contrlio-production",
    "MINIO_SECRET_KEY": minio_password,
    "MINIO_ROOT_USER": "contrlio-production",
    "MINIO_ROOT_PASSWORD": minio_password,
    "MINIO_BUCKET": "icms-evidence",
    "JWT_SECRET": jwt_secret,
    "ADMIN_EMAIL": admin_email,
    "ADMIN_PASSWORD": admin_password,
    "AI_ENCRYPTION_KEY": fernet_key,
    "EVIDENCE_MAX_BYTES": "20971520",
    "POSTGRES_IMAGE": "mirror.gcr.io/library/postgres:16-alpine",
    "REDIS_IMAGE": "mirror.gcr.io/library/redis:7-alpine",
    "MINIO_IMAGE": "bitnamilegacy/minio:latest",
}

env_path.write_text("".join(f"{key}={value}\n" for key, value in values.items()), encoding="utf-8")
env_path.chmod(0o600)
credential_path.write_text(
    f"URL=https://contrlio.com\nADMIN_EMAIL={admin_email}\nADMIN_PASSWORD={admin_password}\n",
    encoding="utf-8",
)
credential_path.chmod(0o600)
PY

echo "Production secrets created with mode 600. Initial credentials are in /root/contrlio-admin-login.txt."
