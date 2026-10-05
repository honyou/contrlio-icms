#!/bin/sh
set -eu

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
cd "$ROOT_DIR"
if [ ! -f .env ]; then
  cp .env.example .env
fi

python3 - <<'PY'
from pathlib import Path
import base64
import secrets

p = Path('.env')
rows = p.read_text().splitlines()
db_password = secrets.token_urlsafe(24)
minio_password = secrets.token_urlsafe(32)
minio_user = 'icms-local'
replace = {
    'DATABASE_URL': 'postgresql+psycopg://icms:' + db_password + '@localhost:5432/icms',
    'POSTGRES_PASSWORD': db_password,
    'MINIO_ACCESS_KEY': minio_user,
    'MINIO_ROOT_USER': minio_user,
    'MINIO_SECRET_KEY': minio_password,
    'MINIO_ROOT_PASSWORD': minio_password,
    'JWT_SECRET': secrets.token_urlsafe(48),
    'ADMIN_PASSWORD': secrets.token_urlsafe(20),
    'AI_ENCRYPTION_KEY': base64.urlsafe_b64encode(secrets.token_bytes(32)).decode('ascii'),
}
present = {line.split('=', 1)[0] for line in rows if '=' in line and not line.lstrip().startswith('#')}
for key, value in replace.items():
    if key not in present:
        rows.append(f'{key}={value}')
for key, value in replace.items():
    rows = [f'{key}={value}' if line.startswith(key + '=') and line.split('=', 1)[1].startswith('CHANGE_ME') else line for line in rows]
p.write_text('\n'.join(rows) + '\n')
p.chmod(0o600)
PY

printf '本地 .env 已生成并设为仅当前用户可读。管理员账号：'
sed -n 's/^ADMIN_EMAIL=//p' .env
printf '管理员密码已保存到本机 .env（不会显示或提交到 Git）。\n'
printf '接下来运行：make infra-up\n'
