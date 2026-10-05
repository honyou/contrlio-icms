#!/usr/bin/env bash
set -uo pipefail

ROOT_DIR=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
ENV_FILE="$ROOT_DIR/.env.production"
COMPOSE_FILE="$ROOT_DIR/compose.production.yml"
STATE_DIR=/var/lib/contrlio-healthcheck
LOCK_FILE=/run/lock/contrlio-healthcheck.lock
RESTART_COOLDOWN_SECONDS=1800
failed_services=()

log() {
  logger -t contrlio-healthcheck -- "$1" 2>/dev/null || true
  printf '%s\n' "$1"
}

if [[ ! -f "$ENV_FILE" ]]; then
  log "检查未运行：缺少 $ENV_FILE。"
  exit 1
fi

for command in docker curl python3 flock systemctl nginx; do
  if ! command -v "$command" >/dev/null 2>&1; then
    log "检查未运行：服务器缺少命令 $command。"
    exit 1
  fi
done

install -d -m 0755 /run/lock
install -d -m 0700 "$STATE_DIR"
exec 9>"$LOCK_FILE"
if ! flock -n 9; then
  exit 0
fi

COMPOSE=(docker compose --env-file "$ENV_FILE" -f "$COMPOSE_FILE")

collect_failures() {
  failed_services=()

  local health_body mapped
  health_body=$(curl -sS --max-time 8 http://127.0.0.1:8000/health 2>/dev/null || true)
  if [[ -z "$health_body" ]]; then
    failed_services+=(api)
  else
    mapped=$(python3 - "$health_body" <<'PY'
import json
import sys

try:
    body = json.loads(sys.argv[1])
except Exception:
    print("api")
    raise SystemExit

checks = body.get("checks")
if isinstance(checks, dict):
    services = {"database": "postgres", "redis": "redis", "minio": "minio"}
    failed = [services[name] for name, status in checks.items() if status != "ok" and name in services]
    if not checks or (not failed and body.get("status") != "ok"):
        failed.append("api")
    print("\n".join(failed))
elif body.get("status") != "ok":
    print("api")
PY
)
    while IFS= read -r service; do
      [[ -n "$service" ]] && failed_services+=("$service")
    done <<< "$mapped"
  fi

  if ! curl -fsS --max-time 10 -o /dev/null http://127.0.0.1:3000/ 2>/dev/null; then
    failed_services+=(web)
  fi

  if ! systemctl is-active --quiet nginx; then
    failed_services+=(nginx)
  elif nginx -t >/dev/null 2>&1; then
    if ! curl -kfsS --resolve contrlio.com:443:127.0.0.1 --max-time 10 -o /dev/null https://contrlio.com/ 2>/dev/null; then
      failed_services+=(nginx)
    fi
    if ! curl -kfsS --resolve contrlio.com:443:127.0.0.1 --max-time 10 -o /dev/null https://contrlio.com/health 2>/dev/null; then
      failed_services+=(nginx)
    fi
  else
    failed_services+=(nginx)
    log "Nginx 配置检查失败；已跳过自动重载，请检查 nginx -t 输出。"
  fi
}

allow_repair() {
  local service="$1" marker="$STATE_DIR/$1.last-repair" now previous
  now=$(date +%s)
  if [[ -r "$marker" ]]; then
    read -r previous < "$marker" || previous=0
    if [[ "$previous" =~ ^[0-9]+$ ]] && (( now - previous < RESTART_COOLDOWN_SECONDS )); then
      log "$service 仍异常；冷却期内不重复重启。"
      return 1
    fi
  fi
  printf '%s\n' "$now" > "$marker"
}

repair_container() {
  local service="$1" container_id state
  container_id=$("${COMPOSE[@]}" ps -q "$service" 2>/dev/null | head -n 1)
  if [[ -z "$container_id" ]]; then
    log "$service 未找到已创建的容器；跳过自动启动。"
    return
  fi

  state=$(docker inspect --format '{{.State.Status}}' "$container_id" 2>/dev/null || true)
  if [[ "$state" != running ]]; then
    log "$service 容器状态为 ${state:-unknown}；保留停止状态并记录异常。"
    return
  fi

  if allow_repair "$service"; then
    log "检测到 $service 异常，执行一次容器重启恢复。"
    if ! "${COMPOSE[@]}" restart "$service"; then
      log "$service 自动重启失败，需要人工检查 Docker 日志。"
    fi
  fi
}

repair_nginx() {
  if ! systemctl is-active --quiet nginx; then
    log "Nginx 当前未运行；保留停止状态并记录异常。"
    return
  fi
  if ! nginx -t >/dev/null 2>&1; then
    log "Nginx 配置无效；跳过自动重载以免扩大故障。"
    return
  fi
  if allow_repair nginx; then
    log "检测到 Nginx 服务或反向代理异常，执行一次配置重载。"
    if ! systemctl reload nginx; then
      log "Nginx 自动重载失败，需要人工检查 systemctl 与错误日志。"
    fi
  fi
}

collect_failures
if ((${#failed_services[@]} == 0)); then
  exit 0
fi

log "健康检查发现异常：${failed_services[*]}。"
for service in postgres redis minio api web; do
  for failed in "${failed_services[@]}"; do
    if [[ "$failed" == "$service" ]]; then
      repair_container "$service"
      break
    fi
  done
done
for failed in "${failed_services[@]}"; do
  if [[ "$failed" == nginx ]]; then
    repair_nginx
    break
  fi
done

sleep 5
collect_failures
if ((${#failed_services[@]} == 0)); then
  log "自动恢复后，前端、API、数据库、Redis、MinIO 与 Nginx 检查均通过。"
else
  log "自动恢复后仍有异常：${failed_services[*]}；请检查 docker compose logs 和 journalctl。"
fi
