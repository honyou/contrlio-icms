"""Organization-owned process risks, control links and reusable baselines."""

from __future__ import annotations

from collections import Counter
import hashlib
import uuid

from fastapi import HTTPException
from sqlalchemy import select
from sqlalchemy.inspection import inspect
from sqlalchemy.orm import Session

from app.models import Control, ControlObjective, Department, Organization, OrganizationMembership, Process, RCM, Risk, RiskObjectiveLink, RiskProcessLink, User
from app.risk_templates import ASSESSMENT_SCALES, RISK_TEMPLATES, get_risk_template
from app.schemas import RiskTemplateApplyIn


FREQUENCIES = {"per_transaction", "continuous", "daily", "weekly", "monthly", "quarterly", "annual", "ad_hoc"}
LEVEL_LABELS = {"low": "低", "medium": "中", "high": "高", "critical": "重大"}


def risk_level(score: int) -> str:
    if score <= 4:
        return "low"
    if score <= 9:
        return "medium"
    if score <= 16:
        return "high"
    return "critical"


def resolve_industry_key(industry: str | None) -> str:
    if industry in RISK_TEMPLATES:
        return industry
    if industry:
        value = industry.lower()
        aliases = {
            "餐饮": "food-beverage", "茶饮": "food-beverage", "食品": "food-beverage",
            "制造": "manufacturing", "快销": "commerce", "零售": "commerce", "电商": "commerce",
            "软件": "saas", "信息技术": "saas", "物流": "logistics", "供应链": "logistics",
            "建筑": "construction", "工程": "construction", "医疗": "healthcare", "健康": "healthcare",
            "专业服务": "professional-services", "咨询": "professional-services", "金融": "finance-services",
            "物业": "property", "教育": "education", "农业": "agriculture", "能源": "energy-utilities",
        }
        for marker, key in aliases.items():
            if marker in value:
                return key
    return next((key for key, template in RISK_TEMPLATES.items() if template["industry"] == industry), "general-enterprise")


def validate_risk_guidance(data: dict) -> None:
    """Validate both API creates and merged updates before persistence."""
    for key in ("likelihood", "impact", "residual_likelihood", "residual_impact"):
        value = data.get(key)
        if value is not None and (isinstance(value, bool) or not isinstance(value, int) or not 1 <= value <= 5):
            raise HTTPException(422, f"{key} 必须是 1 到 5 之间的整数")
    if (data.get("residual_likelihood") is None) != (data.get("residual_impact") is None):
        raise HTTPException(422, "剩余风险的可能性和影响程度必须同时填写或同时清空")
    for key in ("verification_methods", "evidence_requirements"):
        if key not in data:
            continue
        value = data[key]
        if not isinstance(value, list) or len(value) > 20 or any(
            not isinstance(item, str) or not item.strip() or len(item) > 1000 for item in value
        ):
            raise HTTPException(422, f"{key} 必须是最多 20 项的文本列表，每项为 1 到 1000 个字符")
    for key, max_length in (("category", 80), ("owner_role", 160), ("sample_guidance", 10000)):
        if key in data and (not isinstance(data[key], str) or len(data[key]) > max_length):
            raise HTTPException(422, f"{key} 必须是最多 {max_length} 个字符的文本")
    if "category" in data and not data["category"].strip():
        raise HTTPException(422, "风险类别不能为空")
    if "verification_frequency" in data and data["verification_frequency"] not in FREQUENCIES:
        raise HTTPException(422, "核查频率取值不合法")


def risk_management_out(db: Session, organization: Organization) -> dict:
    org_id = organization.id
    risks = list(db.scalars(select(Risk).where(
        Risk.organization_id == org_id,
        Risk.archived_at.is_(None),
    ).order_by(Risk.created_at.desc(), Risk.code)))
    processes = {row.id: row for row in db.scalars(select(Process).where(Process.organization_id == org_id).order_by(Process.code))}
    risk_processes = {row.id: {row.process_id} for row in risks}
    for link in db.scalars(select(RiskProcessLink).where(RiskProcessLink.organization_id == org_id)):
        if link.risk_id in risk_processes:
            risk_processes[link.risk_id].add(link.process_id)
    departments = {row.id: row for row in db.scalars(select(Department).where(Department.organization_id == org_id))}
    users = {row.id: row for row in db.scalars(select(User).join(
        OrganizationMembership, OrganizationMembership.user_id == User.id,
    ).where(OrganizationMembership.organization_id == org_id))}
    controls = {row.id: row for row in db.scalars(select(Control).where(Control.organization_id == org_id))}
    objectives = {row.id: row for row in db.scalars(select(ControlObjective).where(ControlObjective.organization_id == org_id))}
    risk_objectives: dict[uuid.UUID, list[ControlObjective]] = {}
    for link in db.scalars(select(RiskObjectiveLink).where(RiskObjectiveLink.organization_id == org_id)):
        objective = objectives.get(link.objective_id)
        if objective:
            risk_objectives.setdefault(link.risk_id, []).append(objective)
    links: dict[uuid.UUID, list[dict]] = {}
    for rcm in db.scalars(select(RCM).where(RCM.organization_id == org_id).order_by(RCM.created_at)):
        control = controls.get(rcm.control_id)
        if control is None or control.process_id != rcm.process_id or rcm.process_id not in risk_processes.get(rcm.risk_id, set()):
            continue
        objective = objectives.get(control.objective_id)
        owner = users.get(control.owner_user_id)
        links.setdefault(rcm.risk_id, []).append({
            "id": control.id, "code": control.code, "name": control.name, "description": control.description,
            "frequency": control.frequency, "test_procedure": rcm.test_procedure,
            "control_type": control.control_type, "execution_mode": control.execution_mode,
            "is_key_control": control.is_key_control, "is_active": control.is_active,
            "process_id": control.process_id, "objective_id": control.objective_id,
            "objective_name": objective.name if objective else None,
            "process_name": processes[control.process_id].name if control.process_id in processes else "未知流程",
            "owner_user_id": control.owner_user_id, "owner_name": owner.full_name if owner else None,
        })
    output = []
    for row in risks:
        process = processes.get(row.process_id)
        department = departments.get(process.department_id) if process else None
        owner = users.get(row.owner_user_id)
        process_ids = sorted(risk_processes.get(row.id, {row.process_id}), key=lambda process_id: processes[process_id].code if process_id in processes else "")
        process_names = [processes[process_id].name for process_id in process_ids if process_id in processes]
        department_names = list(dict.fromkeys(
            departments[processes[process_id].department_id].name
            for process_id in process_ids
            if process_id in processes and processes[process_id].department_id in departments
        ))
        # Older company records predate the guidance fields. Keep those risks
        # useful in the new register until an owner edits them with a precise
        # procedure and evidence list.
        verification_methods = row.verification_methods or ["资料核验", "抽样穿行", "异常追踪"]
        evidence_requirements = row.evidence_requirements or ["业务原始单据", "审批或复核记录", "异常处理记录"]
        sample_guidance = row.sample_guidance or f"从{process.name if process else '该流程'}期间业务总体抽样，核对授权、执行记录、结果与异常闭环。"
        score = row.likelihood * row.impact
        level = risk_level(score)
        residual_score = row.residual_likelihood * row.residual_impact if row.residual_likelihood is not None and row.residual_impact is not None else None
        residual_level = risk_level(residual_score) if residual_score is not None else None
        output.append({
            **{column.key: getattr(row, column.key) for column in inspect(row).mapper.column_attrs},
            "process_name": "、".join(process_names) if process_names else "未知流程",
            "process_ids": list(process_ids), "process_names": process_names,
            "objective_ids": [objective.id for objective in risk_objectives.get(row.id, [])],
            "objective_names": [objective.name for objective in risk_objectives.get(row.id, [])],
            "department_name": "、".join(department_names) if department_names else (department.name if department else "未分配部门"),
            "owner_name": owner.full_name if owner else None,
            "verification_methods": verification_methods,
            "evidence_requirements": evidence_requirements,
            "sample_guidance": sample_guidance,
            "risk_score": score, "risk_level": level, "risk_level_label": LEVEL_LABELS[level],
            "residual_score": residual_score, "residual_level": residual_level,
            "residual_level_label": LEVEL_LABELS[residual_level] if residual_level else None,
            "controls": links.get(row.id, []),
        })
    levels = Counter(row["risk_level"] for row in output)
    statuses = Counter(row["status"] for row in output)
    covered_processes = len({process_id for row in risks for process_id in risk_processes.get(row.id, {row.process_id})})
    return {
        "risks": output,
        "processes": [{
            "id": process.id, "code": process.code, "name": process.name, "is_active": process.is_active,
            "department_name": departments[process.department_id].name if process.department_id in departments else "未分配部门",
        } for process in processes.values()],
        "current_industry_key": resolve_industry_key(organization.industry),
        "assessment_scales": ASSESSMENT_SCALES,
        "summary": {
            "total_risks": len(output), "total_processes": len(processes),
            "processes_with_risks": covered_processes, "covered_processes": covered_processes,
            "high_risks": levels["high"], "critical_risks": levels["critical"],
            "uncontrolled_risks": sum(not any(control["is_active"] for control in row["controls"]) for row in output),
            "by_level": {level: levels[level] for level in LEVEL_LABELS},
            "by_status": {status: statuses[status] for status in ("active", "accepted", "mitigating", "closed")},
        },
    }


def seed_process_risks(db: Session, process: Process, industry_key: str, template_process: dict, version: str) -> tuple[dict, list[Risk], list[Control], list[RCM]]:
    """Append a baseline to a process; preserve every already adopted record."""
    counts = {"risks": 0, "objectives": 0, "controls": 0, "rcms": 0, "skipped_risks": 0}
    risks, controls, rcms = [], [], []
    existing = {row.template_key: row for row in db.scalars(select(Risk).where(
        Risk.organization_id == process.organization_id, Risk.process_id == process.id,
        Risk.template_key.is_not(None),
    ))}
    for baseline in template_process["risks"]:
        template_key = f"{industry_key}/{template_process['code']}/{baseline['key']}"
        if template_key in existing:
            counts["skipped_risks"] += 1
            continue
        token = hashlib.sha256(f"{process.id}/{template_key}".encode()).hexdigest()[:20].upper()
        risk = Risk(
            organization_id=process.organization_id, process_id=process.id, code=f"RISK-{token}",
            name=baseline["name"], description=baseline["description"], category=baseline["category"],
            likelihood=baseline["likelihood"], impact=baseline["impact"],
            verification_methods=list(baseline["verification_methods"]), evidence_requirements=list(baseline["evidence_requirements"]),
            sample_guidance=baseline["sample_guidance"], verification_frequency=baseline["frequency"],
            owner_role=baseline["owner_role"], owner_user_id=process.owner_user_id,
            template_key=template_key, template_version=version,
        )
        objective = ControlObjective(
            organization_id=process.organization_id, process_id=process.id, code=f"OBJ-{token}",
            name=f"{baseline['name']}控制目标"[:180], description=baseline["objective"],
        )
        db.add_all([risk, objective])
        db.flush()
        db.add(RiskObjectiveLink(
            organization_id=process.organization_id, risk_id=risk.id, objective_id=objective.id,
        ))
        control = Control(
            organization_id=process.organization_id, process_id=process.id, objective_id=objective.id,
            code=f"CTL-{token}", name=baseline["control_name"], description=baseline["control_description"],
            control_type="detective", frequency=baseline["frequency"], execution_mode="manual",
            owner_user_id=process.owner_user_id,
        )
        db.add(control)
        db.flush()
        rcm = RCM(
            organization_id=process.organization_id, process_id=process.id, risk_id=risk.id, control_id=control.id,
            assertion=baseline["objective"], test_procedure=baseline["test_procedure"],
        )
        db.add(rcm)
        db.flush()
        existing[template_key] = risk
        risks.append(risk)
        controls.append(control)
        rcms.append(rcm)
        for key in ("risks", "objectives", "controls", "rcms"):
            counts[key] += 1
    return counts, risks, controls, rcms


def apply_risk_template(db: Session, organization: Organization, payload: RiskTemplateApplyIn) -> dict:
    """Validate the full plan first, then add records in the caller's transaction."""
    template = get_risk_template(payload.industry_key)
    if template is None:
        raise HTTPException(422, "行业风险模板不存在")
    catalog = {row["code"]: row for row in template["processes"]}
    selected_codes = payload.process_codes if payload.process_codes is not None else list(catalog)
    if len(set(selected_codes)) != len(selected_codes) or any(code not in catalog for code in selected_codes):
        raise HTTPException(422, "流程编号重复或不属于所选行业风险模板")
    if set(payload.process_mapping) - set(selected_codes):
        raise HTTPException(422, "流程映射只允许包含本次选用的模板流程")
    processes = list(db.scalars(select(Process).where(Process.organization_id == organization.id)))
    by_id = {process.id: process for process in processes}
    plan: dict[str, Process | None] = {}
    for code in selected_codes:
        baseline = catalog[code]
        if code in payload.process_mapping:
            process = by_id.get(payload.process_mapping[code])
            if process is None:
                raise HTTPException(422, "映射流程必须属于当前公司")
        else:
            matches = [process for process in processes if process.code == code or process.code.endswith(f"-{code}") or process.name == baseline["name"]]
            if len(matches) > 1:
                raise HTTPException(422, f"{baseline['name']} 匹配到多个流程，请明确选择映射流程")
            process = matches[0] if matches else None
        if process is not None and not process.is_active:
            raise HTTPException(422, f"{process.name} 已停用，请选择有效流程")
        if process is None and not payload.create_missing_processes:
            raise HTTPException(422, f"缺少 {baseline['name']} 流程，请选择映射或允许创建缺失流程")
        plan[code] = process
    mapped_ids = [process.id for process in plan.values() if process is not None]
    if len(mapped_ids) != len(set(mapped_ids)):
        raise HTTPException(422, "不同模板流程不能映射到同一公司流程")
    departments = list(db.scalars(select(Department).where(Department.organization_id == organization.id)))
    department_plan: dict[str, Department | None] = {}
    for code, process in plan.items():
        if process is not None:
            continue
        name = catalog[code]["department"]
        matches = [department for department in departments if department.name == name and department.is_active]
        if len(matches) > 1:
            raise HTTPException(422, f"{name} 存在多个同名部门，请先创建流程并明确映射")
        department_plan[name] = matches[0] if matches else None

    created = {"departments": 0, "processes": 0, "risks": 0, "objectives": 0, "controls": 0, "rcms": 0}
    for name, department in department_plan.items():
        if department is None:
            token = hashlib.sha256(f"{template['industry_key']}/{name}".encode()).hexdigest()[:16].upper()
            code = f"RISK-D-{token}"
            occupied = {row.code for row in departments}
            suffix = 1
            while code in occupied:
                code = f"RISK-D-{token}-{suffix}"
                suffix += 1
            department = Department(organization_id=organization.id, code=code, name=name, description="行业基础风险模板参考部门，请按公司实际职责调整。")
            db.add(department)
            db.flush()
            departments.append(department)
            department_plan[name] = department
            created["departments"] += 1
    skipped = 0
    for code, process in plan.items():
        baseline = catalog[code]
        if process is None:
            token = hashlib.sha256(template["industry_key"].encode()).hexdigest()[:8].upper()
            process_code = f"RISK-{token}-{code}"
            occupied = {row.code for row in processes}
            suffix = 1
            while process_code in occupied:
                process_code = f"RISK-{token}-{suffix}-{code}"
                suffix += 1
            process = Process(
                organization_id=organization.id, department_id=department_plan[baseline["department"]].id,
                code=process_code, name=baseline["name"], description=baseline["description"],
            )
            db.add(process)
            db.flush()
            processes.append(process)
            created["processes"] += 1
        counts, _, _, _ = seed_process_risks(db, process, template["industry_key"], baseline, template["version"])
        for key in ("risks", "objectives", "controls", "rcms"):
            created[key] += counts[key]
        skipped += counts["skipped_risks"]
    if not organization.industry:
        organization.industry = template["industry"]
    return {
        "created": created, "skipped_risks": skipped,
        "message": f"已新增 {created['risks']} 项流程风险与控制，跳过 {skipped} 项已采用风险。请结合实际业务复核基础评分、责任人和核查安排。",
    }
