from fastapi import HTTPException
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app.industry_templates import TEMPLATES, get_template
from app import main
from app.database import get_db
from app.main import seed_industry_template
from app.models import (
    AuditEvent,
    Base,
    Control,
    ControlObjective,
    Department,
    Evidence,
    Inspection,
    InspectionTest,
    Organization,
    Process,
    RCM,
    Risk,
    User,
)


def test_catalog_has_fourteen_industries_and_three_practice_stages():
    assert len(TEMPLATES) == 42
    assert len({item["industry_key"] for item in TEMPLATES.values()}) == 14
    assert {item["maturity"] for item in TEMPLATES.values()} == {"starter", "scaling", "systematized"}
    for template in TEMPLATES.values():
        assert template["processes"]
        assert template["organization_shape"]
        assert template["sources"]
        handbook = template["handbook"]
        assert len(handbook["shared_policies"]) >= 3
        assert len(handbook["organization_models"]) == 3
        assert len(handbook["raci"]) >= 5
        assert len(handbook["work_plan"]) == 4
        assert handbook["sector_policy"]["clauses"]
        assert handbook["simulation"]["retest"]
        assert handbook["sources"]
        assert all(process["risk"] and process["control_design"] and process["sample_guidance"] for process in template["processes"])
        cases = handbook["implementation_cases"]
        assert len(cases) == 3
        assert {case["process_code"] for case in cases} == {
            process["code"] for process in TEMPLATES[f'{template["industry_key"]}-systematized']["processes"]
        }
        for case in cases:
            assert case["kind"] == "simulated"
            assert case["scenario"] and case["sample_plan"] and case["test_program"]
            assert case["exception_criteria"] and case["finding_example"] and case["root_cause"]
            assert len(case["actions"]) >= 3
            assert case["owner"] and case["evidence"] and case["retest"] and case["closure_criteria"]
        assert all(process["implementation_case"]["process_code"] == process["code"] for process in template["processes"])


def test_catalog_is_available_before_signup():
    with TestClient(main.app) as client:
        response = client.get("/api/industry-templates")
    assert response.status_code == 200
    assert len(response.json()) == 42


def test_playbooks_distinguish_linked_public_cases_from_simulations():
    handbooks = [get_template(f"{industry_key}-starter")["handbook"] for industry_key in {item["industry_key"] for item in TEMPLATES.values()}]
    public_cases = [case for handbook in handbooks for case in handbook["public_cases"]]
    assert len(public_cases) >= 4
    for case in public_cases:
        assert case["url"].startswith("https://")
        assert case["jurisdiction"] and case["facts"] and case["lesson"]
    for handbook in handbooks:
        scenario = handbook["simulation"]
        assert scenario["title"] and scenario["scenario"] and scenario["finding"]
        assert scenario["response"] and scenario["retest"]


def test_get_template_returns_an_independent_copy():
    item = get_template("food-beverage-starter")
    assert item is not None
    item["processes"].clear()
    assert len(get_template("food-beverage-starter")["processes"]) == 1


def test_apply_builds_company_owned_records_and_blocks_duplicate_seed():
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    with Session(engine) as db:
        user = User(email="manager@example.test", full_name="Company Manager", password_hash="unused")
        organization = Organization(name="Example SaaS", code="EXAMPLE-SAAS", industry="SaaS")
        db.add_all([user, organization])
        db.flush()

        result = seed_industry_template(db, user, organization, "saas-systematized")
        db.commit()

        assert result["counts"] == {
            "departments": 3,
            "processes": 3,
            "risks": 9,
            "objectives": 9,
            "controls": 9,
            "rcms": 9,
            "inspections": 3,
            "inspection_tests": 3,
        }
        assert db.scalar(select(func.count()).select_from(Process).where(Process.organization_id == organization.id)) == 3
        assert db.scalar(select(func.count()).select_from(Risk).where(Risk.organization_id == organization.id)) == 9
        assert db.scalar(select(func.count()).select_from(ControlObjective).where(ControlObjective.organization_id == organization.id)) == 9
        assert db.scalar(select(func.count()).select_from(Control).where(Control.organization_id == organization.id)) == 9
        assert db.scalar(select(func.count()).select_from(RCM).where(RCM.organization_id == organization.id)) == 9
        assert db.scalar(select(func.count()).select_from(Inspection).where(Inspection.organization_id == organization.id)) == 3
        assert db.scalar(select(func.count()).select_from(InspectionTest).where(
            InspectionTest.organization_id == organization.id,
            InspectionTest.result == "not_tested",
        )) == 3
        assert db.scalar(select(func.count()).select_from(Evidence).where(Evidence.organization_id == organization.id)) == 0
        assert db.scalar(select(func.count()).select_from(Department).where(Department.organization_id == organization.id)) == 3
        assert db.scalar(select(AuditEvent.id).where(AuditEvent.action == "apply_industry_template"))

        try:
            seed_industry_template(db, user, organization, "saas-systematized")
        except HTTPException as exc:
            assert exc.status_code == 409
        else:
            raise AssertionError("reapplying the same library seed should be rejected")


def test_company_registration_creates_manager_and_selected_industry_data(monkeypatch):
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)

    def override_db():
        with Session(engine) as db:
            yield db

    class FakeRedis:
        def __init__(self):
            self.values = {}

        def incr(self, key):
            self.values[key] = self.values.get(key, 0) + 1
            return self.values[key]

        def expire(self, key, seconds):
            return True

        def get(self, key):
            return self.values.get(key)

        def delete(self, key):
            self.values.pop(key, None)
            return True

    main.app.dependency_overrides[get_db] = override_db
    monkeypatch.setattr(main, "redis_client", FakeRedis())
    try:
        with TestClient(main.app) as client:
            response = client.post("/api/auth/register-company", json={
                "email": "owner@example.com",
                "password": "ExamplePassword#2026",
                "full_name": "Example Owner",
                "organization_name": "Example Tea Company",
                "organization_code": "EXAMPLE-TEA",
                "template_id": "food-beverage-starter",
            })
            organization_id = response.json().get("organization", {}).get("id")
            duplicate = client.post(
                f"/api/organizations/{organization_id}/industry-templates/food-beverage-starter/apply",
                headers={"Origin": "http://localhost:3000"},
            )
            applications = client.get(f"/api/organizations/{organization_id}/industry-template-applications")
        assert response.status_code == 201, response.text
        assert duplicate.status_code == 409
        assert applications.status_code == 200
        assert applications.json()[0]["template_version"] == "2026.09.3"
        payload = response.json()
        assert payload["organization"]["industry"] == "食品饮料与连锁餐饮（含新式茶饮）"
        assert payload["template_application"]["counts"]["processes"] == 1
        with Session(engine) as db:
            assert db.scalar(select(func.count()).select_from(User).where(User.email == "owner@example.com")) == 1
            assert db.scalar(select(func.count()).select_from(Organization).where(Organization.code == "EXAMPLE-TEA")) == 1
    finally:
        main.app.dependency_overrides.clear()
        engine.dispose()
