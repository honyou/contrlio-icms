.PHONY: init-local infra-up infra-down bootstrap api web

init-local:
	./scripts/init-local.sh

infra-up:
	docker compose up -d postgres redis minio

infra-down:
	docker compose down

bootstrap:
	cd apps/api && uv run alembic upgrade head && uv run python -m app.bootstrap

api:
	cd apps/api && uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000

web:
	cd apps/web && npm run dev
