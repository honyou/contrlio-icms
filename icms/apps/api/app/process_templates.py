"""Editable workflow drafts built from a company's actual process records."""

from app.models import Control, Process, RCM, Risk


def build_process_configuration_template(
    process: Process, risks: list[Risk], controls: list[Control], rcms: list[RCM]
) -> dict:
    def step(key: str, name: str, description: str, **changes) -> dict:
        return {
            "id": key, "name": name, "type": "task", "description": description[:5000],
            "department_id": str(process.department_id),
            "assignee_user_id": str(process.owner_user_id) if process.owner_user_id else None,
            "approver_user_ids": [], "approval_mode": "all", "deadline_hours": 24,
            "evidence_required": True,
            "evidence_description": "保留业务单据、处理结果及操作日期，能够追溯到业务编号。",
            "risk_ids": [], "control_ids": [], "next_step_id": None, "branches": [],
            **changes,
        }

    control_instructions = "\n".join(f"{row.name}：{row.description}" for row in controls)[:4500]
    test_instructions = "\n".join(row.test_procedure for row in rcms if row.test_procedure)[:4500]
    return {
        "purpose": f"使{process.name}有明确的职责、复核依据、执行记录和异常处理闭环。",
        "scope": (process.description or f"当前公司{process.name}涉及的业务及原始记录。请补充起止边界。")[:5000],
        "trigger": f"收到一项{process.name}业务申请或到达既定办理周期时发起。",
        "frequency": controls[0].frequency if controls else "per_transaction",
        "input_description": "业务编号、业务日期、申请明细及相应原始凭据。",
        "output_description": "经授权的办理结果、控制执行记录、归档索引；发现异常时形成处理记录。",
        "exception_policy": "资料不全退回补充；未获授权不得执行。异常由流程负责人登记、明确责任人与期限，需整改的问题通过 Finding / Issue 记录并跟踪复核。",
        "form_fields": [
            {"id": "business_reference", "label": "业务编号", "type": "text", "required": True, "options": []},
            {"id": "business_date", "label": "业务日期", "type": "date", "required": True, "options": []},
            {"id": "business_details", "label": "业务明细与依据", "type": "textarea", "required": True, "options": []},
            {"id": "control_result", "label": "控制执行结果", "type": "select", "required": True, "options": ["无异常", "发现异常"]},
            {"id": "exception_notes", "label": "异常说明", "type": "textarea", "required": False, "options": []},
        ],
        "steps": [
            step("intake", "受理与资料核验", f"核对{process.name}申请资料和业务编号，确认范围、完整性及原始凭据。资料不足时退回补充。"),
            step("approval", "独立复核与授权", "指定实际审批人，核对授权依据、业务合理性和岗位分离后决定是否批准。", type="approval", assignee_user_id=None, evidence_description="审批结论、授权依据、审批人员及日期。"),
            step("control", "办理业务与执行控制", control_instructions or "依批准的业务资料执行操作，核对结果并记录实际控制结论。请按公司制度补充具体操作。", risk_ids=[str(row.id) for row in risks[:50]], control_ids=[str(row.id) for row in controls[:50]], evidence_description="原始单据、控制执行底稿及结论。" + (f"复核程序：{test_instructions}" if test_instructions else "")),
            step("route", "判断异常处理路径", "按办理表单中的控制执行结果分流。", type="condition", assignee_user_id=None, department_id=None, evidence_required=False, evidence_description="", branches=[{"field_id": "control_result", "operator": "eq", "value": "发现异常", "target_step_id": "exception"}]),
            step("archive", "正常业务归档", "核对批准内容、办理结果和控制记录，按业务编号归档以便后续检查。", next_step_id="end"),
            step("exception", "异常登记与整改跟踪", "记录偏差事实、影响、处置措施、责任人和期限；需要整改的问题进入 Finding / Issue 并保留独立复核依据。", next_step_id="end", deadline_hours=48, evidence_description="异常处理记录、关联问题编号、整改及复核资料。"),
        ],
    }
