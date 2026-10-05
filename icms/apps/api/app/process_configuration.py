"""Typed workflow drafts, reference validation, and immutable publications."""

from __future__ import annotations

import math
import uuid
from datetime import date, datetime
from typing import Literal

from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field, model_validator
from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.models import (
    Control, Department, OrganizationMembership, Process, ProcessConfiguration,
    ProcessConfigurationVersion, Risk, User, now_utc,
)
from app.services import audit


class ConfigurationModel(BaseModel):
    model_config = ConfigDict(extra="forbid", str_strip_whitespace=True)


class WorkflowFormField(ConfigurationModel):
    id: str = Field(min_length=1, max_length=100)
    label: str = Field(min_length=1, max_length=180)
    type: Literal["text", "textarea", "number", "date", "select", "checkbox"] = "text"
    required: bool = False
    options: list[str] = Field(default_factory=list, max_length=100)

    @model_validator(mode="after")
    def valid_options(self):
        if any(not value.strip() or len(value) > 500 for value in self.options):
            raise ValueError("表单选项不能为空或超过 500 个字符")
        if len(set(self.options)) != len(self.options):
            raise ValueError("表单选项不能重复")
        return self


class WorkflowBranch(ConfigurationModel):
    field_id: str = Field(min_length=1, max_length=100)
    operator: Literal["eq", "neq", "gt", "gte", "lt", "lte", "contains", "is_true", "is_false"] = "eq"
    value: str = Field(default="", max_length=500)
    target_step_id: str = Field(min_length=1, max_length=100)


class WorkflowStep(ConfigurationModel):
    id: str = Field(min_length=1, max_length=100)
    name: str = Field(min_length=1, max_length=180)
    type: Literal["task", "approval", "condition"] = "task"
    description: str = Field(default="", max_length=5000)
    department_id: str | None = None
    assignee_user_id: str | None = None
    approver_user_ids: list[str] = Field(default_factory=list, max_length=100)
    approval_mode: Literal["any", "all", "sequential"] = "any"
    deadline_hours: int = Field(default=24, ge=1, le=8760)
    evidence_required: bool = False
    evidence_description: str = Field(default="", max_length=5000)
    risk_ids: list[str] = Field(default_factory=list, max_length=100)
    control_ids: list[str] = Field(default_factory=list, max_length=100)
    next_step_id: str | None = Field(default=None, min_length=1, max_length=100)
    branches: list[WorkflowBranch] = Field(default_factory=list, max_length=20)


class WorkflowConfig(ConfigurationModel):
    purpose: str = Field(default="", max_length=5000)
    scope: str = Field(default="", max_length=5000)
    trigger: str = Field(default="", max_length=5000)
    frequency: str = Field(default="", max_length=180)
    input_description: str = Field(default="", max_length=5000)
    output_description: str = Field(default="", max_length=5000)
    exception_policy: str = Field(default="", max_length=5000)
    form_fields: list[WorkflowFormField] = Field(default_factory=list, max_length=50)
    steps: list[WorkflowStep] = Field(default_factory=list, max_length=60)


class ConfigurationSaveIn(ConfigurationModel):
    expected_revision: int = Field(ge=0, strict=True)
    config: WorkflowConfig


class ConfigurationPublishIn(ConfigurationModel):
    expected_revision: int = Field(ge=0, strict=True)


class ConfigurationHistoryOut(ConfigurationModel):
    revision: int
    published_at: datetime
    published_by: uuid.UUID
    config: WorkflowConfig


class ConfigurationOut(ConfigurationModel):
    process_id: uuid.UUID
    revision: int
    config: WorkflowConfig
    published_revision: int | None
    published_config: WorkflowConfig | None
    published_at: datetime | None
    history: list[ConfigurationHistoryOut]


def _invalid(message: str) -> None:
    raise HTTPException(422, message)


def _ids(values: list[str], label: str) -> set[uuid.UUID]:
    try:
        result = {uuid.UUID(value) for value in values}
    except (ValueError, TypeError, AttributeError):
        _invalid(f"{label} 必须是有效 ID")
    if len(result) != len(values):
        _invalid(f"{label} 不能重复")
    return result


def _validate_references(db: Session, process: Process, config: WorkflowConfig) -> None:
    """Resolve references in batches and enforce both company and process scope."""
    department_ids: set[uuid.UUID] = set()
    member_ids: set[uuid.UUID] = set()
    risk_ids: set[uuid.UUID] = set()
    control_ids: set[uuid.UUID] = set()
    for step in config.steps:
        if step.department_id is not None:
            department_ids.update(_ids([step.department_id], f"节点“{step.name}”的负责部门"))
        if step.assignee_user_id is not None:
            member_ids.update(_ids([step.assignee_user_id], f"节点“{step.name}”的经办人"))
        member_ids.update(_ids(step.approver_user_ids, f"节点“{step.name}”的审批人"))
        risk_ids.update(_ids(step.risk_ids, f"节点“{step.name}”的关联风险"))
        control_ids.update(_ids(step.control_ids, f"节点“{step.name}”的关联控制"))

    if department_ids:
        actual = set(db.scalars(select(Department.id).where(
            Department.id.in_(department_ids), Department.organization_id == process.organization_id,
            Department.is_active.is_(True),
        )))
        if actual != department_ids:
            _invalid("负责部门必须是当前公司的有效部门")
    if member_ids:
        actual = set(db.scalars(select(User.id).join(OrganizationMembership, OrganizationMembership.user_id == User.id).where(
            User.id.in_(member_ids), User.is_active.is_(True),
            OrganizationMembership.organization_id == process.organization_id,
        )))
        if actual != member_ids:
            _invalid("经办人和审批人必须是当前公司的有效成员")
    for model, wanted, label in ((Risk, risk_ids, "风险"), (Control, control_ids, "控制")):
        if not wanted:
            continue
        actual = set(db.scalars(select(model.id).where(
            model.id.in_(wanted), model.organization_id == process.organization_id,
            model.process_id == process.id,
        )))
        if actual != wanted:
            _invalid(f"关联{label}必须属于当前公司及当前流程")


def _validate_branch_value(field: WorkflowFormField, branch: WorkflowBranch, step_name: str) -> None:
    numeric = {"eq", "neq", "gt", "gte", "lt", "lte"}
    allowed = {
        "text": {"eq", "neq", "contains"}, "textarea": {"eq", "neq", "contains"},
        "select": {"eq", "neq", "contains"}, "number": numeric, "date": numeric,
        "checkbox": {"eq", "neq", "is_true", "is_false"},
    }
    if branch.operator not in allowed[field.type]:
        _invalid(f"节点“{step_name}”：条件运算符不适用于字段“{field.label}”")
    if branch.operator in {"is_true", "is_false"}:
        return
    if not branch.value:
        _invalid(f"节点“{step_name}”：字段“{field.label}”的条件比较值不能为空")
    if field.type == "number":
        try:
            valid = math.isfinite(float(branch.value))
        except ValueError:
            valid = False
        if not valid:
            _invalid(f"节点“{step_name}”：字段“{field.label}”需要有效数字")
    elif field.type == "date":
        try:
            valid = date.fromisoformat(branch.value).isoformat() == branch.value
        except ValueError:
            valid = False
        if not valid:
            _invalid(f"节点“{step_name}”：字段“{field.label}”需要 YYYY-MM-DD 日期")
    elif field.type == "checkbox" and branch.value not in {"true", "false"}:
        _invalid(f"节点“{step_name}”：勾选字段的比较值必须是 true 或 false")
    elif field.type == "select" and branch.operator in {"eq", "neq"} and branch.value not in field.options:
        _invalid(f"节点“{step_name}”：比较值必须来自字段“{field.label}”的选项")


def validate_configuration(db: Session, process: Process, config: WorkflowConfig, *, publishing: bool = False) -> None:
    fields = {field.id: field for field in config.form_fields}
    steps = {step.id: index for index, step in enumerate(config.steps)}
    if len(fields) != len(config.form_fields):
        _invalid("表单字段 ID 不能重复")
    if len(steps) != len(config.steps) or "end" in steps:
        _invalid("流程节点 ID 不能重复，也不能使用保留名称 end")

    edges: dict[str, set[str]] = {}
    for index, step in enumerate(config.steps):
        if step.type != "condition" and step.branches:
            _invalid(f"节点“{step.name}”：只有条件节点可以配置分支")
        fallback = step.next_step_id or (config.steps[index + 1].id if index + 1 < len(config.steps) else "end")
        targets = {fallback}
        for branch in step.branches:
            if branch.field_id not in fields:
                _invalid(f"节点“{step.name}”：分支引用的表单字段不存在")
            targets.add(branch.target_step_id)
            if publishing:
                _validate_branch_value(fields[branch.field_id], branch, step.name)
        for target in targets:
            if target == "end":
                continue
            if target not in steps:
                _invalid(f"节点“{step.name}”：流转目标不存在")
            if steps[target] <= index:
                _invalid(f"节点“{step.name}”：流转不能指向自身或之前的节点")
        edges[step.id] = targets - {"end"}

    _validate_references(db, process, config)
    if not publishing:
        return
    overview = {
        "purpose": "流程目的", "scope": "适用范围", "trigger": "触发条件",
        "input_description": "输入材料", "output_description": "输出成果", "exception_policy": "异常处理规则",
    }
    missing = [label for key, label in overview.items() if not getattr(config, key)]
    if missing:
        _invalid(f"发布前请补全：{'、'.join(missing)}")
    if not config.steps:
        _invalid("发布前至少配置一个流程节点")
    for field in config.form_fields:
        if field.type == "select" and not field.options:
            _invalid(f"表单字段“{field.label}”：下拉选项不能为空")
    for step in config.steps:
        if step.type == "task" and not (step.assignee_user_id or step.department_id):
            _invalid(f"节点“{step.name}”：请指定经办人或负责部门")
        if step.type == "approval" and not step.approver_user_ids:
            _invalid(f"节点“{step.name}”：请指定至少一名审批人")
        if step.type == "condition" and not step.branches:
            _invalid(f"节点“{step.name}”：请配置至少一条条件分支")
        if step.evidence_required and not step.evidence_description:
            _invalid(f"节点“{step.name}”：请填写必需的证据材料说明")
    reachable: set[str] = set()
    pending = [config.steps[0].id]
    while pending:
        node_id = pending.pop()
        if node_id in reachable:
            continue
        reachable.add(node_id)
        pending.extend(edges[node_id])
    if len(reachable) != len(config.steps):
        _invalid("存在无法从首个节点到达的流程节点，请检查流转和条件分支")


def configuration_out(db: Session, process: Process) -> ConfigurationOut:
    row = db.scalar(select(ProcessConfiguration).where(
        ProcessConfiguration.process_id == process.id,
        ProcessConfiguration.organization_id == process.organization_id,
    ).execution_options(populate_existing=True))
    if row is None:
        return ConfigurationOut(process_id=process.id, revision=0, config=WorkflowConfig(),
                                published_revision=None, published_config=None, published_at=None, history=[])
    history = db.scalars(select(ProcessConfigurationVersion).where(
        ProcessConfigurationVersion.process_id == process.id,
        ProcessConfigurationVersion.organization_id == process.organization_id,
    ).order_by(ProcessConfigurationVersion.revision.desc()).limit(20)).all()
    published = next((item for item in history if item.revision == row.published_revision), None)
    return ConfigurationOut(
        process_id=process.id, revision=row.revision, config=WorkflowConfig.model_validate(row.config),
        published_revision=row.published_revision, published_config=published.config if published else None,
        published_at=row.published_at,
        history=[ConfigurationHistoryOut(revision=item.revision, published_at=item.published_at,
                                         published_by=item.published_by, config=item.config) for item in history],
    )


def save_configuration(db: Session, user: User, process: Process, payload: ConfigurationSaveIn) -> None:
    row = db.get(ProcessConfiguration, process.id)
    if payload.expected_revision != (row.revision if row else 0):
        raise HTTPException(409, "流程配置已被其他人修改，请重新加载后再保存")
    validate_configuration(db, process, payload.config)
    data = payload.config.model_dump(mode="json")
    next_revision = payload.expected_revision + 1
    if row is None:
        db.add(ProcessConfiguration(process_id=process.id, organization_id=process.organization_id,
                                    revision=next_revision, config=data))
    else:
        changed = db.execute(update(ProcessConfiguration).where(
            ProcessConfiguration.process_id == process.id,
            ProcessConfiguration.organization_id == process.organization_id,
            ProcessConfiguration.revision == payload.expected_revision,
        ).values(revision=next_revision, config=data, updated_at=now_utc()).execution_options(synchronize_session=False))
        if changed.rowcount != 1:
            raise HTTPException(409, "流程配置已被其他人修改，请重新加载后再保存")
    audit(db, user, "save_process_configuration", "process_configuration", process.id, process.organization_id,
          {"previous_revision": payload.expected_revision, "revision": next_revision, "step_count": len(payload.config.steps)})


def publish_configuration(db: Session, user: User, process: Process, payload: ConfigurationPublishIn) -> None:
    row = db.scalar(select(ProcessConfiguration).where(
        ProcessConfiguration.process_id == process.id,
        ProcessConfiguration.organization_id == process.organization_id,
    ).with_for_update().execution_options(populate_existing=True))
    if payload.expected_revision != (row.revision if row else 0):
        raise HTTPException(409, "流程配置已被其他人修改，请重新加载后再发布")
    if row is not None and row.published_revision == row.revision:
        raise HTTPException(409, "当前版本已经发布，请修改并保存新版本后再发布")
    config = WorkflowConfig.model_validate(row.config) if row else WorkflowConfig()
    validate_configuration(db, process, config, publishing=True)
    published_at = now_utc()
    changed = db.execute(update(ProcessConfiguration).where(
        ProcessConfiguration.process_id == process.id,
        ProcessConfiguration.organization_id == process.organization_id,
        ProcessConfiguration.revision == payload.expected_revision,
        or_(ProcessConfiguration.published_revision.is_(None), ProcessConfiguration.published_revision != payload.expected_revision),
    ).values(published_revision=payload.expected_revision, published_at=published_at,
             updated_at=published_at).execution_options(synchronize_session=False))
    if changed.rowcount != 1:
        raise HTTPException(409, "流程配置已被修改或发布，请重新加载")
    db.add(ProcessConfigurationVersion(process_id=process.id, organization_id=process.organization_id,
                                       revision=payload.expected_revision, config=config.model_dump(mode="json"),
                                       published_by=user.id, published_at=published_at))
    audit(db, user, "publish_process_configuration", "process_configuration", process.id, process.organization_id,
          {"revision": payload.expected_revision, "step_count": len(config.steps)})
