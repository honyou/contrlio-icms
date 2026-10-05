#!/bin/sh
set -eu

attempt=0
until python - <<'PY'
from minio import Minio
from sqlalchemy import create_engine, text
from app.config import settings

with create_engine(settings.database_url).connect() as connection:
    connection.execute(text("SELECT 1"))
Minio(
    settings.minio_endpoint,
    access_key=settings.minio_access_key,
    secret_key=settings.minio_secret_key,
    secure=False,
).list_buckets()
PY
do
  attempt=$((attempt + 1))
  if [ "$attempt" -ge 60 ]; then
    echo "Database or MinIO did not become ready within 120 seconds." >&2
    exit 1
  fi
  sleep 2
done

alembic upgrade head
python -m app.bootstrap
exec uvicorn app.main:app --host 0.0.0.0 --port 8000 --proxy-headers --forwarded-allow-ips=127.0.0.1
