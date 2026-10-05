from __future__ import annotations

import uuid
from datetime import date, datetime, timezone

from sqlalchemy import Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index, Integer, JSON, String, Text, UniqueConstraint
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


def now_utc() -> datetime:
    return datetime.now(timezone.utc)


class Base(DeclarativeBase):
    pass


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, onupdate=now_utc, nullable=False)


class OrganizationScoped:
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="RESTRICT"), index=True, nullable=False)


class User(Base, TimestampMixin):
    __tablename__ = "users"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    email: Mapped[str] = mapped_column(String(320), unique=True, index=True)
    full_name: Mapped[str] = mapped_column(String(160))
    password_hash: Mapped[str] = mapped_column(String(255))
    is_system_admin: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_billing_exempt: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    auth_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    trial_started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    paid_through: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RegistrationInvitation(Base):
    """A system-admin-issued, single-use code for creating a new account."""
    __tablename__ = "registration_invitations"
    __table_args__ = (
        UniqueConstraint("code_hash", name="uq_registration_invitation_code_hash"),
        Index("ix_registration_invitation_created_at", "created_at"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code_hash: Mapped[str] = mapped_column(String(64), nullable=False)
    code_ciphertext: Mapped[str | None] = mapped_column(String(512))
    created_by_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    used_by_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class PaymentOrder(Base, TimestampMixin):
    __tablename__ = "payment_orders"
    __table_args__ = (
        CheckConstraint("amount_fen > 0", name="ck_payment_order_amount_positive"),
        Index("ix_payment_order_user_status", "user_id", "status"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    out_trade_no: Mapped[str] = mapped_column(String(64), unique=True, index=True, nullable=False)
    alipay_trade_no: Mapped[str | None] = mapped_column(String(96), unique=True)
    amount_fen: Mapped[int] = mapped_column(Integer, nullable=False)
    provider: Mapped[str] = mapped_column(String(24), default="alipay_qr", nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    paid_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    entitlement_until: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    approved_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))


class Organization(Base, TimestampMixin):
    __tablename__ = "organizations"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    code: Mapped[str] = mapped_column(String(40), unique=True, index=True, nullable=False)
    industry: Mapped[str | None] = mapped_column(String(100))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class AIProviderConfig(Base, TimestampMixin):
    """One encrypted, organization-scoped AI provider credential."""
    __tablename__ = "ai_provider_configs"
    organization_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("organizations.id", ondelete="CASCADE"), primary_key=True
    )
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    protocol: Mapped[str] = mapped_column(String(40), nullable=False)
    base_url: Mapped[str] = mapped_column(String(500), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    encrypted_api_key: Mapped[str] = mapped_column(Text, nullable=False)


class AIUserQuota(Base, TimestampMixin):
    """Monthly AI token allowance for one organization member."""
    __tablename__ = "ai_user_quotas"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_ai_quota_org_user"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    monthly_limit_tokens: Mapped[int] = mapped_column(Integer, default=2_000_000, server_default="2000000", nullable=False)


class AITokenUsage(Base):
    """A billable assistant call and its provider-reported or estimated token use."""
    __tablename__ = "ai_token_usages"
    __table_args__ = (Index("ix_ai_usage_org_user_period", "organization_id", "user_id", "period_start"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    task: Mapped[str] = mapped_column(String(40), nullable=False)
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reserved_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    input_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    output_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    total_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    usage_estimated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    completed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class AIQuotaRequest(Base, TimestampMixin):
    """A member's request for additional tokens in the current month."""
    __tablename__ = "ai_quota_requests"
    __table_args__ = (Index("ix_ai_quota_request_org_period_status", "organization_id", "period_start", "status"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    requested_tokens: Mapped[int] = mapped_column(Integer, nullable=False)
    approved_tokens: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    reason: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="pending", nullable=False)
    reviewed_by: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    reviewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    review_note: Mapped[str | None] = mapped_column(Text)


class OrganizationMembership(Base, TimestampMixin):
    __tablename__ = "organization_memberships"
    __table_args__ = (UniqueConstraint("organization_id", "user_id", name="uq_membership_org_user"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"), index=True)
    role: Mapped[str] = mapped_column(String(32), default="viewer", nullable=False)


class Department(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "departments"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_department_code"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    parent_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("departments.id", ondelete="SET NULL"))
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(160), nullable=False)
    manager_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    description: Mapped[str | None] = mapped_column(Text)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class Process(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "processes"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_process_code"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    department_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("departments.id", ondelete="RESTRICT"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str | None] = mapped_column(Text)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class ProcessConfiguration(Base, TimestampMixin, OrganizationScoped):
    """Editable workflow draft, separate from a process's master data."""
    __tablename__ = "process_configurations"
    __table_args__ = (CheckConstraint("revision >= 0", name="ck_process_config_revision"),)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), primary_key=True)
    revision: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, default=dict, nullable=False)
    published_revision: Mapped[int | None] = mapped_column(Integer)
    published_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class ProcessConfigurationVersion(Base, OrganizationScoped):
    """An immutable snapshot of a published process configuration."""
    __tablename__ = "process_configuration_versions"
    __table_args__ = (
        UniqueConstraint("process_id", "revision", name="uq_process_config_version"),
        CheckConstraint("revision >= 1", name="ck_process_config_version_revision"),
        Index("ix_process_config_version_history", "organization_id", "process_id", "revision"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), index=True)
    revision: Mapped[int] = mapped_column(Integer, nullable=False)
    config: Mapped[dict] = mapped_column(JSON, nullable=False)
    published_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    published_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class Risk(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "risks"
    __table_args__ = (
        UniqueConstraint("organization_id", "code", name="uq_risk_code"),
        UniqueConstraint("organization_id", "process_id", "template_key", name="uq_risk_process_template"),
        CheckConstraint("likelihood BETWEEN 1 AND 5 AND impact BETWEEN 1 AND 5", name="ck_risk_scale"),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="RESTRICT"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    likelihood: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    impact: Mapped[int] = mapped_column(Integer, default=3, nullable=False)
    residual_likelihood: Mapped[int | None] = mapped_column(Integer)
    residual_impact: Mapped[int | None] = mapped_column(Integer)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    status: Mapped[str] = mapped_column(String(24), default="active", nullable=False)
    category: Mapped[str] = mapped_column(String(80), default="业务运营", nullable=False)
    verification_methods: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    evidence_requirements: Mapped[list] = mapped_column(JSON, default=list, nullable=False)
    sample_guidance: Mapped[str] = mapped_column(Text, default="", nullable=False)
    verification_frequency: Mapped[str] = mapped_column(String(24), default="monthly", nullable=False)
    owner_role: Mapped[str] = mapped_column(String(160), default="", nullable=False)
    template_key: Mapped[str | None] = mapped_column(String(180))
    template_version: Mapped[str | None] = mapped_column(String(40))
    # Deleting a risk that already has inspection history must not destroy the
    # evidence chain.  Archived risks stay addressable by historical RCM and
    # inspection rows but are hidden from the active risk register.
    archived_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class RiskProcessLink(Base, TimestampMixin, OrganizationScoped):
    """An additional process association for a risk with a legacy primary process."""
    __tablename__ = "risk_process_links"
    __table_args__ = (UniqueConstraint("organization_id", "risk_id", "process_id", name="uq_risk_process_link"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("risks.id", ondelete="CASCADE"), index=True)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), index=True)


class RiskObjectiveLink(Base, TimestampMixin, OrganizationScoped):
    """An explicit process-scoped association between a risk and an objective."""
    __tablename__ = "risk_objective_links"
    __table_args__ = (UniqueConstraint("organization_id", "risk_id", "objective_id", name="uq_risk_objective_link"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    risk_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("risks.id", ondelete="CASCADE"), index=True)
    objective_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("control_objectives.id", ondelete="CASCADE"), index=True)


class ControlObjective(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "control_objectives"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_objective_code"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="RESTRICT"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)


class Control(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "controls"
    __table_args__ = (UniqueConstraint("organization_id", "code", name="uq_control_code"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="RESTRICT"), index=True)
    objective_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("control_objectives.id", ondelete="RESTRICT"))
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False)
    control_type: Mapped[str] = mapped_column(String(24), default="preventive", nullable=False)
    frequency: Mapped[str] = mapped_column(String(24), default="monthly", nullable=False)
    execution_mode: Mapped[str] = mapped_column(String(24), default="manual", nullable=False)
    owner_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"))
    is_key_control: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)


class RCM(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "rcms"
    __table_args__ = (UniqueConstraint("organization_id", "process_id", "risk_id", "control_id", name="uq_rcm_mapping"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="RESTRICT"), index=True)
    risk_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("risks.id", ondelete="RESTRICT"), index=True)
    control_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("controls.id", ondelete="RESTRICT"), index=True)
    assertion: Mapped[str | None] = mapped_column(Text)
    test_procedure: Mapped[str | None] = mapped_column(Text)


class Inspection(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "inspections"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="RESTRICT"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    name: Mapped[str] = mapped_column(String(180), nullable=False)
    period_start: Mapped[date] = mapped_column(Date, nullable=False)
    period_end: Mapped[date] = mapped_column(Date, nullable=False)
    lead_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    status: Mapped[str] = mapped_column(String(24), default="planned", nullable=False)


class InspectionTest(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "inspection_tests"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspections.id", ondelete="CASCADE"), index=True)
    rcm_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("rcms.id", ondelete="RESTRICT"), index=True)
    tester_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    procedure: Mapped[str] = mapped_column(Text, nullable=False)
    result: Mapped[str] = mapped_column(String(28), default="not_tested", nullable=False)
    sample_description: Mapped[str | None] = mapped_column(Text)
    notes: Mapped[str | None] = mapped_column(Text)


class Finding(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "findings"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    inspection_test_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("inspection_tests.id", ondelete="RESTRICT"), unique=True)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    condition: Mapped[str] = mapped_column(Text, nullable=False)
    criteria: Mapped[str | None] = mapped_column(Text)
    root_cause: Mapped[str | None] = mapped_column(Text)
    impact: Mapped[str | None] = mapped_column(Text)
    recommendation: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(String(24), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="open", nullable=False)


class Issue(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "issues"
    __table_args__ = (
        CheckConstraint(
            "(finding_id IS NOT NULL AND risk_id IS NULL AND control_id IS NULL) OR (finding_id IS NULL AND risk_id IS NOT NULL)",
            name="ck_issue_source_finding_or_risk",
        ),
    )
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    finding_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("findings.id", ondelete="RESTRICT"), unique=True)
    risk_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("risks.id", ondelete="RESTRICT"), index=True)
    control_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("controls.id", ondelete="RESTRICT"), index=True)
    code: Mapped[str] = mapped_column(String(40), nullable=False)
    title: Mapped[str] = mapped_column(String(180), nullable=False)
    priority: Mapped[str] = mapped_column(String(24), default="medium", nullable=False)
    status: Mapped[str] = mapped_column(String(24), default="open", nullable=False)


class RemediationPlan(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "remediation_plans"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    issue_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("issues.id", ondelete="RESTRICT"), unique=True)
    owner_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"), index=True)
    root_cause: Mapped[str] = mapped_column(Text, nullable=False)
    action_plan: Mapped[str] = mapped_column(Text, nullable=False)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)
    current_version: Mapped[int] = mapped_column(Integer, default=0, nullable=False)


class RemediationSubmission(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "remediation_submissions"
    __table_args__ = (UniqueConstraint("remediation_plan_id", "version", name="uq_submission_version"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    remediation_plan_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("remediation_plans.id", ondelete="RESTRICT"), index=True)
    version: Mapped[int] = mapped_column(Integer, nullable=False)
    submitted_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
    summary: Mapped[str] = mapped_column(Text, nullable=False)
    root_cause_snapshot: Mapped[str | None] = mapped_column(Text)
    action_plan_snapshot: Mapped[str | None] = mapped_column(Text)
    due_date_snapshot: Mapped[date | None] = mapped_column(Date)


class ReviewRecord(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "review_records"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("remediation_submissions.id", ondelete="RESTRICT"), unique=True)
    reviewer_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)


class RetestRecord(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "retest_records"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    submission_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("remediation_submissions.id", ondelete="RESTRICT"), unique=True)
    tester_user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    passed: Mapped[bool] = mapped_column(Boolean, nullable=False)
    notes: Mapped[str] = mapped_column(Text, nullable=False)


class Evidence(Base, TimestampMixin, OrganizationScoped):
    __tablename__ = "evidences"
    __table_args__ = (CheckConstraint("(rcm_id IS NOT NULL AND remediation_plan_id IS NULL AND remediation_submission_id IS NULL) OR (rcm_id IS NULL AND remediation_plan_id IS NOT NULL AND remediation_submission_id IS NULL) OR (rcm_id IS NULL AND remediation_plan_id IS NULL AND remediation_submission_id IS NOT NULL)", name="ck_evidence_single_parent"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    rcm_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("rcms.id", ondelete="RESTRICT"), index=True)
    remediation_plan_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("remediation_plans.id", ondelete="RESTRICT"), index=True)
    remediation_submission_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("remediation_submissions.id", ondelete="RESTRICT"), index=True)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)


class PolicyDocument(Base, TimestampMixin, OrganizationScoped):
    """A company policy file stored in object storage for compliance review."""
    __tablename__ = "policy_documents"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    uploaded_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    object_key: Mapped[str] = mapped_column(String(500), unique=True, nullable=False)
    file_name: Mapped[str] = mapped_column(String(255), nullable=False)
    content_type: Mapped[str] = mapped_column(String(160), nullable=False)
    size_bytes: Mapped[int] = mapped_column(Integer, nullable=False)
    sha256: Mapped[str] = mapped_column(String(64), nullable=False)
    extracted_char_count: Mapped[int] = mapped_column(Integer, nullable=False)


class ProcessPolicyLink(Base, TimestampMixin, OrganizationScoped):
    """A process-level reference to an existing company policy document."""
    __tablename__ = "process_policy_links"
    __table_args__ = (UniqueConstraint("organization_id", "process_id", "policy_document_id", name="uq_process_policy_link"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    process_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("processes.id", ondelete="CASCADE"), index=True)
    policy_document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("policy_documents.id", ondelete="CASCADE"), index=True)


class PolicyAnalysis(Base):
    """Persisted AI review, scoped to both its document and organization."""
    __tablename__ = "policy_analyses"
    __table_args__ = (Index("ix_policy_analysis_org_document", "organization_id", "document_id", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    document_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("policy_documents.id", ondelete="CASCADE"), index=True)
    analyzed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    token_usage: Mapped[int] = mapped_column(Integer, nullable=False)
    usage_estimated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class PolicyCrossAnalysis(Base):
    """Persisted cross-document and workflow consistency review."""
    __tablename__ = "policy_cross_analyses"
    __table_args__ = (Index("ix_policy_cross_analysis_org_created", "organization_id", "created_at"),)
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("organizations.id", ondelete="CASCADE"), index=True)
    analyzed_by: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="RESTRICT"))
    provider: Mapped[str] = mapped_column(String(40), nullable=False)
    model: Mapped[str] = mapped_column(String(160), nullable=False)
    token_usage: Mapped[int] = mapped_column(Integer, nullable=False)
    usage_estimated: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    input_char_count: Mapped[int] = mapped_column(Integer, nullable=False)
    policy_document_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    process_ids: Mapped[list] = mapped_column(JSON, nullable=False)
    source_snapshot: Mapped[list] = mapped_column(JSON, nullable=False)
    result: Mapped[dict] = mapped_column(JSON, nullable=False)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)


class AuditEvent(Base):
    __tablename__ = "audit_events"
    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    organization_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("organizations.id", ondelete="SET NULL"), index=True)
    actor_user_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("users.id", ondelete="SET NULL"), index=True)
    action: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_type: Mapped[str] = mapped_column(String(80), nullable=False)
    entity_id: Mapped[uuid.UUID | None] = mapped_column(index=True)
    changes: Mapped[dict | None] = mapped_column(JSON)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=now_utc, nullable=False)
