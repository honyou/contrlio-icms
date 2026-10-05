from copy import deepcopy
import uuid

from fastapi import Depends, Request
from fastapi.testclient import TestClient
import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import Session
from sqlalchemy.pool import StaticPool

from app import main
from app.database import get_db
from app.models import (
    Base, Control, ControlObjective, Department, Organization,
    OrganizationMembership, Process, Risk, User,
)


@pytest.fixture
def workflow_api():
    """Exercise HTTP authorization and persistence without external services."""
    engine = create_engine(
        "sqlite+pysqlite:///:memory:",
        connect_args={"check_same_thread": False},
        poolclass=StaticPool,
    )
    Base.metadata.create_all(engine)
    ids = {}
    with Session(engine) as db:
        users = {
            role: User(email=f"workflow-{role}@example.test", full_name=role, password_hash="unused")
            for role in ("manager", "auditor", "owner", "viewer", "outsider")
        }
        users["admin"] = User(
            email="workflow-admin@example.test", full_name="admin",
            password_hash="unused", is_system_admin=True,
        )
        org = Organization(name="Workflow Company", code="WORKFLOW")
        foreign_org = Organization(name="Other Company", code="WORKFLOW-OTHER")
        db.add_all([*users.values(), org, foreign_org])
        db.flush()
        db.add_all([
            OrganizationMembership(organization_id=org.id, user_id=users[role].id, role=role)
            for role in ("manager", "auditor", "owner", "viewer")
        ])
        db.add(OrganizationMembership(
            organization_id=foreign_org.id, user_id=users["outsider"].id, role="manager",
        ))
        department = Department(organization_id=org.id, code="OPS", name="Operations")
        foreign_department = Department(organization_id=foreign_org.id, code="OPS", name="Other Operations")
        db.add_all([department, foreign_department])
        db.flush()
        processes = {
            "process": Process(organization_id=org.id, department_id=department.id, code="PURCHASE", name="Purchase"),
            "sibling_process": Process(organization_id=org.id, department_id=department.id, code="PAYMENT", name="Payment"),
            "foreign_process": Process(organization_id=foreign_org.id, department_id=foreign_department.id, code="PURCHASE", name="Other Purchase"),
        }
        db.add_all(processes.values())
        db.flush()
        for key, process in processes.items():
            prefix = key.removesuffix("process")
            risk = Risk(
                organization_id=process.organization_id, process_id=process.id,
                code=f"{prefix}RISK", name="Unauthorized purchase", description="Purchase without approval",
            )
            objective = ControlObjective(
                organization_id=process.organization_id, process_id=process.id,
                code=f"{prefix}OBJECTIVE", name="Authorized purchase", description="Approve before purchase",
            )
            db.add_all([risk, objective])
            db.flush()
            control = Control(
                organization_id=process.organization_id, process_id=process.id, objective_id=objective.id,
                code=f"{prefix}CONTROL", name="Purchase approval", description="Manager reviews purchase",
            )
            db.add(control)
            db.flush()
            ids[f"{prefix}risk"] = str(risk.id)
            ids[f"{prefix}control"] = str(control.id)
        ids.update({key: str(process.id) for key, process in processes.items()})
        ids.update({role: str(user.id) for role, user in users.items()})
        ids.update({
            "org": str(org.id), "foreign_org": str(foreign_org.id),
            "department": str(department.id), "foreign_department": str(foreign_department.id),
        })
        db.commit()

    def override_db():
        with Session(engine) as db:
            yield db

    def override_user(request: Request, db: Session = Depends(get_db)):
        return db.get(User, uuid.UUID(request.headers["x-test-user"]))

    previous_overrides = main.app.dependency_overrides.copy()
    main.app.dependency_overrides[get_db] = override_db
    main.app.dependency_overrides[main.current_user] = override_user
    try:
        with TestClient(main.app) as client:
            yield client, ids
    finally:
        main.app.dependency_overrides.clear()
        main.app.dependency_overrides.update(previous_overrides)
        engine.dispose()


def endpoint(ids, process="process", organization="org"):
    return f"/api/processes/{ids[process]}/configuration?organization_id={ids[organization]}"


def headers(ids, role="manager"):
    return {"x-test-user": ids[role]}


def complete_configuration(ids):
    def step(step_id, name, kind="task", **changes):
        data = {
            "id": step_id, "name": name, "type": kind, "description": f"{name}操作要求",
            "department_id": ids["department"], "assignee_user_id": ids["owner"],
            "approver_user_ids": [], "approval_mode": "any", "deadline_hours": 24,
            "evidence_required": False, "evidence_description": "", "risk_ids": [],
            "control_ids": [], "next_step_id": None, "branches": [],
        }
        data.update(changes)
        return data

    return {
        "purpose": "确保采购经过授权并完整留痕", "scope": "公司采购申请与批准",
        "trigger": "采购人员提交申请", "frequency": "按需",
        "input_description": "采购申请及预算", "output_description": "批准的采购申请与验收记录",
        "exception_policy": "异常申请退回申请人补充材料",
        "form_fields": [
            {"id": "amount", "label": "采购金额", "type": "number", "required": True, "options": []},
            {"id": "category", "label": "采购类别", "type": "select", "required": True, "options": ["原料", "设备"]},
            {"id": "urgent", "label": "紧急采购", "type": "checkbox", "required": False, "options": []},
        ],
        "steps": [
            step("start", "申请", evidence_required=True, evidence_description="上传采购申请和预算依据",
                 risk_ids=[ids["risk"]], control_ids=[ids["control"]]),
            step("decision", "金额判断", "condition", next_step_id="archive", branches=[
                {"field_id": "amount", "operator": "gte", "value": "1000", "target_step_id": "review"},
            ]),
            step("review", "审批", "approval", approver_user_ids=[ids["manager"], ids["auditor"]], approval_mode="all"),
            step("archive", "归档", next_step_id="end"),
        ],
    }


def save(client, ids, config, revision=0, role="manager"):
    return client.patch(endpoint(ids), headers=headers(ids, role), json={"expected_revision": revision, "config": config})


def publish(client, ids, revision, role="manager"):
    return client.post(
        endpoint(ids).replace("/configuration?", "/configuration/publish?"),
        headers=headers(ids, role), json={"expected_revision": revision},
    )


def test_draft_roundtrip_keeps_form_routing_owners_and_control_links(workflow_api):
    client, ids = workflow_api
    initial = client.get(endpoint(ids), headers=headers(ids))
    assert initial.status_code == 200, initial.text
    assert initial.json()["process_id"] == ids["process"]
    assert initial.json()["revision"] == 0
    assert initial.json()["published_config"] is None
    assert initial.json()["history"] == []

    config = complete_configuration(ids)
    saved = save(client, ids, config)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 1
    assert saved.json()["config"] == config
    reread = client.get(endpoint(ids), headers=headers(ids, "viewer"))
    assert reread.status_code == 200, reread.text
    assert reread.json()["config"] == config
    assert reread.json()["published_revision"] is None


def test_template_uses_current_process_records_without_saving_a_draft(workflow_api):
    client, ids = workflow_api
    path = endpoint(ids).replace("/configuration?", "/configuration/template?")
    generated = client.get(path, headers=headers(ids, "viewer"))
    assert generated.status_code == 200, generated.text
    config = generated.json()["config"]
    assert "Purchase" in config["purpose"]
    assert len(config["steps"]) == 6
    linked_risks = {risk_id for step in config["steps"] for risk_id in step["risk_ids"]}
    linked_controls = {control_id for step in config["steps"] for control_id in step["control_ids"]}
    assert linked_risks == {ids["risk"]}
    assert linked_controls == {ids["control"]}
    assert any("Manager reviews purchase" in step["description"] for step in config["steps"])
    assert {step["department_id"] for step in config["steps"] if step["department_id"]} == {ids["department"]}
    assert any(step["type"] == "approval" for step in config["steps"])
    assert any(step["branches"] for step in config["steps"])
    before_save = client.get(endpoint(ids), headers=headers(ids)).json()
    assert before_save["revision"] == 0
    assert before_save["config"]["steps"] == []
    assert before_save["history"] == []
    assert client.get(path, headers=headers(ids, "outsider")).status_code == 404
    foreign_path = endpoint(ids, process="foreign_process").replace("/configuration?", "/configuration/template?")
    assert client.get(foreign_path, headers=headers(ids)).status_code == 404
    saved = save(client, ids, config)
    assert saved.status_code == 200, saved.text
    config["steps"][1]["approver_user_ids"] = [ids["manager"]]
    assert save(client, ids, config, revision=1).status_code == 200
    assert publish(client, ids, 2).status_code == 200


def test_publish_preserves_snapshots_after_later_draft_and_publication(workflow_api):
    client, ids = workflow_api
    first = complete_configuration(ids)
    assert save(client, ids, first).status_code == 200
    published = publish(client, ids, 1)
    assert published.status_code == 200, published.text
    assert published.json()["revision"] == 1
    assert published.json()["published_revision"] == 1
    assert published.json()["published_config"] == first
    assert published.json()["published_at"]

    second = deepcopy(first)
    second["steps"][2]["approval_mode"] = "sequential"
    second["purpose"] = "更新后的采购授权要求"
    saved = save(client, ids, second, revision=1)
    assert saved.status_code == 200, saved.text
    assert saved.json()["revision"] == 2
    assert saved.json()["published_revision"] == 1
    assert saved.json()["published_config"] == first
    published_again = publish(client, ids, 2)
    assert published_again.status_code == 200, published_again.text
    history = published_again.json()["history"]
    assert len(history) == 2
    assert {item["revision"]: item["config"] for item in history} == {1: first, 2: second}
    reread = client.get(endpoint(ids), headers=headers(ids)).json()
    assert reread["published_revision"] == 2
    assert reread["published_config"] == second
    assert {item["revision"]: item["config"] for item in reread["history"]} == {1: first, 2: second}


def test_stale_revision_and_duplicate_publish_do_not_overwrite_saved_work(workflow_api):
    client, ids = workflow_api
    config = complete_configuration(ids)
    assert save(client, ids, config).status_code == 200
    stale_config = deepcopy(config)
    stale_config["purpose"] = "Stale editor attempted overwrite"
    assert save(client, ids, stale_config, revision=0).status_code == 409
    assert publish(client, ids, 0).status_code == 409
    assert publish(client, ids, 1).status_code == 200
    assert publish(client, ids, 1).status_code == 409
    current = client.get(endpoint(ids), headers=headers(ids)).json()
    assert current["revision"] == 1
    assert current["config"] == config
    assert current["published_config"] == config
    assert len(current["history"]) == 1


def test_failed_publication_keeps_previous_published_version_available(workflow_api):
    client, ids = workflow_api
    first = complete_configuration(ids)
    assert save(client, ids, first).status_code == 200
    assert publish(client, ids, 1).status_code == 200
    invalid = deepcopy(first)
    invalid["purpose"] = ""
    assert save(client, ids, invalid, revision=1).status_code == 200
    assert publish(client, ids, 2).status_code == 422
    state = client.get(endpoint(ids), headers=headers(ids)).json()
    assert state["revision"] == 2
    assert state["config"] == invalid
    assert state["published_revision"] == 1
    assert state["published_config"] == first
    assert len(state["history"]) == 1


@pytest.mark.parametrize("role", ["auditor", "owner", "viewer"])
def test_readers_cannot_save_or_publish_configuration(workflow_api, role):
    client, ids = workflow_api
    assert client.get(endpoint(ids), headers=headers(ids, role)).status_code == 200
    assert save(client, ids, complete_configuration(ids), role=role).status_code == 403
    assert publish(client, ids, 0, role=role).status_code == 403
    assert client.get(endpoint(ids), headers=headers(ids)).json()["revision"] == 0


def test_system_admin_can_configure_without_an_organization_membership(workflow_api):
    client, ids = workflow_api
    response = save(client, ids, complete_configuration(ids), role="admin")
    assert response.status_code == 200, response.text
    assert publish(client, ids, 1, role="admin").status_code == 200


def test_configuration_access_cannot_cross_company_or_process_scope(workflow_api):
    client, ids = workflow_api
    paths = [
        (endpoint(ids), "outsider"),
        (endpoint(ids, process="foreign_process"), "manager"),
        (endpoint(ids, organization="foreign_org"), "outsider"),
    ]
    for path, role in paths:
        assert client.get(path, headers=headers(ids, role)).status_code == 404
        denied = client.patch(path, headers=headers(ids, role), json={
            "expected_revision": 0, "config": complete_configuration(ids),
        })
        assert denied.status_code == 404, denied.text
        denied_publish = client.post(
            path.replace("/configuration?", "/configuration/publish?"),
            headers=headers(ids, role), json={"expected_revision": 0},
        )
        assert denied_publish.status_code == 404, denied_publish.text


@pytest.mark.parametrize("field,reference", [
    ("department_id", "foreign_department"),
    ("assignee_user_id", "outsider"),
    ("approver_user_ids", "outsider"),
    ("risk_ids", "foreign_risk"),
    ("control_ids", "foreign_control"),
    ("risk_ids", "sibling_risk"),
    ("control_ids", "sibling_control"),
])
def test_configuration_rejects_foreign_members_departments_and_process_links(workflow_api, field, reference):
    client, ids = workflow_api
    config = complete_configuration(ids)
    config["steps"][0][field] = [ids[reference]] if field.endswith("_ids") else ids[reference]
    response = save(client, ids, config)
    assert response.status_code == 422, response.text
    assert client.get(endpoint(ids), headers=headers(ids)).json()["revision"] == 0


def test_publication_rechecks_membership_after_a_draft_was_saved(workflow_api):
    client, ids = workflow_api
    config = complete_configuration(ids)
    assert save(client, ids, config).status_code == 200
    removed = client.delete(
        f"/api/organizations/{ids['org']}/members/{ids['owner']}", headers=headers(ids),
    )
    assert removed.status_code == 204, removed.text
    rejected = publish(client, ids, 1)
    assert rejected.status_code == 422, rejected.text
    state = client.get(endpoint(ids), headers=headers(ids)).json()
    assert state["config"] == config
    assert state["published_config"] is None
    assert state["history"] == []


@pytest.mark.parametrize("change", [
    "missing_purpose", "missing_steps", "missing_owner", "missing_approvers",
    "missing_branches", "missing_evidence_description", "unreachable_step",
    "incompatible_numeric_rule", "incompatible_checkbox_rule", "invalid_select_value",
    "invalid_numeric_value", "nonfinite_numeric_value", "invalid_date_value",
])
def test_incomplete_drafts_can_be_saved_but_cannot_be_published(workflow_api, change):
    client, ids = workflow_api
    config = complete_configuration(ids)
    if change == "missing_purpose":
        config["purpose"] = ""
    elif change == "missing_steps":
        config["steps"] = []
    elif change == "missing_owner":
        config["steps"][0]["department_id"] = None
        config["steps"][0]["assignee_user_id"] = None
    elif change == "missing_approvers":
        config["steps"][2]["approver_user_ids"] = []
    elif change == "missing_branches":
        config["steps"][1]["branches"] = []
        config["steps"][1]["next_step_id"] = None
    elif change == "missing_evidence_description":
        config["steps"][0]["evidence_description"] = ""
    elif change == "unreachable_step":
        config["steps"][0]["next_step_id"] = "end"
    elif change == "incompatible_numeric_rule":
        config["steps"][1]["branches"][0]["operator"] = "contains"
        config["steps"][1]["branches"][0]["value"] = "1000"
    elif change == "incompatible_checkbox_rule":
        config["steps"][1]["branches"][0]["field_id"] = "urgent"
    elif change == "invalid_select_value":
        config["steps"][1]["branches"][0].update(field_id="category", operator="eq", value="不存在的类别")
    elif change == "invalid_numeric_value":
        config["steps"][1]["branches"][0]["value"] = "one thousand"
    elif change == "nonfinite_numeric_value":
        config["steps"][1]["branches"][0]["value"] = "NaN"
    elif change == "invalid_date_value":
        config["form_fields"][0]["type"] = "date"
        config["steps"][1]["branches"][0]["value"] = "2026-02-30"
    saved = save(client, ids, config)
    assert saved.status_code == 200, saved.text
    rejected = publish(client, ids, 1)
    assert rejected.status_code == 422, rejected.text
    state = client.get(endpoint(ids), headers=headers(ids)).json()
    assert state["revision"] == 1
    assert state["config"] == config
    assert state["published_config"] is None
    assert state["history"] == []


@pytest.mark.parametrize("change", [
    "unknown_next", "unknown_branch_target", "unknown_field", "backward_next",
    "backward_branch", "self_loop", "duplicate_step_id", "duplicate_field_id",
    "reserved_step_id", "negative_deadline", "invalid_operator",
])
def test_malformed_routing_and_identifiers_cannot_be_saved(workflow_api, change):
    client, ids = workflow_api
    config = complete_configuration(ids)
    if change == "unknown_next":
        config["steps"][0]["next_step_id"] = "missing-step"
    elif change == "unknown_branch_target":
        config["steps"][1]["branches"][0]["target_step_id"] = "missing-step"
    elif change == "unknown_field":
        config["steps"][1]["branches"][0]["field_id"] = "missing-field"
    elif change == "backward_next":
        config["steps"][2]["next_step_id"] = "start"
    elif change == "backward_branch":
        config["steps"][1]["branches"][0]["target_step_id"] = "start"
    elif change == "self_loop":
        config["steps"][0]["next_step_id"] = "start"
    elif change == "duplicate_step_id":
        config["steps"][2]["id"] = "decision"
    elif change == "duplicate_field_id":
        config["form_fields"][1]["id"] = "amount"
    elif change == "reserved_step_id":
        config["steps"][0]["id"] = "end"
    elif change == "negative_deadline":
        config["steps"][0]["deadline_hours"] = -1
    elif change == "invalid_operator":
        config["steps"][1]["branches"][0]["operator"] = "eval"
    rejected = save(client, ids, config)
    assert rejected.status_code == 422, rejected.text
    state = client.get(endpoint(ids), headers=headers(ids)).json()
    assert state["revision"] == 0
    assert state["history"] == []
