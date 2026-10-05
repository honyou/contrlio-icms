from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.database import get_db
from app.models import AuditEvent, Base, Organization, OrganizationMembership, User
from app.security import hash_password, issue_token


class FakeRedis:
    def get(self, key):
        return None


def test_membership_removal_preserves_account_and_audits_change(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        manager = User(email="manager@example.test", full_name="Company Manager", password_hash=hash_password("ExamplePassword#2026"))
        second_manager = User(email="manager2@example.test", full_name="Second Manager", password_hash=hash_password("ExamplePassword#2026"))
        auditor = User(email="auditor@example.test", full_name="Company Auditor", password_hash=hash_password("ExamplePassword#2026"))
        target = User(email="owner@example.test", full_name="Process Owner", password_hash=hash_password("ExamplePassword#2026"))
        system_admin = User(email="admin@example.test", full_name="System Admin", password_hash=hash_password("ExamplePassword#2026"), is_system_admin=True)
        organization = Organization(name="Example Company", code="EXAMPLE-COMPANY")
        db.add_all([manager, second_manager, auditor, target, system_admin, organization])
        db.flush()
        db.add_all([
            OrganizationMembership(organization_id=organization.id, user_id=manager.id, role="manager"),
            OrganizationMembership(organization_id=organization.id, user_id=second_manager.id, role="manager"),
            OrganizationMembership(organization_id=organization.id, user_id=auditor.id, role="auditor"),
            OrganizationMembership(organization_id=organization.id, user_id=target.id, role="owner"),
        ])
        db.commit()
        organization_uuid = organization.id
        manager_uuid = manager.id
        target_uuid = target.id
        organization_id = str(organization_uuid)
        manager_id = str(manager.id)
        second_manager_id = str(second_manager.id)
        auditor_id = str(auditor.id)
        target_id = str(target.id)
        tokens = {
            "manager": issue_token(manager)[0],
            "auditor": issue_token(auditor)[0],
            "system_admin": issue_token(system_admin)[0],
        }

    def override_db():
        with Session(engine) as db:
            yield db

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    try:
        with TestClient(main.app) as client:
            base = f"/api/organizations/{organization_id}/members"
            denied = client.delete(
                f"{base}/{target_id}",
                headers={"Authorization": f"Bearer {tokens['auditor']}"},
            )
            removed = client.delete(
                f"{base}/{target_id}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
            )
            removed_second_manager = client.delete(
                f"{base}/{second_manager_id}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
            )
            listed = client.get(base, headers={"Authorization": f"Bearer {tokens['manager']}"})
            remaining_manager_removed = client.delete(
                f"{base}/{manager_id}",
                headers={"Authorization": f"Bearer {tokens['system_admin']}"},
            )
            self_removal = client.delete(
                f"{base}/{manager_id}",
                headers={"Authorization": f"Bearer {tokens['manager']}"},
            )

        assert denied.status_code == 403
        assert removed.status_code == 204
        assert removed_second_manager.status_code == 204
        assert {item["user"]["id"] for item in listed.json()} == {manager_id, auditor_id}
        assert remaining_manager_removed.status_code == 409
        assert self_removal.status_code == 409
        with Session(engine) as db:
            assert db.scalar(select(func.count()).select_from(User).where(User.id == target_uuid)) == 1
            assert db.scalar(select(func.count()).select_from(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_uuid,
                OrganizationMembership.user_id == target_uuid,
            )) == 0
            assert db.scalar(select(func.count()).select_from(OrganizationMembership).where(
                OrganizationMembership.organization_id == organization_uuid,
                OrganizationMembership.user_id == manager_uuid,
            )) == 1
            event = db.scalar(select(AuditEvent).where(AuditEvent.action == "remove_member"))
            assert event is not None
            assert event.changes["email"] == "owner@example.test"
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
