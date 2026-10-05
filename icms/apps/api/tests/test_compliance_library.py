from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.compliance_library import PROCESS_GUIDANCE, REGULATIONS
from app.database import get_db
from app.industry_templates import TEMPLATES
from app.models import Base, Department, Organization, OrganizationMembership, Process, User
from app.security import issue_token


def test_industry_compliance_crosswalks_have_source_linked_laws_and_working_checks():
    law_ids = {item["id"] for item in REGULATIONS}
    industry_keys = {item["industry_key"] for item in TEMPLATES.values()}

    assert len(REGULATIONS) >= 30
    assert industry_keys == set(PROCESS_GUIDANCE)
    for key, guidance in PROCESS_GUIDANCE.items():
        template = TEMPLATES[f"{key}-systematized"]
        assert len(guidance) == len(template["processes"]) == 3
        for item in guidance:
            assert item["law_ids"]
            assert set(item["law_ids"]).issubset(law_ids)
            assert len(item["checkpoints"]) >= 3
    assert all(item["source_url"].startswith("https://") and item["scope_note"] for item in REGULATIONS)


def test_compliance_library_endpoint_is_scoped_and_includes_real_company_processes(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="compliance@example.test", full_name="Compliance Manager", password_hash="unused")
        organization = Organization(name="Example Tea Co", code="EXAMPLE-TEA", industry="food-beverage")
        db.add_all([user, organization])
        db.flush()
        department = Department(organization_id=organization.id, code="OPS", name="门店运营")
        db.add(department)
        db.flush()
        db.add_all([
            OrganizationMembership(organization_id=organization.id, user_id=user.id, role="manager"),
            Process(organization_id=organization.id, department_id=department.id, code="STORE", name="门店日常运营", description="测试流程"),
        ])
        db.commit()
        token, _ = issue_token(user)
        organization_id = str(organization.id)

    def override_db():
        with Session(engine) as db:
            yield db

    class FakeRedis:
        def get(self, key):
            return None

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    try:
        with TestClient(main.app) as client:
            response = client.get(
                f"/api/compliance-library?organization_id={organization_id}",
                headers={"Authorization": f"Bearer {token}"},
            )
            denied = client.get("/api/compliance-library?organization_id=00000000-0000-0000-0000-000000000000", headers={"Authorization": f"Bearer {token}"})
        assert response.status_code == 200, response.text
        payload = response.json()
        assert payload["current_industry_key"] == "food-beverage"
        assert len(payload["industries"]) == 14
        assert len(payload["regulations"]) >= 30
        assert payload["company_processes"][0]["name"] == "门店日常运营"
        # The runtime library includes the expanded editable industry catalog;
        # the legacy three-row crosswalk remains the seed for its first rows.
        assert len(payload["process_guidance"]["food-beverage"]) == 8
        assert {item["code"] for item in payload["process_guidance"]["food-beverage"]} >= {"SUP", "POS", "SAFE", "CEN", "MENU", "STORE", "PEOPLE", "WASTE"}
        assert [item["code"] for item in payload["jurisdiction_options"]] == ["CN", "HK", "MO", "TW", "US", "EU", "GB", "JP", "SG", "AU"]
        assert set(payload["process_guidance"]["food-beverage"][0]["jurisdiction_guidance"]) == {"CN", "HK", "MO", "TW", "US", "EU", "GB", "JP", "SG", "AU"}
        assert all(item["country_code"] in {"CN", "HK", "MO", "TW", "US", "EU", "GB", "JP", "SG", "AU"} for item in payload["regulations"])
        assert denied.status_code == 404
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
