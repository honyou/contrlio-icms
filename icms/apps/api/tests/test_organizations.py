from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool
from uuid import UUID

from app import main
from app.database import get_db
from app.models import AuditEvent, Base, Department, Organization, OrganizationMembership, User
from app.security import issue_token


class FakeRedis:
    def get(self, key):
        return None


def test_manager_can_create_deactivate_and_restore_company_without_losing_data(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        manager = User(email="manager@example.test", full_name="Company Manager", password_hash="unused")
        viewer = User(email="viewer@example.test", full_name="Company Viewer", password_hash="unused")
        existing = Organization(name="Existing Company", code="EXISTING-COMPANY")
        db.add_all([manager, viewer, existing])
        db.flush()
        db.add_all([
            OrganizationMembership(organization_id=existing.id, user_id=manager.id, role="manager"),
            OrganizationMembership(organization_id=existing.id, user_id=viewer.id, role="viewer"),
        ])
        db.commit()
        manager_token = issue_token(manager)[0]
        viewer_token = issue_token(viewer)[0]
        manager_uuid = manager.id

    def override_db():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    headers = {"Authorization": f"Bearer {manager_token}"}
    try:
        with TestClient(main.app) as client:
            denied = client.post("/api/organizations", headers={"Authorization": f"Bearer {viewer_token}"}, json={
                "name": "Denied Company", "code": "DENIED-COMPANY",
            })
            created = client.post("/api/organizations", headers=headers, json={
                "name": "New Company", "code": "NEW-COMPANY", "industry": "制造业",
            })
            assert created.status_code == 201, created.text
            new_id = created.json()["id"]
            new_uuid = UUID(new_id)
            with Session(engine) as db:
                db.add(Department(organization_id=new_uuid, code="OPS", name="Operations"))
                db.commit()

            deactivated = client.delete(f"/api/organizations/{new_id}", headers=headers)
            blocked_access = client.get(f"/api/dashboard?organization_id={new_id}", headers=headers)
            catalog_after_delete = client.get("/api/organizations", headers=headers)
            restored = client.post(f"/api/organizations/{new_id}/restore", headers=headers)

        assert denied.status_code == 403
        assert deactivated.status_code == 204
        assert blocked_access.status_code == 404
        archived = next(item for item in catalog_after_delete.json() if item["id"] == new_id)
        assert archived["is_active"] is False
        assert restored.status_code == 200
        assert restored.json()["is_active"] is True
        with Session(engine) as db:
            assert db.scalar(select(func.count()).select_from(OrganizationMembership).where(
                OrganizationMembership.organization_id == new_uuid,
                OrganizationMembership.user_id == manager_uuid,
            )) == 1
            assert db.scalar(select(func.count()).select_from(Department).where(
                Department.organization_id == new_uuid,
                Department.code == "OPS",
            )) == 1
            actions = set(db.scalars(select(AuditEvent.action).where(AuditEvent.entity_type == "organization")).all())
            assert {"create", "deactivate", "restore"}.issubset(actions)
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
