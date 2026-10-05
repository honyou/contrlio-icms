import uuid

from fastapi import HTTPException
import pytest
from sqlalchemy import create_engine, func, select
from sqlalchemy.orm import Session

from app.industry_templates import TEMPLATES
from app.main import seed_industry_template
from app.models import (
    Base, Control, Organization, OrganizationMembership, Process,
    ProcessConfiguration, ProcessConfigurationVersion, RCM, Risk, User,
)
from app.process_configuration import WorkflowConfig, validate_configuration


@pytest.mark.parametrize("template_id", sorted(TEMPLATES))
def test_industry_seed_provides_complete_editable_workflow_drafts(template_id):
    """All industry/stage combinations must produce usable, company-owned drafts."""
    engine = create_engine("sqlite+pysqlite:///:memory:")
    Base.metadata.create_all(engine)
    try:
        with Session(engine) as db:
            user = User(email="template-manager@example.test", full_name="Manager", password_hash="unused")
            organization = Organization(name="Template Company", code="TEMPLATE-COMPANY")
            db.add_all([user, organization])
            db.flush()
            db.add(OrganizationMembership(organization_id=organization.id, user_id=user.id, role="manager"))
            db.flush()
            seeded = seed_industry_template(db, user, organization, template_id)
            db.commit()

            processes = list(db.scalars(select(Process).where(Process.organization_id == organization.id)))
            configs = list(db.scalars(select(ProcessConfiguration).where(ProcessConfiguration.organization_id == organization.id)))
            assert len(configs) == len(processes) == seeded["counts"]["processes"]
            assert len(processes) == len(TEMPLATES[template_id]["processes"])
            assert db.scalar(select(func.count()).select_from(ProcessConfigurationVersion)) == 0

            for process in processes:
                saved = next(config for config in configs if config.process_id == process.id)
                assert saved.revision == 1
                assert saved.published_revision is None
                assert saved.published_at is None
                config = WorkflowConfig.model_validate(saved.config)
                validate_configuration(db, process, config)
                assert len(config.steps) == 6
                assert len(config.form_fields) == 5
                assert process.name in config.purpose
                assert config.scope == process.description
                assert all(step.department_id in {None, str(process.department_id)} for step in config.steps)
                assert all(step.assignee_user_id in {None, str(user.id)} for step in config.steps)

                own_risks = set(db.scalars(select(Risk.id).where(Risk.process_id == process.id)))
                own_controls = list(db.scalars(select(Control).where(Control.process_id == process.id)))
                assert {uuid.UUID(item) for step in config.steps for item in step.risk_ids} == own_risks
                assert {uuid.UUID(item) for step in config.steps for item in step.control_ids} == {control.id for control in own_controls}
                instructions = "\n".join(step.description for step in config.steps)
                assert all(control.description in instructions for control in own_controls)
                rcm = db.scalar(select(RCM).where(RCM.process_id == process.id))
                assert any(rcm.test_procedure in step.evidence_description for step in config.steps)
                approval = next(step for step in config.steps if step.type == "approval")
                assert approval.approver_user_ids == []
                condition = next(step for step in config.steps if step.type == "condition")
                assert condition.branches
                assert condition.branches[0].field_id == "control_result"
                assert condition.branches[0].target_step_id == "exception"
                with pytest.raises(HTTPException) as incomplete:
                    validate_configuration(db, process, config, publishing=True)
                assert incomplete.value.status_code == 422
                assert "审批人" in incomplete.value.detail
    finally:
        engine.dispose()
