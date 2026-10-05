from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.database import get_db
from app.models import Base, User
from app.security import hash_password


class FakeRedis:
    def incr(self, key):
        return 1

    def expire(self, key, seconds):
        return True

    def delete(self, key):
        return 1


def test_login_cookie_is_secure_only_in_production(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        db.add(User(
            email="admin@example.com",
            full_name="System Admin",
            password_hash=hash_password("ExamplePassword#2026"),
            is_system_admin=True,
        ))
        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    try:
        with TestClient(main.app) as client:
            monkeypatch.setattr(main.settings, "app_env", "development")
            development = client.post("/api/auth/login", json={
                "email": "admin@example.com",
                "password": "ExamplePassword#2026",
            })
            assert development.status_code == 200
            assert "secure" not in development.headers["set-cookie"].lower()

            client.cookies.clear()
            monkeypatch.setattr(main.settings, "app_env", "production")
            production = client.post("/api/auth/login", json={
                "email": "admin@example.com",
                "password": "ExamplePassword#2026",
            })
            assert production.status_code == 200
            assert "; secure" in production.headers["set-cookie"].lower()
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
