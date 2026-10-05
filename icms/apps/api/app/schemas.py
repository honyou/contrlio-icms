from datetime import date
from typing import Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, EmailStr, Field


class LoginIn(BaseModel):
    email: EmailStr
    password: str


class OrganizationCreate(BaseModel):
    name: str = Field(min_length=2, max_length=180)
    code: str = Field(min_length=2, max_length=40)
    industry: str | None = None
    description: str | None = None
    template_id: str | None = Field(default=None, max_length=80)


class CompanyRegistrationIn(BaseModel):
    registration_code: str = Field(min_length=10, max_length=64)
    email: EmailStr
    password: str = Field(min_length=12, max_length=128)
    full_name: str = Field(min_length=1, max_length=160)
    organization_name: str = Field(min_length=2, max_length=180)
    organization_code: str = Field(min_length=2, max_length=40)
    industry: str | None = None
    template_id: str | None = Field(default=None, max_length=80)


class MemberCreate(BaseModel):
    email: EmailStr
    full_name: str = Field(min_length=1, max_length=160)
    password: str = Field(min_length=12, max_length=128)
    role: str = "viewer"


class MemberRoleUpdate(BaseModel):
    role: Literal["manager", "auditor", "owner", "viewer"]


class MemberPasswordReset(BaseModel):
    password: str = Field(min_length=12, max_length=128)


class UserStatusUpdate(BaseModel):
    is_active: bool


class PermanentAccessUpdate(BaseModel):
    permanent_access: bool


class RiskStatusIn(BaseModel):
    status: Literal["active", "accepted", "mitigating", "closed"]


class RiskTemplateApplyIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    industry_key: str = Field(min_length=1, max_length=80)
    process_codes: list[str] | None = Field(default=None, min_length=1, max_length=100)
    process_mapping: dict[str, UUID] = Field(default_factory=dict, max_length=100)
    create_missing_processes: bool = True


class InspectionStatusIn(BaseModel):
    status: Literal["planned", "in_progress", "completed"]


class GenericCreate(BaseModel):
    model_config = ConfigDict(extra="allow")


class GenericPatch(BaseModel):
    model_config = ConfigDict(extra="allow")


class RemediationCreate(BaseModel):
    owner_user_id: str = Field(min_length=36, max_length=36)
    root_cause: str = Field(min_length=3, max_length=10000)
    action_plan: str = Field(min_length=3, max_length=10000)
    due_date: date


class RiskRemediationCreate(BaseModel):
    owner_user_id: str = Field(min_length=36, max_length=36)
    control_id: str | None = Field(default=None, min_length=36, max_length=36)
    root_cause: str = Field(min_length=3, max_length=10000)
    action_plan: str = Field(min_length=3, max_length=10000)
    due_date: date


class RemediationUpdate(BaseModel):
    owner_user_id: str | None = Field(default=None, min_length=36, max_length=36)
    root_cause: str | None = Field(default=None, min_length=3, max_length=10000)
    action_plan: str | None = Field(default=None, min_length=3, max_length=10000)
    due_date: date | None = None


class SubmitIn(BaseModel):
    summary: str = Field(min_length=3, max_length=4000)


class DecisionIn(BaseModel):
    passed: bool
    notes: str = Field(min_length=2, max_length=4000)


class AIProviderConfigIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    provider: str = Field(min_length=2, max_length=40)
    protocol: str = Field(pattern="^(openai-responses|openai-compatible|anthropic|google-gemini)$")
    base_url: str = Field(min_length=8, max_length=500)
    model: str = Field(min_length=1, max_length=160)
    # Blank means retain the currently saved credential; credentials are never
    # sent back to a browser after initial submission.
    api_key: str = Field(default="", max_length=1000)


class AIConversationTurn(BaseModel):
    role: Literal["user", "assistant"]
    content: str = Field(min_length=1, max_length=4000)


class AIAssistIn(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task: str = Field(pattern="^(regulatory_update|process_guidance)$")
    process_id: str | None = Field(default=None, max_length=36)
    regulation_id: str | None = Field(default=None, max_length=100)
    question: str = Field(min_length=3, max_length=4000)
    source_material: str = Field(default="", max_length=20000)
    conversation: list[AIConversationTurn] = Field(default_factory=list, max_length=8)
    confirm_external_transfer: bool = False


class PolicyAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm_external_transfer: bool = False
    regulation_material: str = Field(default="", max_length=20_000)
    regulation_source_url: str = Field(default="", max_length=500)


class PolicyCrossAnalysisRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    confirm_external_transfer: bool = False
    policy_document_ids: list[UUID] = Field(min_length=2, max_length=20)
    process_ids: list[UUID] = Field(default_factory=list, max_length=100)


class AIQuotaUpdateIn(BaseModel):
    monthly_limit_tokens: int = Field(ge=0, le=100_000_000)


class AIQuotaRequestIn(BaseModel):
    requested_tokens: int = Field(ge=1_000, le=5_000_000)
    reason: str = Field(min_length=5, max_length=2000)


class AIQuotaReviewIn(BaseModel):
    approved: bool
    approved_tokens: int | None = Field(default=None, ge=0, le=5_000_000)
    review_note: str = Field(default="", max_length=2000)
