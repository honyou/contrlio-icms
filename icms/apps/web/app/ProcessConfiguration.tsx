"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDown, ArrowRight, ArrowUp, BadgeCheck, Building2, Check, ChevronRight, ClipboardList, Clock3, FileText, GitBranch, History, Layers3, LoaderCircle, Plus, Save, ShieldCheck, Sparkles, Trash2, Users, X } from "lucide-react";
import { useI18n } from "./I18n";
import { compactRiskCode } from "./risk-code";
import "./process-configuration.css";

// Keep configuration requests same-origin in local development. The Next.js
// proxy forwards /api/* to the API service, so the session cookie and CORS
// origin stay consistent with the process list and risk management pages.
const API = process.env.NEXT_PUBLIC_API_URL || "";
type FieldType = "text" | "textarea" | "number" | "date" | "select" | "checkbox";
type Operator = "eq" | "neq" | "gt" | "gte" | "lt" | "lte" | "contains" | "is_true" | "is_false";
type FormField = { id: string; label: string; type: FieldType; required: boolean; options: string[] };
type Branch = { field_id: string; operator: Operator; value: string; target_step_id: string };
type Step = { id: string; name: string; type: "task" | "approval" | "condition"; description: string; department_id: string | null; assignee_user_id: string | null; approver_user_ids: string[]; approval_mode: "any" | "all" | "sequential"; deadline_hours: number; evidence_required: boolean; evidence_description: string; risk_ids: string[]; control_ids: string[]; next_step_id: string | null; branches: Branch[] };
type Configuration = { purpose: string; scope: string; trigger: string; frequency: string; input_description: string; output_description: string; exception_policy: string; form_fields: FormField[]; steps: Step[] };
type Version = { revision: number; published_at: string; published_by: string; config: Configuration };
type ConfigurationResponse = { process_id: string; revision: number; config: Configuration; published_revision: number | null; published_config: Configuration | null; published_at: string | null; history: Version[] };
type Row = Record<string, any> & { id: string; name?: string; code?: string; description?: string; process_id?: string; department_id?: string; owner_user_id?: string; is_active?: boolean; user?: { id: string; full_name: string; email: string; is_active?: boolean }; role?: string };
type Member = { id: string; name: string; email: string };
type Translator = (zh: string, en: string) => string;
type Problem = { text: string; stepId?: string };
type Props = { org: { id: string; name: string }; processId: string; canManage: boolean; onClose: () => void; onChanged: (message: string) => void; initialTab?: string; focusRiskId?: string; focusObjectiveId?: string };

const fieldLabels: Record<FieldType, [string, string]> = { text: ["单行文本", "Short text"], textarea: ["多行文本", "Long text"], number: ["数字", "Number"], date: ["日期", "Date"], select: ["单选列表", "Dropdown"], checkbox: ["勾选项", "Checkbox"] };
const stepLabels: Record<Step["type"], [string, string]> = { task: ["办理任务", "Task"], approval: ["审批节点", "Approval"], condition: ["条件分支", "Condition"] };
const operatorLabels: Record<Operator, [string, string]> = { eq: ["等于", "Equals"], neq: ["不等于", "Does not equal"], gt: ["大于", "Greater than"], gte: ["大于或等于", "At least"], lt: ["小于", "Less than"], lte: ["小于或等于", "At most"], contains: ["包含", "Contains"], is_true: ["已勾选", "Checked"], is_false: ["未勾选", "Unchecked"] };
const controlFrequencyLabel = (value: unknown) => ({ continuous: "持续", daily: "每日", weekly: "每周", monthly: "每月", quarterly: "每季度", annual: "每年", ad_hoc: "按需" } as Record<string, string>)[String(value)] || String(value || "未设置");
const emptyConfig = (): Configuration => ({ purpose: "", scope: "", trigger: "", frequency: "", input_description: "", output_description: "", exception_policy: "", form_fields: [], steps: [] });
const uid = (prefix: string) => `${prefix}_${crypto.randomUUID().slice(0, 12)}`;
const copy = <T,>(value: T): T => JSON.parse(JSON.stringify(value));
const normalized = (config: Configuration): Configuration => ({ ...copy(config), form_fields: config.form_fields.map(field => ({ ...field, options: field.options.map(option => option.trim()).filter(Boolean) })) });
const operatorsFor = (type?: FieldType): Operator[] => type === "checkbox" ? ["is_true", "is_false", "eq", "neq"] : type === "number" || type === "date" ? ["eq", "neq", "gt", "gte", "lt", "lte"] : ["eq", "neq", "contains"];
const toggle = (items: string[], value: string) => items.includes(value) ? items.filter(item => item !== value) : [...items, value];
const newStep = (type: Step["type"], number: number, process: Row | null): Step => ({ id: uid("step"), name: `${stepLabels[type][0]} ${number}`, type, description: "", department_id: process?.department_id || null, assignee_user_id: type === "task" ? process?.owner_user_id || null : null, approver_user_ids: [], approval_mode: "all", deadline_hours: 24, evidence_required: false, evidence_description: "", risk_ids: [], control_ids: [], next_step_id: null, branches: [] });

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail: unknown = body.detail;
    const message = typeof detail === "string" ? detail : Array.isArray(detail) ? detail.map(item => typeof item === "string" ? item : `${Array.isArray(item?.loc) ? item.loc.filter((part: string) => part !== "body").join(" · ") : ""} ${item?.msg || "配置无效"}`).join("；") : `请求失败 (${response.status})`;
    throw new Error(message);
  }
  return body as T;
}

function validate(config: Configuration, t: Translator, publication: boolean): Problem[] {
  const result: Problem[] = [];
  const add = (text: string, stepId?: string) => result.push({ text, stepId });
  if (publication) {
    const required: [keyof Configuration, string, string][] = [["purpose", "流程目标", "Purpose"], ["scope", "适用范围", "Scope"], ["trigger", "触发条件", "Trigger"], ["input_description", "输入材料", "Inputs"], ["output_description", "输出成果", "Outputs"], ["exception_policy", "异常处理", "Exception handling"]];
    required.forEach(([key, zh, en]) => { if (!String(config[key]).trim()) add(t(`请填写${zh}`, `Complete ${en.toLowerCase()}`)); });
    if (!config.steps.length) add(t("至少添加一个流程节点", "Add at least one step"));
  }
  const fieldIds = new Set(config.form_fields.map(field => field.id));
  const stepIds = new Set(config.steps.map(step => step.id));
  if (fieldIds.size !== config.form_fields.length) add(t("表单字段标识重复", "Form field IDs must be unique"));
  if (stepIds.size !== config.steps.length) add(t("流程节点标识重复", "Step IDs must be unique"));
  config.form_fields.forEach((field, index) => {
    const options = field.options.map(option => option.trim()).filter(Boolean);
    if (!field.label.trim()) add(t(`第 ${index + 1} 个字段缺少名称`, `Field ${index + 1} needs a label`));
    if (new Set(options).size !== options.length) add(t(`「${field.label}」的选项不能重复`, `“${field.label}” has duplicate options`));
    if (publication && field.type === "select" && !options.length) add(t(`「${field.label}」需要至少一个选项`, `“${field.label}” needs at least one option`));
  });
  config.steps.forEach((step, index) => {
    const prefix = step.name.trim() || t(`节点 ${index + 1}`, `Step ${index + 1}`);
    if (!step.name.trim()) add(t(`节点 ${index + 1} 缺少名称`, `Step ${index + 1} needs a name`), step.id);
    const checkTarget = (target: string | null, kind: string) => {
      if (target === null || target === "end") return;
      const targetIndex = config.steps.findIndex(item => item.id === target);
      if (targetIndex === -1 || targetIndex <= index) add(t(`「${prefix}」${kind}必须指向后续节点或结束`, `“${prefix}” must route to a later step or end`), step.id);
    };
    checkTarget(step.next_step_id, "默认流转");
    if (publication) {
      if (step.type === "task" && !step.assignee_user_id && !step.department_id) add(t(`「${prefix}」需要办理人或责任部门`, `“${prefix}” needs an assignee or department`), step.id);
      if (step.type === "approval" && !step.approver_user_ids.length) add(t(`「${prefix}」需要选择审批人`, `“${prefix}” needs an approver`), step.id);
      if (step.type === "condition" && !step.branches.length) add(t(`「${prefix}」需要至少一条分支规则`, `“${prefix}” needs a branch rule`), step.id);
      if (step.evidence_required && !step.evidence_description.trim()) add(t(`「${prefix}」需要说明证据要求`, `“${prefix}” needs evidence requirements`), step.id);
    }
    if (!Number.isInteger(step.deadline_hours) || step.deadline_hours < 1 || step.deadline_hours > 8760) add(t(`「${prefix}」办理时限必须为 1–8760 的整数小时`, `“${prefix}” needs a deadline of 1–8760 whole hours`), step.id);
    step.branches.forEach((branch, branchIndex) => {
      const field = config.form_fields.find(item => item.id === branch.field_id);
      if (!field) add(t(`「${prefix}」第 ${branchIndex + 1} 条规则需选择表单字段`, `“${prefix}” rule ${branchIndex + 1} needs a form field`), step.id);
      checkTarget(branch.target_step_id, "分支规则");
      if (field && !operatorsFor(field.type).includes(branch.operator)) add(t(`「${prefix}」规则运算符不适用于该字段`, `“${prefix}” has an incompatible operator`), step.id);
      if (publication && field) {
        const value = branch.value.trim();
        if (!["is_true", "is_false"].includes(branch.operator) && !value) add(t(`「${prefix}」第 ${branchIndex + 1} 条规则缺少比较值`, `“${prefix}” rule ${branchIndex + 1} needs a value`), step.id);
        else if (field.type === "number" && (!value || !Number.isFinite(Number(value)))) add(t(`「${prefix}」数字规则需要有效数字`, `“${prefix}” needs a numeric rule value`), step.id);
        else if (field.type === "date" && (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value)) || new Date(value).toISOString().slice(0, 10) !== value)) add(t(`「${prefix}」日期规则需要有效日期`, `“${prefix}” needs a valid date`), step.id);
        else if (field.type === "select" && ["eq", "neq"].includes(branch.operator) && !field.options.map(option => option.trim()).filter(Boolean).includes(value)) add(t(`「${prefix}」比较值必须来自字段选项`, `“${prefix}” needs a value from the field options`), step.id);
        else if (field.type === "checkbox" && ["eq", "neq"].includes(branch.operator) && !["true", "false"].includes(value)) add(t(`「${prefix}」勾选项比较值应为 true 或 false`, `“${prefix}” needs true or false`), step.id);
      }
    });
  });
  if (publication && config.steps.length) {
    const reachable = new Set<string>();
    const visit = (id: string) => {
      if (reachable.has(id) || !stepIds.has(id)) return;
      reachable.add(id);
      const index = config.steps.findIndex(step => step.id === id);
      const step = config.steps[index];
      const fallback = step.next_step_id || config.steps[index + 1]?.id || "end";
      visit(fallback);
      if (step.type === "condition") step.branches.forEach(branch => visit(branch.target_step_id));
    };
    visit(config.steps[0].id);
    config.steps.forEach(step => { if (!reachable.has(step.id)) add(t(`「${step.name}」无法从开始节点到达，请调整流转`, `“${step.name}” cannot be reached from the start`), step.id); });
  }
  return result;
}

export default function ProcessConfiguration({ org, processId, canManage, onClose, onChanged, initialTab, focusRiskId, focusObjectiveId }: Props) {
  const { locale } = useI18n();
  const t = useCallback<Translator>((zh, en) => locale === "en-US" ? en : zh, [locale]);
  const [record, setRecord] = useState<Row | null>(null);
  const [departments, setDepartments] = useState<Row[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [risks, setRisks] = useState<Row[]>([]);
  const [controls, setControls] = useState<Row[]>([]);
  const [objectives, setObjectives] = useState<Row[]>([]);
  const [rcms, setRcms] = useState<Row[]>([]);
  const [riskObjectiveLinks, setRiskObjectiveLinks] = useState<Row[]>([]);
  const [policyLinks, setPolicyLinks] = useState<Row[]>([]);
  const [policies, setPolicies] = useState<Row[]>([]);
  const [objectiveForm, setObjectiveForm] = useState({ id: "", code: "", name: "", description: "" });
  const [relationshipBusy, setRelationshipBusy] = useState(false);
  const [relationshipError, setRelationshipError] = useState("");
  const [response, setResponse] = useState<ConfigurationResponse | null>(null);
  const [config, setConfig] = useState<Configuration>(emptyConfig);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<"save" | "publish" | "template" | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState(initialTab || "overview");
  const [selectedStep, setSelectedStep] = useState<string | null>(null);
  const [viewVersion, setViewVersion] = useState<number | null>(null);
  const [reload, setReload] = useState(0);
  const [showValidation, setShowValidation] = useState(false);
  const scopeKey = `${org.id}:${processId}`;
  const currentScope = useRef(scopeKey);
  currentScope.current = scopeKey;
  const action = useRef<symbol | null>(null);
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const dirty = response !== null && JSON.stringify(config) !== JSON.stringify(response.config);
  const editable = canManage && !busy && !loading && response !== null;
  const referenceProblems = useMemo(() => config.steps.flatMap(step => {
    const result: Problem[] = [];
    const missing = (text: string) => result.push({ text, stepId: step.id });
    if (step.department_id && !departments.some(row => row.id === step.department_id)) missing(t(`「${step.name}」原部门已失效，请重新指定`, `“${step.name}” has an unavailable department`));
    if (step.assignee_user_id && !members.some(row => row.id === step.assignee_user_id)) missing(t(`「${step.name}」原办理人已失效，请重新指定`, `“${step.name}” has an unavailable assignee`));
    if (step.approver_user_ids.some(id => !members.some(row => row.id === id))) missing(t(`「${step.name}」有失效审批人，请移除或重新指定`, `“${step.name}” has unavailable approvers to remove or replace`));
    if (step.risk_ids.some(id => !risks.some(row => row.id === id))) missing(t(`「${step.name}」有失效风险关联，请移除`, `“${step.name}” has unavailable risk links to remove`));
    if (step.control_ids.some(id => !controls.some(row => row.id === id))) missing(t(`「${step.name}」有失效控制关联，请移除`, `“${step.name}” has unavailable control links to remove`));
    return result;
  }), [config, departments, members, risks, controls, t]);
  const problems = useMemo(() => [...validate(config, t, true), ...referenceProblems], [config, t, referenceProblems]);
  const draftProblems = useMemo(() => [...validate(config, t, false), ...referenceProblems], [config, t, referenceProblems]);
  const activeStep = config.steps.find(step => step.id === selectedStep) || config.steps[0] || null;
  const base = `/api/processes/${encodeURIComponent(processId)}/configuration`;
  const query = `organization_id=${encodeURIComponent(org.id)}`;

  useEffect(() => {
    let alive = true;
    const abort = new AbortController();
    const pathQuery = `organization_id=${encodeURIComponent(org.id)}`;
    setLoading(true); setError(""); setNotice(""); setResponse(null); setConfig(emptyConfig()); setRecord(null); setDepartments([]); setMembers([]); setRisks([]); setControls([]); setObjectives([]); setRcms([]); setRiskObjectiveLinks([]); setPolicyLinks([]); setPolicies([]); setObjectiveForm({ id: "", code: "", name: "", description: "" }); setRelationshipError(""); setSelectedStep(null); setBusy(null); setRelationshipBusy(false); setViewVersion(null); setShowValidation(false); setTab(initialTab || "overview"); action.current = null;
    Promise.all([
      request<ConfigurationResponse>(`/api/processes/${encodeURIComponent(processId)}/configuration?${pathQuery}`, { signal: abort.signal }),
      request<Row>(`/api/processes/${encodeURIComponent(processId)}?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/departments?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/organizations/${encodeURIComponent(org.id)}/members`, { signal: abort.signal }),
      request<Row[]>(`/api/risks?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/controls?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/control-objectives?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/rcms?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/risk-objective-links?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/risk-process-links?${pathQuery}`, { signal: abort.signal }),
      request<Row[]>(`/api/processes/${encodeURIComponent(processId)}/policies?${pathQuery}`, { signal: abort.signal }),
      canManage ? request<Row[]>(`/api/policies?${pathQuery}`, { signal: abort.signal }) : Promise.resolve([] as Row[]),
    ]).then(([data, process, departmentsData, membersData, risksData, controlsData, objectivesData, rcmsData, riskObjectiveData, riskProcessData, policyData, availablePolicies]) => {
      if (!alive || currentScope.current !== scopeKey) return;
      setResponse(data); setConfig(copy(data.config)); setRecord(process); setDepartments(departmentsData.filter(row => row.is_active !== false));
      setMembers(membersData.filter(row => row.user && row.user.is_active !== false).map(row => ({ id: row.user!.id, name: row.user!.full_name, email: row.user!.email })));
      const processRiskIds = new Set(riskProcessData.filter(link => link.process_id === processId).map(link => link.risk_id));
      setRisks(risksData.filter(row => row.process_id === processId || processRiskIds.has(row.id))); setControls(controlsData.filter(row => row.process_id === processId));
      const currentObjectives = objectivesData.filter(row => row.process_id === processId);
      const currentObjectiveIds = new Set(currentObjectives.map(row => row.id));
      setObjectives(currentObjectives); setRcms(rcmsData.filter(row => row.process_id === processId));
      setRiskObjectiveLinks(riskObjectiveData.filter(link => currentObjectiveIds.has(link.objective_id)));
      setPolicyLinks(policyData); setPolicies(availablePolicies);
      setSelectedStep(data.config.steps[0]?.id || null);
    }).catch(err => { if (alive && currentScope.current === scopeKey && err.name !== "AbortError") setError(err instanceof Error ? err.message : t("读取流程配置失败", "Unable to load configuration")); }).finally(() => { if (alive && currentScope.current === scopeKey) setLoading(false); });
    return () => { alive = false; abort.abort(); };
  }, [org.id, processId, reload]); // Locale changes must preserve unsaved work.

  useEffect(() => {
    if (initialTab) setTab(initialTab);
  }, [initialTab]);

  useEffect(() => {
    if (loading || !response || tab !== initialTab) return;
    const selector = focusRiskId
      ? `[data-integrity-risk-id="${focusRiskId}"]`
      : focusObjectiveId ? `[data-integrity-objective-id="${focusObjectiveId}"]` : "";
    if (!selector) return;
    const frame = window.requestAnimationFrame(() => {
      const target = dialogRef.current?.querySelector<HTMLElement>(selector);
      if (!target) return;
      target.scrollIntoView({ block: "center", behavior: "smooth" });
      target.classList.add("pc-integrity-highlight");
      window.setTimeout(() => target.classList.remove("pc-integrity-highlight"), 2400);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [focusObjectiveId, focusRiskId, initialTab, loading, response, tab]);

  const close = useCallback(() => {
    if (busy || relationshipBusy) return;
    if (dirty && !window.confirm(t("有尚未保存的流程配置，确定放弃修改并关闭？", "Discard unsaved changes and close?"))) return;
    onClose();
  }, [busy, relationshipBusy, dirty, onClose, t]);

  const reread = () => {
    if (busy || loading) return;
    if (dirty && !window.confirm(t("重新读取会放弃尚未保存的修改，确定继续？", "Reload and discard unsaved changes?"))) return;
    setReload(previous => previous + 1);
  };

  useEffect(() => {
    const previousFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => { document.body.style.overflow = previousOverflow; previousFocus?.focus(); };
  }, []);
  useEffect(() => {
    const keyboard = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close(); }
      if (event.key !== "Tab" || !dialogRef.current) return;
      const elements = Array.from(dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]')).filter(element => element.getClientRects().length);
      const first = elements[0], last = elements[elements.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", keyboard);
    return () => document.removeEventListener("keydown", keyboard);
  }, [close]);
  useEffect(() => {
    if (!dirty) return;
    const unload = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ""; };
    window.addEventListener("beforeunload", unload);
    return () => window.removeEventListener("beforeunload", unload);
  }, [dirty]);

  const update = (patch: Partial<Configuration>) => { if (editable) { setConfig(previous => ({ ...previous, ...patch })); setNotice(""); } };
  const updateStep = (id: string, patch: Partial<Step>) => { if (editable) { setConfig(previous => ({ ...previous, steps: previous.steps.map(step => step.id === id ? { ...step, ...patch } : step) })); setNotice(""); } };
  const updateField = (id: string, patch: Partial<FormField>) => {
    if (!editable) return;
    setConfig(previous => ({ ...previous, form_fields: previous.form_fields.map(field => field.id === id ? { ...field, ...patch } : field), steps: patch.type ? previous.steps.map(step => ({ ...step, branches: step.branches.map(branch => branch.field_id === id ? { ...branch, operator: operatorsFor(patch.type)[0], value: "" } : branch) })) : previous.steps }));
    setNotice("");
  };
  const saveObjective = async (event: FormEvent) => {
    event.preventDefault();
    if (!canManage || relationshipBusy) return;
    setRelationshipBusy(true); setRelationshipError("");
    const payload = { code: objectiveForm.code.trim(), name: objectiveForm.name.trim(), description: objectiveForm.description.trim(), process_id: processId };
    try {
      if (objectiveForm.id) {
        const saved = await request<Row>(`/api/control-objectives/${encodeURIComponent(objectiveForm.id)}?${query}`, { method: "PATCH", body: JSON.stringify(payload) });
        setObjectives(current => current.map(row => row.id === saved.id ? saved : row));
      } else {
        const saved = await request<Row>(`/api/control-objectives?${query}`, { method: "POST", body: JSON.stringify(payload) });
        setObjectives(current => [...current, saved]);
      }
      setObjectiveForm({ id: "", code: "", name: "", description: "" });
      onChanged("控制目标已保存到业务流程");
    } catch (err) { setRelationshipError(err instanceof Error ? err.message : "保存控制目标失败"); }
    finally { setRelationshipBusy(false); }
  };
  const toggleRiskObjective = async (objective: Row, risk: Row) => {
    if (!canManage || relationshipBusy) return;
    setRelationshipBusy(true); setRelationshipError("");
    const existing = riskObjectiveLinks.find(link => link.objective_id === objective.id && link.risk_id === risk.id);
    try {
      if (existing) {
        await request<null>(`/api/risk-objective-links/${encodeURIComponent(existing.id)}?${query}`, { method: "DELETE" });
        setRiskObjectiveLinks(current => current.filter(link => link.id !== existing.id));
      } else {
        const created = await request<Row>(`/api/risk-objective-links?${query}`, { method: "POST", body: JSON.stringify({ objective_id: objective.id, risk_id: risk.id }) });
        setRiskObjectiveLinks(current => [...current, created]);
      }
      onChanged("风险与控制目标关系已更新");
    } catch (err) { setRelationshipError(err instanceof Error ? err.message : "更新风险与控制目标关系失败"); }
    finally { setRelationshipBusy(false); }
  };
  const toggleRiskControl = async (risk: Row, control: Row) => {
    if (!canManage || relationshipBusy) return;
    setRelationshipBusy(true); setRelationshipError("");
    const existing = rcms.find(link => link.risk_id === risk.id && link.control_id === control.id);
    try {
      if (existing) {
        await request<null>(`/api/rcms/${encodeURIComponent(existing.id)}?${query}`, { method: "DELETE" });
        setRcms(current => current.filter(link => link.id !== existing.id));
      } else {
        const created = await request<Row>(`/api/rcms?${query}`, { method: "POST", body: JSON.stringify({ process_id: processId, risk_id: risk.id, control_id: control.id }) });
        setRcms(current => [...current, created]);
      }
      onChanged("风险与控制关系已更新");
    } catch (err) { setRelationshipError(err instanceof Error ? err.message : "更新风险与控制关系失败"); }
    finally { setRelationshipBusy(false); }
  };
  const togglePolicy = async (policy: Row) => {
    if (!canManage || relationshipBusy) return;
    setRelationshipBusy(true); setRelationshipError("");
    const existing = policyLinks.find(link => link.policy_document_id === policy.id);
    try {
      if (existing) {
        await request<null>(`/api/process-policy-links/${encodeURIComponent(existing.id)}?${query}`, { method: "DELETE" });
        setPolicyLinks(current => current.filter(link => link.id !== existing.id));
      } else {
        const created = await request<Row>(`/api/process-policy-links?${query}`, { method: "POST", body: JSON.stringify({ process_id: processId, policy_document_id: policy.id }) });
        setPolicyLinks(current => [...current, { ...created, policy_document_id: policy.id, file_name: policy.file_name }]);
      }
      onChanged("流程制度依据关联已更新");
    } catch (err) { setRelationshipError(err instanceof Error ? err.message : "更新制度依据关联失败"); }
    finally { setRelationshipBusy(false); }
  };
  const addStep = (type: Step["type"]) => {
    if (!editable) return;
    const step = newStep(type, config.steps.length + 1, record);
    update({ steps: [...config.steps, step] }); setSelectedStep(step.id); setTab("steps");
  };
  const deleteStep = (step: Step) => {
    if (!editable || !window.confirm(t(`删除「${step.name}」？指向此节点的规则将一并移除。`, `Delete “${step.name}”? Its incoming rules will also be removed.`))) return;
    const next = config.steps.filter(item => item.id !== step.id).map(item => ({ ...item, next_step_id: item.next_step_id === step.id ? null : item.next_step_id, branches: item.branches.filter(branch => branch.target_step_id !== step.id) }));
    update({ steps: next }); setSelectedStep(next[0]?.id || null);
  };
  const moveStep = (id: string, direction: number) => {
    if (!editable) return;
    const steps = [...config.steps]; const index = steps.findIndex(step => step.id === id); const target = index + direction;
    if (target < 0 || target >= steps.length) return;
    [steps[index], steps[target]] = [steps[target], steps[index]]; update({ steps });
  };
  const applyTemplate = async () => {
    if (!editable || action.current) return;
    if ((config.steps.length || config.form_fields.length || dirty) && !window.confirm(t("使用参考模板将替换当前草稿内容，确定继续？", "Replace the current draft with the suggested template?"))) return;
    const token = Symbol("template"); action.current = token; const scope = scopeKey;
    setBusy("template"); setError(""); setNotice("");
    try {
      const suggested = await request<{ config: Configuration }>(`${base}/template?${query}`);
      if (currentScope.current !== scope) return;
      setConfig(copy(suggested.config)); setSelectedStep(suggested.config.steps[0]?.id || null); setTab("steps");
      setNotice(t("已根据本流程档案、风险与控制生成参考草稿。请选择真实审批人，并按实际制度核对后保存。", "A suggested draft was generated from this process, its risks and controls. Select actual approvers and review it against your policies before saving."));
    } catch (err) { if (currentScope.current === scope) setError(err instanceof Error ? err.message : t("生成参考草稿失败", "Unable to generate a suggested draft")); }
    finally { if (action.current === token) { action.current = null; if (currentScope.current === scope) setBusy(null); } }
  };

  const run = async (kind: "save" | "publish") => {
    if (!response || !editable || action.current) return;
    const blocking = kind === "publish" ? problems : draftProblems;
    if (blocking.length) { setShowValidation(true); setTab("review"); setError(t("请先修正以下配置问题。", "Resolve the configuration issues below first.")); return; }
    const token = Symbol(kind); action.current = token; setBusy(kind); setError(""); setNotice("");
    const scope = scopeKey; const submitted = normalized(config);
    let saved = response;
    let draftWasSaved = false;
    try {
      if (dirty) {
        saved = await request<ConfigurationResponse>(`${base}?${query}`, { method: "PATCH", body: JSON.stringify({ expected_revision: response.revision, config: submitted }) });
        if (currentScope.current !== scope) return;
        draftWasSaved = true;
        setResponse(saved); setConfig(copy(saved.config));
      }
      if (kind === "publish") {
        if (currentScope.current !== scope) return;
        const published = await request<ConfigurationResponse>(`${base}/publish?${query}`, { method: "POST", body: JSON.stringify({ expected_revision: saved.revision }) });
        if (currentScope.current !== scope) return;
        setResponse(published); setConfig(copy(published.config)); setViewVersion(published.published_revision); setShowValidation(false);
        const message = t(`流程配置已发布 · v${published.published_revision}`, `Process configuration published · v${published.published_revision}`);
        setNotice(message); onChanged(message); setTab("history");
      } else if (currentScope.current === scope) {
        const message = t(`流程草稿已保存 · r${saved.revision}`, `Draft saved · r${saved.revision}`); setNotice(message); onChanged(message);
      }
    } catch (err) {
      if (currentScope.current === scope) {
        setError(err instanceof Error ? err.message : t("保存失败", "Save failed"));
        if (draftWasSaved) { const message = t(`草稿 r${saved.revision} 已保存，发布未完成。`, `Draft r${saved.revision} saved; publication did not complete.`); setNotice(message); onChanged(message); }
      }
    }
    finally { if (action.current === token) { action.current = null; if (currentScope.current === scope) setBusy(null); } }
  };

  const tabs = [{ id: "overview", zh: "流程基本信息", en: "Process details", icon: FileText }, { id: "objectives", zh: "控制目标", en: "Control objectives", icon: BadgeCheck }, { id: "risk-controls", zh: "风险与控制", en: "Risks & controls", icon: ShieldCheck }, { id: "policies", zh: "关联制度/依据", en: "Policies & basis", icon: Layers3 }, { id: "fields", zh: "业务表单", en: "Form fields", icon: ClipboardList }, { id: "steps", zh: "节点与流转", en: "Steps & routing", icon: GitBranch }, { id: "review", zh: "校验与预览", en: "Validate & preview", icon: ShieldCheck }, { id: "history", zh: "发布版本", en: "Published versions", icon: History }];
  const selectedVersion = response?.history.find(item => item.revision === viewVersion);
  const publishedConfig = selectedVersion?.config || response?.published_config;
  const publishedRevision = selectedVersion?.revision ?? response?.published_revision;
  const publishedDate = selectedVersion?.published_at || response?.published_at;
  const date = (value: string | null | undefined) => value ? new Date(value).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" }) : "—";

  return <div className="pc-overlay" onMouseDown={event => { if (event.target === event.currentTarget) close(); }}>
    <div className="pc-dialog" ref={dialogRef} role="dialog" aria-modal="true" aria-labelledby="pc-title">
      <header className="pc-header">
        <div className="pc-header-icon"><GitBranch size={24} /></div>
        <div className="pc-header-copy"><span className="pc-eyebrow">PROCESS DETAIL & CONFIGURATION</span><h2 id="pc-title">{t("业务流程详情", "Process details")} <span data-no-translate>{record?.name || ""}</span></h2><p><span data-no-translate>{org.name}</span>{record?.code && <> · <span data-no-translate>{record.code}</span></>} · {t("流程信息、控制目标、风险控制与流程配置", "Process details, objectives, risk-control links, and workflow configuration")}</p></div>
        <div className="pc-header-status"><span className={`pc-pill ${response?.published_revision ? "success" : "neutral"}`}>{response?.published_revision ? <><BadgeCheck size={13} /> {t("已发布", "Published")} v{response.published_revision}</> : t("尚未发布", "Unpublished")}</span><small>{dirty ? t("有未保存修改", "Unsaved changes") : response ? t(`草稿 r${response.revision}`, `Draft r${response.revision}`) : ""}</small></div>
        <button ref={closeRef} className="pc-icon-btn pc-close" disabled={!!busy || relationshipBusy} aria-label={t("关闭流程配置", "Close configuration")} onClick={close}><X size={21} /></button>
      </header>
      <nav className="pc-tabs" aria-label={t("流程配置选项", "Configuration sections")}>{tabs.map(item => <button key={item.id} className={tab === item.id ? "active" : ""} aria-current={tab === item.id ? "page" : undefined} onClick={() => setTab(item.id)}><item.icon size={16} /> {t(item.zh, item.en)}{item.id === "steps" && <span>{config.steps.length}</span>}</button>)}</nav>
      {!canManage && <div className="pc-readonly"><ShieldCheck size={15} />{t("你具有查看权限，可查看草稿及已发布版本。", "You can view the draft and published versions.")}</div>}
      <div className="pc-scroll">
        {error && <div className="pc-message error" role="alert"><AlertTriangle size={17} /><div>{error}</div>{!loading && <button className="outline-btn" disabled={!!busy} onClick={reread}>{t("重新读取", "Retry")}</button>}<button className="pc-message-close" aria-label={t("关闭提示", "Dismiss")} onClick={() => setError("")}><X size={15} /></button></div>}
        {notice && <div className="pc-message success" role="status"><Check size={17} /><div>{notice}</div></div>}
        {loading ? <div className="pc-loading"><LoaderCircle className="spin" size={29} /><b>{t("正在读取流程与配置…", "Loading process configuration…")}</b></div> : response && <>
          {tab === "overview" && <div className="pc-columns"><section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">01 / PROCESS FOUNDATION</span><h3>{t("明确流程如何开展", "Define how the process works")}</h3><p>{t("填写业务规则与边界，发布时会检查这些内容是否完整。", "Document rules and boundaries; required information is checked before publication.")}</p></div>{canManage && <button className="outline-btn" disabled={!editable} onClick={applyTemplate}>{busy === "template" ? <LoaderCircle size={14} className="spin" /> : <Sparkles size={14} />}{t("生成参考配置", "Generate suggested draft")}</button>}</div>
            <fieldset className="pc-fieldset" disabled={!editable}><label className="pc-field">{t("流程目标", "Purpose")}<em>*</em><textarea rows={2} value={config.purpose} onChange={event => update({ purpose: event.target.value })} placeholder={t("说明流程需要实现的业务与内控目标", "Describe the business and control objectives")} /></label><label className="pc-field">{t("适用范围", "Scope")}<em>*</em><textarea rows={2} value={config.scope} onChange={event => update({ scope: event.target.value })} placeholder={t("适用部门、业务类型、金额范围或其他边界", "Departments, business types, amounts or other boundaries")} /></label><div className="pc-field-grid"><label className="pc-field">{t("触发条件", "Trigger")}<em>*</em><textarea rows={2} value={config.trigger} onChange={event => update({ trigger: event.target.value })} placeholder={t("什么情况下发起流程", "When the process starts")} /></label><label className="pc-field">{t("执行频率", "Frequency")}<select value={config.frequency} onChange={event => update({ frequency: event.target.value })}>{!['', 'continuous', 'daily', 'weekly', 'monthly', 'quarterly', 'annual', 'ad_hoc', 'per_transaction', 'yearly', 'per_event'].includes(config.frequency) && <option value={config.frequency}>{config.frequency}</option>}<option value="">{t("请选择（可选）", "Select (optional)")}</option>{[["per_transaction", "按笔办理", "Per transaction"], ["per_event", "每次发生时", "Per event"], ["continuous", "持续", "Continuous"], ["daily", "每日", "Daily"], ["weekly", "每周", "Weekly"], ["monthly", "每月", "Monthly"], ["quarterly", "每季度", "Quarterly"], ["annual", "每年", "Annually"], ["yearly", "每年", "Yearly"], ["ad_hoc", "按需", "As needed"]].map(([value, zh, en]) => <option key={value} value={value}>{t(zh, en)}</option>)}</select></label></div><div className="pc-field-grid"><label className="pc-field">{t("输入材料", "Inputs")}<em>*</em><textarea rows={3} value={config.input_description} onChange={event => update({ input_description: event.target.value })} placeholder={t("申请单、合同、业务依据等", "Applications, contracts, business basis, etc.")} /></label><label className="pc-field">{t("输出成果", "Outputs")}<em>*</em><textarea rows={3} value={config.output_description} onChange={event => update({ output_description: event.target.value })} placeholder={t("审批结论、执行记录、归档材料等", "Approval decisions, records, archived materials, etc.")} /></label></div><label className="pc-field">{t("异常处理", "Exception handling")}<em>*</em><textarea rows={3} value={config.exception_policy} onChange={event => update({ exception_policy: event.target.value })} placeholder={t("材料缺失、审批驳回或业务异常如何处理", "How to handle missing materials, rejection and business exceptions")} /></label></fieldset>
          </section><aside className="pc-side"><section className="pc-panel pc-profile"><div className="pc-section-head"><h3>{t("流程档案", "Process record")}</h3><Building2 size={18} /></div><dl><dt>{t("所属部门", "Department")}</dt><dd data-no-translate>{departments.find(item => item.id === record?.department_id)?.name || "—"}</dd><dt>{t("流程负责人", "Process owner")}</dt><dd data-no-translate>{members.find(item => item.id === record?.owner_user_id)?.name || "—"}</dd><dt>{t("流程说明", "Description")}</dt><dd className="pc-description" data-no-translate>{record?.description || "—"}</dd></dl></section><section className="pc-tip"><Layers3 size={22} /><h4>{t("从规则到可审阅的流程", "Turn rules into a reviewable process")}</h4><p>{t("先定义表单，再添加办理、审批和条件节点；把当前流程的风险与控制挂到对应节点。", "Define form fields, add tasks, approvals and conditions, then link risks and controls to the relevant steps.")}</p><div className="pc-checklist"><span><Check size={13} />{t("草稿可分次补充", "Build the draft in stages")}</span><span><Check size={13} />{t("发布前检查责任与流转", "Validate responsibilities and routing")}</span><span><Check size={13} />{t("发布版本保留配置快照", "Retain published configuration snapshots")}</span></div></section></aside></div>}
          {tab === "objectives" && <div className="pc-columns"><section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">PROCESS CONTROL OBJECTIVES</span><h3>{t("本流程控制目标", "Control objectives for this process")}</h3><p>{t("控制目标作为流程档案的一部分维护，风险与控制措施分别关联到目标。", "Objectives belong to this process; risks and controls link to the relevant objective.")}</p></div><span className="pc-pill neutral">{objectives.length}</span></div>{canManage && <form className="pc-objective-form" onSubmit={saveObjective}><div className="pc-field-grid"><label className="pc-field">{t("目标编号", "Objective code")}<em>*</em><input value={objectiveForm.code} required maxLength={40} onChange={event => setObjectiveForm(current => ({ ...current, code: event.target.value }))} /></label><label className="pc-field">{t("目标名称", "Objective name")}<em>*</em><input value={objectiveForm.name} required maxLength={180} onChange={event => setObjectiveForm(current => ({ ...current, name: event.target.value }))} /></label></div><label className="pc-field">{t("目标说明", "Objective description")}<em>*</em><textarea rows={2} required value={objectiveForm.description} onChange={event => setObjectiveForm(current => ({ ...current, description: event.target.value }))} /></label><div className="pc-inline-actions"><button className="primary-btn" disabled={relationshipBusy}>{relationshipBusy ? <LoaderCircle className="spin" size={14} /> : <Plus size={14} />}{objectiveForm.id ? t("保存目标", "Save objective") : t("添加到本流程", "Add to process")}</button>{objectiveForm.id && <button type="button" className="outline-btn" onClick={() => setObjectiveForm({ id: "", code: "", name: "", description: "" })}>{t("取消", "Cancel")}</button>}</div></form>}{relationshipError && <div className="pc-message error" role="alert"><AlertTriangle size={15}/>{relationshipError}</div>}{objectives.length ? <div className="pc-objective-list">{objectives.map(objective => <article className="pc-objective-row" data-integrity-objective-id={objective.id} key={objective.id}><div><span className="pc-eyebrow" data-no-translate>{objective.code}</span><b data-no-translate>{objective.name}</b><p data-no-translate>{objective.description || "—"}</p><small>{t("关联控制措施", "Linked controls")}: {controls.filter(control => control.objective_id === objective.id).map(control => control.name).join("、") || t("暂无", "None")}</small><div className="pc-objective-risk-links"><b>{t("关联风险", "Linked risks")}</b>{risks.length ? risks.map(risk => { const linked = riskObjectiveLinks.some(link => link.objective_id === objective.id && link.risk_id === risk.id); return <label className="pc-objective-risk-option" key={risk.id}><input type="checkbox" disabled={!canManage || relationshipBusy} checked={linked} onChange={() => toggleRiskObjective(objective, risk)} /><span data-no-translate title={`完整编号：${risk.code}`}>{compactRiskCode(risk, risks)} · {risk.name}</span></label>; }) : <small>{t("本流程暂无风险记录", "No risks are recorded for this process")}</small>}</div></div>{canManage && <button className="pc-icon-btn" aria-label={t("编辑控制目标", "Edit objective")} onClick={() => setObjectiveForm({ id: objective.id, code: String(objective.code || ""), name: String(objective.name || ""), description: String(objective.description || "") })}><FileText size={15}/></button>}</article>)}</div> : <div className="pc-empty"><BadgeCheck size={30}/><h4>{t("本流程尚未设置控制目标", "No objectives defined for this process")}</h4><p>{t("在此添加目标；风险和控制措施可分别关联到目标，矩阵会汇总完整关系。", "Add an objective here. Link risks and controls to it; the matrix will summarize the full relationship.")}</p></div>}</section><aside className="pc-side"><section className="pc-panel pc-profile"><div className="pc-section-head"><h3>{t("流程档案", "Process record")}</h3><Building2 size={18}/></div><dl><dt>{t("流程编号", "Process code")}</dt><dd data-no-translate>{record?.code || "—"}</dd><dt>{t("所属部门", "Department")}</dt><dd data-no-translate>{departments.find(item => item.id === record?.department_id)?.name || "—"}</dd><dt>{t("流程负责人", "Process owner")}</dt><dd data-no-translate>{members.find(item => item.id === record?.owner_user_id)?.name || "—"}</dd></dl></section><section className="pc-tip"><Layers3 size={21}/><h4>{t("目标驱动控制", "Objectives guide controls")}</h4><p>{t("先将相关风险挂到目标，再将每项控制措施归入对应目标并建立映射。", "Link risks to objectives first, then assign controls to objectives and map them to the risks.")}</p></section></aside></div>}
          {tab === "risk-controls" && <section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">PROCESS RISK & CONTROL LINKS</span><h3>{t("流程风险与控制措施", "Process risks and controls")}</h3><p>{t("请先在控制目标页关联风险，再勾选对应控制措施；RCM 会自动汇总这些关系。", "Link risks to objectives first, then select their controls; RCM is generated from these relationships.")}</p></div><span className="pc-pill neutral">{rcms.length} {t("项关系", "links")}</span></div>{relationshipError && <div className="pc-message error" role="alert"><AlertTriangle size={15}/>{relationshipError}</div>}{!risks.length ? <div className="pc-empty"><ShieldCheck size={30}/><h4>{t("风险与控制数据尚未齐备", "Risks and controls are not ready")}</h4><p>{t("请先在风险库和控制库建立本流程记录，再回到这里配置关系。", "Add this process’s records in the risk and control libraries, then return to link them.")}</p></div> : <div className="pc-risk-control-list">{risks.map(risk => { const score = Number(risk.likelihood || 0) * Number(risk.impact || 0); const linkedCount = controls.filter(control => rcms.some(link => link.risk_id === risk.id && link.control_id === control.id)).length; return <article className="pc-risk-control-row" data-integrity-risk-id={risk.id} key={risk.id}><div className="pc-risk-control-risk"><span className="pc-eyebrow" data-no-translate title={`完整编号：${risk.code}`}>{compactRiskCode(risk, risks)}</span><b data-no-translate>{risk.name}</b><small>{t("已关联", "Linked")}: {linkedCount} {t("项控制", "controls")}</small></div><div className="pc-risk-control-options">{controls.length ? controls.map(control => { const checked = rcms.some(link => link.risk_id === risk.id && link.control_id === control.id); const objective = objectives.find(item => item.id === control.objective_id); const objectiveLinked = riskObjectiveLinks.some(link => link.risk_id === risk.id && link.objective_id === control.objective_id); return <label className="pc-selector pc-control-link" key={control.id}><input type="checkbox" disabled={!canManage || relationshipBusy || !objectiveLinked} checked={checked} onChange={() => toggleRiskControl(risk, control)}/><span><b data-no-translate>{control.code} · {control.name}</b><small data-no-translate>{objective?.name || t("未关联目标", "No objective")}{!objectiveLinked && ` · ${t("先关联该目标", "Link this objective first")}`} · {controlFrequencyLabel(control.frequency)} · {control.is_key_control ? t("关键控制", "Key control") : t("一般控制", "Standard control")}</small></span></label>; }) : <p className="pc-muted">{t("本流程暂无控制措施，请先在控制库新建控制，再回到此处关联。", "No controls are set up for this process. Add a control to the library, then link it here.")}</p>}</div></article>; })}</div>}</section>}
          {tab === "policies" && <div className="pc-columns"><section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">POLICIES & BASIS</span><h3>{t("关联制度与依据", "Linked policies and basis")}</h3><p>{t("从现有制度文件库选择依据，不会复制或新建制度文档。", "Link existing policy documents without copying or creating another document.")}</p></div><span className="pc-pill neutral">{policyLinks.length}</span></div>{relationshipError && <div className="pc-message error" role="alert"><AlertTriangle size={15}/>{relationshipError}</div>}{policies.length ? <div className="pc-policy-list">{policies.map(policy => { const linked = policyLinks.some(item => item.policy_document_id === policy.id); return <label className="pc-selector pc-policy-row" key={policy.id}><input type="checkbox" disabled={!canManage || relationshipBusy} checked={linked} onChange={() => togglePolicy(policy)}/><span><b data-no-translate>{policy.file_name}</b><small>{policy.content_type || t("制度文件", "Policy document")} · {t("文本", "Text")} {policy.extracted_char_count || 0} {t("字", "chars")}</small></span><FileText size={16}/></label>; })}</div> : policyLinks.length ? <div className="pc-policy-list">{policyLinks.map(policy => <div className="pc-selector pc-policy-row" key={policy.id}><span className="pc-policy-check"><Check size={13}/></span><span><b data-no-translate>{policy.file_name}</b><small>{policy.content_type || t("制度文件", "Policy document")}</small></span></div>)}</div> : <div className="pc-empty"><FileText size={30}/><h4>{t("暂无关联制度依据", "No linked policies or basis")}</h4><p>{t(canManage ? "先在制度合规分析中上传制度文件，再返回此处关联到当前流程。" : "管理员可从制度文件库将现有文件关联到此流程。", canManage ? "Upload a document in Policy Compliance Review, then link it to this process." : "An administrator can link existing policy documents to this process.")}</p></div>}{!policies.length && policyLinks.length > 0 && canManage && <p className="pc-muted">{t("制度列表暂不可用，但现有关联仍会保留。", "The policy list is unavailable; existing links remain intact.")}</p>}</section><aside className="pc-side"><section className="pc-tip"><FileText size={21}/><h4>{t("制度与流程共同维护", "Policies connect to processes")}</h4><p>{t("关联仅保存制度文档与流程的关系，制度正文继续由制度合规分析模块统一管理。", "The link references the existing policy file. Its content remains managed in Policy Compliance Review.")}</p></section></aside></div>}
          {tab === "fields" && <section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">02 / BUSINESS FORM</span><h3>{t("配置流程业务表单", "Configure the business form")}</h3><p>{t("表单字段可用于条件分支。字段名称与选项按实际业务填写。", "Use form fields in condition rules. Set names and options for your business.")}</p></div>{canManage && <button className="primary-btn" disabled={!editable} onClick={() => update({ form_fields: [...config.form_fields, { id: uid("field"), label: t(`字段 ${config.form_fields.length + 1}`, `Field ${config.form_fields.length + 1}`), type: "text", required: false, options: [] }] })}><Plus size={15} />{t("添加字段", "Add field")}</button>}</div>
            {!config.form_fields.length ? <div className="pc-empty"><ClipboardList size={32} /><h4>{t("还没有配置表单字段", "No form fields yet")}</h4><p>{t("添加申请事项、金额、日期等字段，供业务记录和条件规则使用。", "Add subjects, amounts, dates and other fields for records and routing rules.")}</p></div> : <div className="pc-fields-list">{config.form_fields.map((field, index) => <div className="pc-form-card" key={field.id}><span className="pc-field-number">{String(index + 1).padStart(2, "0")}</span><div className="pc-form-card-content"><div className="pc-field-grid"><label className="pc-field">{t("字段名称", "Field label")}<input disabled={!editable} value={field.label} onChange={event => updateField(field.id, { label: event.target.value })} /></label><label className="pc-field">{t("字段类型", "Field type")}<select disabled={!editable} value={field.type} onChange={event => updateField(field.id, { type: event.target.value as FieldType, options: event.target.value === "select" ? field.options : [] })}>{Object.entries(fieldLabels).map(([value, labels]) => <option key={value} value={value}>{t(...labels)}</option>)}</select></label></div>{field.type === "select" && <label className="pc-field">{t("可选值（每行一个）", "Options (one per line)")}<textarea disabled={!editable} rows={3} value={field.options.join("\n")} onChange={event => updateField(field.id, { options: event.target.value.split("\n") })} placeholder={t("例如：\n日常采购\n固定资产采购", "For example:\nRoutine purchase\nFixed asset purchase")} /></label>}<label className="pc-checkbox"><input type="checkbox" disabled={!editable} checked={field.required} onChange={event => updateField(field.id, { required: event.target.checked })} />{t("必填字段", "Required field")}</label></div>{canManage && <button className="pc-icon-btn danger" disabled={!editable} title={t("删除字段", "Delete field")} aria-label={t(`删除字段 ${field.label}`, `Delete field ${field.label}`)} onClick={() => { const used = config.steps.some(step => step.branches.some(branch => branch.field_id === field.id)); if (used && !window.confirm(t("该字段用于分支规则。删除字段将同时移除相关规则，确定继续？", "This field is used by branch rules. Delete the field and its rules?"))) return; update({ form_fields: config.form_fields.filter(item => item.id !== field.id), steps: config.steps.map(step => ({ ...step, branches: step.branches.filter(branch => branch.field_id !== field.id) })) }); }}><Trash2 size={16} /></button>}</div>)}</div>}
          </section>}
          {tab === "steps" && <div className="pc-node-workspace"><aside className="pc-node-sidebar"><div className="pc-node-sidebar-head"><div><span className="pc-eyebrow">03 / WORKFLOW STEPS</span><h3>{t("流程节点", "Workflow steps")}</h3></div><span className="pc-pill neutral">{config.steps.length}</span></div><div className="pc-node-list"><div className="pc-terminal"><i />{t("开始", "Start")}</div>{config.steps.map((step, index) => <div className={`pc-node-list-item ${activeStep?.id === step.id ? "active" : ""}`} key={step.id}><button className="pc-node-select" onClick={() => setSelectedStep(step.id)}><span className={`pc-node-type ${step.type}`}>{step.type === "approval" ? <Users size={16} /> : step.type === "condition" ? <GitBranch size={16} /> : <ClipboardList size={16} />}</span><span><small>{String(index + 1).padStart(2, "0")} · {t(...stepLabels[step.type])}</small><b data-no-translate>{step.name || t("未命名节点", "Untitled step")}</b></span>{problems.some(problem => problem.stepId === step.id) ? <span className="pc-node-warning" title={t("待完善", "Needs configuration")}><AlertTriangle size={13} /></span> : <Check size={13} className="pc-node-valid" />}</button>{canManage && <div className="pc-node-order"><button disabled={!editable || index === 0} aria-label={t("上移节点", "Move step up")} onClick={() => moveStep(step.id, -1)}><ArrowUp size={13} /></button><button disabled={!editable || index === config.steps.length - 1} aria-label={t("下移节点", "Move step down")} onClick={() => moveStep(step.id, 1)}><ArrowDown size={13} /></button></div>}</div>)}<div className="pc-terminal"><i />{t("结束", "End")}</div></div>{canManage && <div className="pc-node-add"><p>{t("添加节点", "Add a step")}</p>{(["task", "approval", "condition"] as const).map(type => <button key={type} disabled={!editable} onClick={() => addStep(type)}><Plus size={14} />{t(...stepLabels[type])}</button>)}</div>}<p className="pc-sidebar-note">{t("默认按顺序流转；分支与跳转只能指向后续节点或结束。调整顺序后请检查规则。", "Steps follow their order by default. Routes may target later steps or end. Recheck rules after reordering.")}</p></aside>
            {activeStep ? <section className="pc-panel pc-node-editor"><div className="pc-section-head"><div><span className="pc-eyebrow">STEP {String(config.steps.findIndex(step => step.id === activeStep.id) + 1).padStart(2, "0")}</span><h3 data-no-translate>{activeStep.name || t("节点配置", "Step configuration")}</h3></div>{canManage && <button className="pc-icon-btn danger" disabled={!editable} aria-label={t("删除节点", "Delete step")} onClick={() => deleteStep(activeStep)}><Trash2 size={17} /></button>}</div>
              <fieldset className="pc-fieldset" disabled={!editable}><div className="pc-field-grid"><label className="pc-field">{t("节点名称", "Step name")}<em>*</em><input value={activeStep.name} onChange={event => updateStep(activeStep.id, { name: event.target.value })} /></label><label className="pc-field">{t("节点类型", "Step type")}<select value={activeStep.type} onChange={event => updateStep(activeStep.id, { type: event.target.value as Step["type"], branches: [], approver_user_ids: [], assignee_user_id: event.target.value === "task" ? record?.owner_user_id || null : null })}>{Object.entries(stepLabels).map(([value, labels]) => <option key={value} value={value}>{t(...labels)}</option>)}</select></label></div><label className="pc-field">{t("办理要求", "Instructions")}<textarea rows={3} value={activeStep.description} onChange={event => updateStep(activeStep.id, { description: event.target.value })} placeholder={t("说明本节点要办理的事项、核对要点与完成标准", "Describe work, checks and completion criteria")} /></label><div className="pc-field-grid"><label className="pc-field">{t("责任部门", "Responsible department")}<select value={activeStep.department_id || ""} onChange={event => updateStep(activeStep.id, { department_id: event.target.value || null })}><option value="">{t("选择部门", "Select department")}</option>{activeStep.department_id && !departments.some(item => item.id === activeStep.department_id) && <option value={activeStep.department_id}>{t("原部门已失效，请重新选择", "Previous department unavailable; select again")}</option>}{departments.map(department => <option data-no-translate key={department.id} value={department.id}>{department.name}</option>)}</select></label><label className="pc-field">{t("办理时限（小时）", "Deadline (hours)")}<input type="number" min={1} max={8760} step={1} value={activeStep.deadline_hours} onChange={event => updateStep(activeStep.id, { deadline_hours: Number(event.target.value) })} /></label></div>
                {activeStep.type === "task" && <label className="pc-field">{t("办理人", "Assignee")}<select value={activeStep.assignee_user_id || ""} onChange={event => updateStep(activeStep.id, { assignee_user_id: event.target.value || null })}><option value="">{t("选择办理人（也可仅指定部门）", "Select assignee (or use department)")}</option>{activeStep.assignee_user_id && !members.some(item => item.id === activeStep.assignee_user_id) && <option value={activeStep.assignee_user_id}>{t("原办理人已失效，请重新选择", "Previous assignee unavailable; select again")}</option>}{members.map(member => <option data-no-translate key={member.id} value={member.id}>{member.name} · {member.email}</option>)}</select></label>}
                {activeStep.type === "approval" && <div className="pc-subsection"><h4><Users size={16} />{t("审批设置", "Approval settings")}</h4><label className="pc-field">{t("审批方式", "Approval mode")}<select value={activeStep.approval_mode} onChange={event => updateStep(activeStep.id, { approval_mode: event.target.value as Step["approval_mode"] })}><option value="any">{t("任一审批人同意", "Any approver")}</option><option value="all">{t("全部审批人同意（会签）", "All approvers")}</option><option value="sequential">{t("按顺序逐人审批", "Sequential approval")}</option></select></label><div className="pc-selector-grid">{members.map(member => <label className="pc-selector" key={member.id}><input type="checkbox" checked={activeStep.approver_user_ids.includes(member.id)} onChange={() => updateStep(activeStep.id, { approver_user_ids: toggle(activeStep.approver_user_ids, member.id) })} /><span><b data-no-translate>{member.name}</b><small data-no-translate>{member.email}</small></span></label>)}{!members.length && <p className="pc-muted">{t("当前公司没有可选成员。", "No members available in this organization.")}</p>}</div><MissingSelections ids={activeStep.approver_user_ids} available={members} label={t("审批人", "Approver")} t={t} onRemove={id => updateStep(activeStep.id, { approver_user_ids: activeStep.approver_user_ids.filter(value => value !== id) })} />{activeStep.approval_mode === "sequential" && <div className="pc-approval-order"><p>{t("审批顺序（勾选后可调整）", "Approval order (select, then reorder)")}</p>{activeStep.approver_user_ids.map((id, index) => <div key={id}><span>{index + 1}</span><b data-no-translate>{members.find(member => member.id === id)?.name || id}</b><button type="button" className="pc-icon-btn" disabled={index === 0 || !editable} aria-label={t("提前审批人", "Move approver earlier")} onClick={() => { const order = [...activeStep.approver_user_ids]; [order[index - 1], order[index]] = [order[index], order[index - 1]]; updateStep(activeStep.id, { approver_user_ids: order }); }}><ArrowUp size={12} /></button><button type="button" className="pc-icon-btn" disabled={index === activeStep.approver_user_ids.length - 1 || !editable} aria-label={t("推后审批人", "Move approver later")} onClick={() => { const order = [...activeStep.approver_user_ids]; [order[index + 1], order[index]] = [order[index], order[index + 1]]; updateStep(activeStep.id, { approver_user_ids: order }); }}><ArrowDown size={12} /></button></div>)}</div>}</div>}
                {activeStep.type === "condition" && <div className="pc-subsection"><div className="pc-subsection-head"><h4><GitBranch size={16} />{t("条件分支规则", "Branch rules")}</h4>{canManage && <button type="button" className="pc-small-btn" disabled={!editable || !config.form_fields.length} onClick={() => updateStep(activeStep.id, { branches: [...activeStep.branches, { field_id: config.form_fields[0].id, operator: operatorsFor(config.form_fields[0].type)[0], value: "", target_step_id: config.steps[config.steps.findIndex(step => step.id === activeStep.id) + 1]?.id || "end" }] })}><Plus size={13} />{t("添加规则", "Add rule")}</button>}</div><p className="pc-muted">{t("按规则顺序匹配，命中第一条后进入指定节点；全部不匹配时走默认流转。", "Match rules in order. The first match selects its target; otherwise use the default route.")}</p>{!config.form_fields.length && <button type="button" className="pc-small-btn" onClick={() => setTab("fields")}>{t("先配置表单字段", "Configure form fields first")}<ChevronRight size={13} /></button>}{activeStep.branches.map((branch, index) => { const field = config.form_fields.find(item => item.id === branch.field_id); return <div className="pc-branch-card" key={index}><div className="pc-branch-top"><b>{t(`规则 ${index + 1}`, `Rule ${index + 1}`)}</b>{canManage && <button type="button" className="pc-icon-btn danger" aria-label={t("删除规则", "Delete rule")} onClick={() => updateStep(activeStep.id, { branches: activeStep.branches.filter((_, position) => position !== index) })}><Trash2 size={13} /></button>}</div><div className="pc-branch-inputs"><label className="pc-field">{t("当字段", "When field")}<select value={branch.field_id} onChange={event => { const selected = config.form_fields.find(item => item.id === event.target.value); updateStep(activeStep.id, { branches: activeStep.branches.map((item, position) => position === index ? { ...item, field_id: event.target.value, operator: operatorsFor(selected?.type)[0], value: "" } : item) }); }}><option value="">{t("选择字段", "Select field")}</option>{config.form_fields.map(item => <option key={item.id} value={item.id} data-no-translate>{item.label}</option>)}</select></label><label className="pc-field">{t("满足条件", "Operator")}<select value={branch.operator} onChange={event => updateStep(activeStep.id, { branches: activeStep.branches.map((item, position) => position === index ? { ...item, operator: event.target.value as Operator, value: "" } : item) })}>{operatorsFor(field?.type).map(operator => <option key={operator} value={operator}>{t(...operatorLabels[operator])}</option>)}</select></label>{!["is_true", "is_false"].includes(branch.operator) && <label className="pc-field">{t("比较值", "Value")}{(field?.type === "select" && ["eq", "neq"].includes(branch.operator)) || field?.type === "checkbox" ? <select value={branch.value} onChange={event => updateStep(activeStep.id, { branches: activeStep.branches.map((item, position) => position === index ? { ...item, value: event.target.value } : item) })}><option value="">{t("选择比较值", "Select value")}</option>{(field.type === "checkbox" ? ["true", "false"] : field.options.map(option => option.trim()).filter(Boolean)).map((option, optionIndex) => <option data-no-translate key={`${option}-${optionIndex}`} value={option}>{option}</option>)}</select> : <input type={field?.type === "number" ? "number" : field?.type === "date" ? "date" : "text"} value={branch.value} onChange={event => updateStep(activeStep.id, { branches: activeStep.branches.map((item, position) => position === index ? { ...item, value: event.target.value } : item) })} />}</label>}</div><label className="pc-field">{t("命中后进入", "Route to")}<TargetSelect config={config} step={activeStep} value={branch.target_step_id} t={t} onChange={value => updateStep(activeStep.id, { branches: activeStep.branches.map((item, position) => position === index ? { ...item, target_step_id: value || "end" } : item) })} /></label></div>; })}</div>}
                <div className="pc-subsection"><h4><ArrowRight size={16} />{activeStep.type === "condition" ? t("默认流转（规则未命中）", "Default route (no rule matched)") : t("完成后流转", "Route after completion")}</h4><label className="pc-field">{t("下一节点", "Next step")}<TargetSelect config={config} step={activeStep} value={activeStep.next_step_id} t={t} allowDefault onChange={value => updateStep(activeStep.id, { next_step_id: value || null })} /></label></div>
                <div className="pc-subsection"><h4><FileText size={16} />{t("证据与留痕", "Evidence and records")}</h4><label className="pc-checkbox"><input type="checkbox" checked={activeStep.evidence_required} onChange={event => updateStep(activeStep.id, { evidence_required: event.target.checked })} />{t("本节点要求保留证据", "Evidence required for this step")}</label><label className="pc-field">{t("证据要求", "Evidence requirements")}{activeStep.evidence_required && <em>*</em>}<textarea rows={2} value={activeStep.evidence_description} onChange={event => updateStep(activeStep.id, { evidence_description: event.target.value })} placeholder={t("需要留存的文件、审批记录或核对结果", "Files, approval records or check results to retain")} /></label></div>
                <div className="pc-subsection"><h4><ShieldCheck size={16} />{t("关联风险与控制", "Linked risks and controls")}</h4><p className="pc-muted">{t("仅列出当前业务流程的风险与控制措施。", "Only risks and controls belonging to this process are listed.")}</p><div className="pc-field-grid"><div className="pc-link-picker"><b>{t("风险", "Risks")}</b>{risks.length ? risks.map(risk => <label className="pc-checkbox" key={risk.id}><input type="checkbox" checked={activeStep.risk_ids.includes(risk.id)} onChange={() => updateStep(activeStep.id, { risk_ids: toggle(activeStep.risk_ids, risk.id) })} /><span data-no-translate title={`完整编号：${risk.code}`}>{compactRiskCode(risk, risks)} · {risk.name}</span></label>) : <p className="pc-muted">{t("本流程暂无风险记录", "No risk records for this process")}</p>}<MissingSelections ids={activeStep.risk_ids} available={risks} label={t("风险", "Risk")} t={t} onRemove={id => updateStep(activeStep.id, { risk_ids: activeStep.risk_ids.filter(value => value !== id) })} /></div><div className="pc-link-picker"><b>{t("控制措施", "Controls")}</b>{controls.length ? controls.map(control => <label className="pc-checkbox" key={control.id}><input type="checkbox" checked={activeStep.control_ids.includes(control.id)} onChange={() => updateStep(activeStep.id, { control_ids: toggle(activeStep.control_ids, control.id) })} /><span data-no-translate>{control.code} · {control.name}</span></label>) : <p className="pc-muted">{t("本流程暂无控制记录", "No control records for this process")}</p>}<MissingSelections ids={activeStep.control_ids} available={controls} label={t("控制", "Control")} t={t} onRemove={id => updateStep(activeStep.id, { control_ids: activeStep.control_ids.filter(value => value !== id) })} /></div></div></div>
              </fieldset>
            </section> : <section className="pc-panel pc-empty"><GitBranch size={36} /><h4>{t("让流程拥有完整的办理路径", "Build the workflow path")}</h4><p>{t("从左侧添加任务、审批或条件节点，逐步配置责任人与流转。", "Add tasks, approvals and conditions, then assign responsibilities and routes.")}</p>{canManage && <button className="outline-btn" disabled={!editable} onClick={applyTemplate}><Sparkles size={15} />{t("从基础模板开始", "Start from a template")}</button>}</section>}
          </div>}
          {tab === "review" && <div className="pc-columns"><section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">04 / CONFIGURATION PREVIEW</span><h3>{t("节点与流转预览", "Steps and routing preview")}</h3><p>{t("审阅节点责任、条件与表单，确认符合实际业务后发布版本。", "Review responsibilities, conditions and form fields before publishing.")}</p></div><span className="pc-pill neutral">{config.steps.length} {t("节点", "steps")}</span></div><WorkflowPreview config={config} members={members} departments={departments} t={t} onSelect={id => { setSelectedStep(id); setTab("steps"); }} /><div className="pc-subsection"><h4><ClipboardList size={16} />{t("业务表单预览", "Business form preview")}</h4><FormPreview fields={config.form_fields} t={t} /></div></section><aside className="pc-side"><section className={`pc-panel pc-validation ${problems.length ? "pending" : "complete"}`}><div className="pc-validation-icon">{problems.length ? <AlertTriangle size={26} /> : <BadgeCheck size={26} />}</div><h3>{problems.length ? t(`${problems.length} 项配置待完善`, `${problems.length} items need attention`) : t("配置已通过发布校验", "Ready to publish")}</h3><p>{problems.length ? t("补齐以下内容即可发布。草稿可先保存有效结构。", "Complete these items to publish. A structurally valid draft can be saved first.") : t("当前草稿的必要信息、责任与流转已完整。", "Required information, responsibilities and routing are complete.")}</p>{problems.length > 0 && <ul className={showValidation ? "highlight" : ""}>{problems.map((problem, index) => <li key={index}>{problem.stepId ? <button onClick={() => { setSelectedStep(problem.stepId!); setTab("steps"); }}>{problem.text}<ChevronRight size={13} /></button> : <button onClick={() => setTab(problem.text.includes("字段") || problem.text.includes("选项") || problem.text.includes("Field") || problem.text.includes("field") || problem.text.includes("options") ? "fields" : "overview")}>{problem.text}<ChevronRight size={13} /></button>}</li>)}</ul>}{canManage && <button className="primary-btn full-btn" disabled={!editable || !!problems.length || (!dirty && response.published_revision === response.revision)} onClick={() => run("publish")}><BadgeCheck size={15} />{dirty ? t("保存并发布", "Save and publish") : t("发布当前草稿", "Publish draft")}</button>}</section><section className="pc-tip"><History size={21} /><h4>{t("发布与修改", "Publishing and changes")}</h4><p>{t("发布会保存配置快照。后续修改先作为草稿保存，重新发布后形成新的版本。", "Publication retains a configuration snapshot. Save later changes as a draft and publish a new version when ready.")}</p></section></aside></div>}
          {tab === "history" && <div className="pc-columns"><section className="pc-panel"><div className="pc-section-head"><div><span className="pc-eyebrow">PUBLISHED CONFIGURATION</span><h3>{publishedConfig ? t(`已发布配置 · v${publishedRevision}`, `Published configuration · v${publishedRevision}`) : t("还没有发布版本", "No published version yet")}</h3><p>{publishedConfig ? date(publishedDate) : t("完成配置并通过校验后，发布第一个版本。", "Complete and validate the configuration to publish the first version.")}</p></div>{publishedConfig && <span className="pc-pill success"><BadgeCheck size={13} />{t("配置快照", "Configuration snapshot")}</span>}</div>{publishedConfig ? <><div className="pc-snapshot-summary">{([["purpose", "流程目标", "Purpose"], ["scope", "适用范围", "Scope"], ["trigger", "触发条件", "Trigger"], ["input_description", "输入材料", "Inputs"], ["output_description", "输出成果", "Outputs"], ["exception_policy", "异常处理", "Exceptions"]] as const).map(([key, zh, en]) => <div key={key}><b>{t(zh, en)}</b><p data-no-translate>{publishedConfig[key] || "—"}</p></div>)}</div><WorkflowPreview config={publishedConfig} members={members} departments={departments} t={t} /><div className="pc-subsection"><h4><ClipboardList size={16} />{t("业务表单", "Business form")}</h4><FormPreview fields={publishedConfig.form_fields} t={t} /></div></> : <div className="pc-empty"><History size={36} /><h4>{t("发布后的版本会保留在这里", "Published versions appear here")}</h4><p>{t("可按版本查阅当时的表单与节点配置。", "Review the form and workflow configuration for each version.")}</p><button className="outline-btn" onClick={() => setTab("review")}>{t("前往校验与预览", "Validate and preview")}<ArrowRight size={14} /></button></div>}</section><aside className="pc-side"><section className="pc-panel"><div className="pc-section-head"><h3>{t("版本记录", "Version history")}</h3><History size={18} /></div>{response.history.length ? <div className="pc-history-list">{[...response.history].sort((a, b) => b.revision - a.revision).map(version => <button key={version.revision} className={publishedRevision === version.revision ? "active" : ""} onClick={() => setViewVersion(version.revision)}><span className="pc-history-dot"><Check size={12} /></span><span><b>v{version.revision}{version.revision === response.published_revision && <em>{t("当前版本", "Current")}</em>}</b><small>{date(version.published_at)}</small><small data-no-translate>{members.find(member => member.id === version.published_by)?.name || version.published_by}</small></span><ChevronRight size={14} /></button>)}</div> : <p className="pc-muted">{t("暂无发布记录", "No publication records")}</p>}</section>{response.published_revision !== null && (dirty || response.revision !== response.published_revision) && <div className="pc-tip"><FileText size={21} /><h4>{t("还有未发布的草稿", "Draft changes await publication")}</h4><p>{t("已发布版本保留此前的配置；完善草稿并重新发布即可保存新版。", "The published version retains its earlier configuration. Complete the draft and publish a new version.")}</p><button className="pc-small-btn" onClick={() => setTab("review")}>{t("审阅当前草稿", "Review draft")}<ArrowRight size={13} /></button></div>}</aside></div>}
        </>}
      </div>
      <footer className="pc-footer"><div className="pc-footer-info"><span className={`pc-save-dot ${dirty ? "dirty" : ""}`} /><span>{busy === "publish" ? t("正在保存并发布配置…", "Saving and publishing…") : busy === "save" ? t("正在保存草稿…", "Saving draft…") : busy === "template" ? t("正在生成参考配置…", "Generating a suggested draft…") : dirty ? t("修改尚未保存", "Changes are unsaved") : t("已读取本地系统配置", "Configuration loaded from the local system")}</span>{response && <small>{t(`草稿 r${response.revision}`, `Draft r${response.revision}`)}</small>}</div><div className="pc-footer-actions"><button className="outline-btn" disabled={!!busy || relationshipBusy} onClick={close}>{t("关闭", "Close")}</button>{canManage && <><button className="outline-btn" disabled={!editable || relationshipBusy || !dirty} onClick={() => run("save")}>{busy === "save" ? <LoaderCircle size={15} className="spin" /> : <Save size={15} />}{t("保存草稿", "Save draft")}</button><button className="primary-btn" disabled={!editable || relationshipBusy || (!dirty && response?.published_revision === response?.revision)} onClick={() => { setShowValidation(true); if (problems.length) setTab("review"); else run("publish"); }}>{busy === "publish" ? <LoaderCircle size={15} className="spin" /> : <BadgeCheck size={15} />}{t("发布配置", "Publish configuration")}</button></>}</div></footer>
    </div>
  </div>;
}

function TargetSelect({ config, step, value, onChange, allowDefault, t }: { config: Configuration; step: Step; value: string | null; onChange: (value: string) => void; allowDefault?: boolean; t: Translator }) {
  const index = config.steps.findIndex(item => item.id === step.id);
  const available = config.steps.slice(index + 1);
  const invalid = !!value && value !== "end" && !available.some(item => item.id === value);
  return <select value={value || ""} onChange={event => onChange(event.target.value)}>{allowDefault && <option value="">{t("按节点顺序", "Follow step order")} → {config.steps[index + 1]?.name || t("结束", "End")}</option>}{invalid && <option value={value!}>{t("请重新选择有效的后续节点", "Select a valid later step")}</option>}{available.map(item => <option key={item.id} value={item.id} data-no-translate>{item.name}</option>)}<option value="end">{t("结束流程", "End process")}</option></select>;
}

function MissingSelections({ ids, available, label, onRemove, t }: { ids: string[]; available: { id: string }[]; label: string; onRemove: (id: string) => void; t: Translator }) {
  const missing = ids.filter(id => !available.some(item => item.id === id));
  return <>{missing.map(id => <div className="pc-missing" key={id}><AlertTriangle size={13} /><span>{t(`${label}已失效`, `${label} unavailable`)}<code data-no-translate>{id}</code></span><button type="button" onClick={() => onRemove(id)}>{t("移除", "Remove")}</button></div>)}</>;
}

function WorkflowPreview({ config, members, departments, t, onSelect }: { config: Configuration; members: Member[]; departments: Row[]; t: Translator; onSelect?: (id: string) => void }) {
  const targetName = (id: string) => id === "end" ? t("结束", "End") : config.steps.find(step => step.id === id)?.name || t("无效节点", "Invalid step");
  return <div className="pc-preview"><p className="pc-preview-note">{t("按配置顺序展示节点，实际流转以各节点的分支和默认目标为准。", "Steps are listed in their configured order. Branches and default targets define the actual routes.")}</p><div className="pc-preview-terminal"><i />{t("开始", "Start")}</div>{!config.steps.length && <div className="pc-preview-empty">{t("添加节点后显示完整流程路径", "Add steps to preview the workflow path")}</div>}{config.steps.map((step, index) => <div className={`pc-preview-step ${step.type}`} key={step.id}><div className="pc-preview-step-head"><span className={`pc-node-type ${step.type}`}>{step.type === "approval" ? <Users size={16} /> : step.type === "condition" ? <GitBranch size={16} /> : <ClipboardList size={16} />}</span><div><small>{String(index + 1).padStart(2, "0")} · {t(...stepLabels[step.type])}</small>{onSelect ? <button data-no-translate onClick={() => onSelect(step.id)}>{step.name}<ChevronRight size={14} /></button> : <b data-no-translate>{step.name}</b>}</div><span className="pc-preview-time"><Clock3 size={12} />{step.deadline_hours}h</span></div>{step.description && <p className="pc-preview-description" data-no-translate>{step.description}</p>}<div className="pc-preview-meta">{step.department_id && <span><Building2 size={12} /><span data-no-translate>{departments.find(item => item.id === step.department_id)?.name || t("部门不可用", "Department unavailable")}</span></span>}{step.type === "task" && <span><Users size={12} /><span data-no-translate>{members.find(item => item.id === step.assignee_user_id)?.name || (step.department_id ? t("责任部门办理", "Department assigned") : t("待指定办理人", "Assignee needed"))}</span></span>}{step.type === "approval" && <span><Users size={12} /><span data-no-translate>{step.approver_user_ids.map(id => members.find(member => member.id === id)?.name || t("成员不可用", "Member unavailable")).join(" → ") || t("待指定审批人", "Approvers needed")}</span><small>{step.approval_mode === "any" ? t("任一同意", "Any") : step.approval_mode === "all" ? t("会签", "All") : t("依次审批", "Sequential")}</small></span>}{step.evidence_required && <span><FileText size={12} />{t("要求证据", "Evidence required")}</span>}{(step.risk_ids.length > 0 || step.control_ids.length > 0) && <span><ShieldCheck size={12} />{t(`${step.risk_ids.length} 项风险 · ${step.control_ids.length} 项控制`, `${step.risk_ids.length} risks · ${step.control_ids.length} controls`)}</span>}</div>{step.evidence_description && <div className="pc-preview-evidence"><b>{t("证据", "Evidence")}</b><span data-no-translate>{step.evidence_description}</span></div>}{step.type === "condition" && <div className="pc-preview-branches">{step.branches.map((branch, position) => <div key={position}><GitBranch size={12} /><span data-no-translate>{config.form_fields.find(field => field.id === branch.field_id)?.label || "—"}</span><span>{t(...operatorLabels[branch.operator])}</span>{branch.value && <b data-no-translate>{branch.value}</b>}<ArrowRight size={12} /><span data-no-translate>{targetName(branch.target_step_id)}</span></div>)}</div>}<div className="pc-preview-route"><ArrowRight size={12} />{step.type === "condition" ? t("默认", "Default") : t("完成后", "Then")}<span data-no-translate>{step.next_step_id ? targetName(step.next_step_id) : config.steps[index + 1]?.name || t("结束", "End")}</span></div></div>)}<div className="pc-preview-terminal end"><i />{t("结束", "End")}</div></div>;
}

function FormPreview({ fields, t }: { fields: FormField[]; t: Translator }) {
  return fields.length ? <div className="pc-form-preview">{fields.map(field => <label className={`pc-field ${field.type === "textarea" ? "wide" : ""}`} key={field.id}><span data-no-translate>{field.label}</span>{field.required && <em>*</em>}{field.type === "textarea" ? <textarea rows={2} disabled placeholder={t("多行文本", "Long text")} /> : field.type === "select" ? <select disabled><option>{t("请选择", "Select an option")}</option>{field.options.map((option, index) => <option key={index} data-no-translate>{option}</option>)}</select> : field.type === "checkbox" ? <span className="pc-checkbox"><input disabled type="checkbox" />{t("勾选确认", "Check to confirm")}</span> : <input type={field.type === "date" ? "date" : field.type === "number" ? "number" : "text"} disabled placeholder={t(...fieldLabels[field.type])} />}</label>)}</div> : <p className="pc-muted">{t("暂未配置表单字段", "No form fields configured")}</p>;
}
