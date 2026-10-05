"use client";

import { FormEvent, useEffect, useState } from "react";
import { AlertTriangle, Check, ClipboardCheck, LoaderCircle, Plus, ShieldCheck, Trash2, X } from "lucide-react";
import "./risk-management.css";
import { compactRiskCode } from "./risk-code";

// API paths already include the /api prefix. In local development an empty
// base keeps requests same-origin and lets Next proxy them to port 8000.
const API = process.env.NEXT_PUBLIC_API_URL || "";

type Process = { id: string; code: string; name: string; department_name: string };
type Member = { id: string; name: string; email?: string };
type RecordRow = Record<string, any> & { id: string; risk_id?: string; process_id?: string };
type Control = { id: string; code: string; name: string; description: string; frequency: string; test_procedure?: string; is_active?: boolean; process_name?: string; objective_name?: string; owner_name?: string; is_key_control?: boolean };
type Risk = Record<string, any> & { id: string; code: string; name: string; process_id: string; process_name: string; risk_score: number; risk_level: string; risk_level_label: string; controls: Control[] };
type TemplateRisk = { key: string; name: string; description: string; category: string; likelihood: number; impact: number; control_name: string; control_description: string; verification_methods: string[]; test_procedure: string; evidence_requirements: string[]; sample_guidance: string; frequency: string; owner_role: string };
type TemplateProcess = { code: string; name: string; department: string; description: string; risks: TemplateRisk[] };
type Template = { id: string; industry_key: string; industry: string; version: string; summary: string; process_count: number; risk_count: number; processes: TemplateProcess[]; rating_note: string; assessment_scales: any };
type RiskDraft = { id?: string; originalStatus?: string; code: string; name: string; process_id: string; additional_process_ids: string[]; description: string; category: string; likelihood: string; impact: string; residual_likelihood: string; residual_impact: string; verification_methods: string; evidence_requirements: string; sample_guidance: string; verification_frequency: string; owner_role: string; owner_user_id: string; status: string };
type RiskFilter = "all" | "low" | "medium" | "high" | "critical" | "uncontrolled";

async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  let response: Response;
  try {
    response = await fetch(`${API}${path}`, { ...options, headers, credentials: "include", cache: "no-store" });
  } catch {
    throw new Error(`无法连接本地 API 服务（${API || "前端代理 /api → 8000"}），请确认本地服务正在运行`);
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `请求失败（${response.status}）`);
  return data;
}

const labels: Record<string, string> = { low: "低", medium: "中", high: "高", critical: "重大", per_transaction: "每笔", continuous: "持续", daily: "每日", weekly: "每周", monthly: "每月", quarterly: "每季度", annual: "每年", ad_hoc: "按需", active: "进行中", accepted: "已接受", mitigating: "应对中", closed: "已关闭" };
const levelClass = (level: string) => `risk-level risk-${level}`;
const splitLines = (value: string) => value.split(/\n|,/).map(item => item.trim()).filter(Boolean);
const joinLines = (value: unknown) => Array.isArray(value) ? value.join("\n") : String(value || "");

function emptyDraft(seed: Partial<RiskDraft> = {}): RiskDraft {
  return { code: "", name: "", process_id: "", additional_process_ids: [], description: "", category: "业务运营", likelihood: "3", impact: "3", residual_likelihood: "", residual_impact: "", verification_methods: "", evidence_requirements: "", sample_guidance: "", verification_frequency: "monthly", owner_role: "", owner_user_id: "", status: "active", ...seed };
}

function draftFromRisk(risk: Risk): RiskDraft {
  return emptyDraft({ id: risk.id, originalStatus: risk.status, code: risk.code, name: risk.name, process_id: risk.process_id, additional_process_ids: (risk.process_ids || [risk.process_id]).filter((id: string) => id !== risk.process_id), description: risk.description, category: risk.category || "业务运营", likelihood: String(risk.likelihood || 3), impact: String(risk.impact || 3), residual_likelihood: risk.residual_likelihood ? String(risk.residual_likelihood) : "", residual_impact: risk.residual_impact ? String(risk.residual_impact) : "", verification_methods: joinLines(risk.verification_methods), evidence_requirements: joinLines(risk.evidence_requirements), sample_guidance: risk.sample_guidance || "", verification_frequency: risk.verification_frequency || "monthly", owner_role: risk.owner_role || "", owner_user_id: risk.owner_user_id || "", status: risk.status || "active" });
}

export default function RiskManagementPage({ organizationId, canManage, onNotice, onError }: { organizationId: string; canManage: boolean; onNotice: (s: string) => void; onError: (s: string) => void }) {
  const [data, setData] = useState<any>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [industry, setIndustry] = useState("");
  const [processId, setProcessId] = useState("");
  const [selected, setSelected] = useState<Risk | null>(null);
  const [draft, setDraft] = useState<RiskDraft | null>(null);
  const [tab, setTab] = useState<"register" | "templates">("register");
  const [riskFilter, setRiskFilter] = useState<RiskFilter>("all");
  const [riskSearch, setRiskSearch] = useState("");
  const [busy, setBusy] = useState(true);

  const load = async () => {
    setBusy(true);
    try {
      const [rows, packs, memberRows] = await Promise.all([api(`/api/risk-management?organization_id=${organizationId}`), api(`/api/risk-templates?organization_id=${organizationId}`), api(`/api/organizations/${organizationId}/members`)]);
      setData(rows);
      setTemplates(packs.templates || []);
      setMembers((memberRows || []).filter((row: any) => row.user && row.user.is_active !== false).map((row: any) => ({ id: row.user.id, name: row.user.full_name, email: row.user.email })));
      setIndustry(packs.current_industry_key || packs.templates?.[0]?.industry_key || "");
      setProcessId(current => current && rows.processes?.some((process: Process) => process.id === current) ? current : "");
    } catch (error) {
      onError(error instanceof Error ? error.message : "风险数据加载失败");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => { load(); }, [organizationId]);

  const risks = (data?.risks || []) as Risk[];
  const processes = (data?.processes || []) as Process[];
  const isUncontrolled = (risk: Risk) => !risk.controls?.some(control => control.is_active);
  const riskCounts: Record<RiskFilter, number> = {
    all: risks.length,
    low: risks.filter(risk => risk.risk_level === "low").length,
    medium: risks.filter(risk => risk.risk_level === "medium").length,
    high: risks.filter(risk => risk.risk_level === "high").length,
    critical: risks.filter(risk => risk.risk_level === "critical").length,
    uncontrolled: risks.filter(isUncontrolled).length,
  };
  const filteredRisks = riskFilter === "all"
    ? risks
    : riskFilter === "uncontrolled"
      ? risks.filter(isUncontrolled)
      : risks.filter(risk => risk.risk_level === riskFilter);
  const libraryRisks = filteredRisks.filter(risk => {
    const linkedProcessIds = (risk.process_ids || [risk.process_id]).map((id: string) => String(id));
    const matchesProcess = !processId || linkedProcessIds.includes(processId);
    const searchText = `${risk.code} ${risk.name} ${risk.process_name} ${risk.department_name} ${risk.owner_name || ""}`.toLowerCase();
    return matchesProcess && searchText.includes(riskSearch.toLowerCase());
  });
  const activeProcess = processes.find(process => process.id === processId);
  const template = templates.find(item => item.industry_key === industry) || templates[0];

  const saveDraft = async (value: RiskDraft) => {
    const fields = { code: value.code.trim(), name: value.name.trim(), process_id: value.process_id, description: value.description.trim(), category: value.category.trim(), likelihood: Number(value.likelihood), impact: Number(value.impact), residual_likelihood: value.residual_likelihood ? Number(value.residual_likelihood) : null, residual_impact: value.residual_impact ? Number(value.residual_impact) : null, verification_methods: splitLines(value.verification_methods), evidence_requirements: splitLines(value.evidence_requirements), sample_guidance: value.sample_guidance.trim(), verification_frequency: value.verification_frequency, owner_role: value.owner_role.trim(), owner_user_id: value.owner_user_id || null };
    let saved: { id: string };
    if (value.id) {
      saved = await api(`/api/risks/${value.id}?organization_id=${organizationId}`, { method: "PATCH", body: JSON.stringify(fields) });
      if (value.status !== value.originalStatus) await api(`/api/risks/${value.id}/status?organization_id=${organizationId}`, { method: "PATCH", body: JSON.stringify({ status: value.status }) });
    } else {
      saved = await api(`/api/risks?organization_id=${organizationId}`, { method: "POST", body: JSON.stringify({ ...fields, status: value.status }) });
    }
    const desired = new Set(value.additional_process_ids.filter(id => id && id !== fields.process_id));
    const existing = (await api(`/api/risk-process-links?organization_id=${organizationId}`) as RecordRow[]).filter(link => link.risk_id === saved.id);
    const removals = existing.filter(link => !desired.has(String(link.process_id)));
    const additions = [...desired].filter(id => !existing.some(link => link.process_id === id));
    for (const link of removals) await api(`/api/risk-process-links/${link.id}?organization_id=${organizationId}`, { method: "DELETE" });
    for (const processId of additions) await api(`/api/risk-process-links?organization_id=${organizationId}`, { method: "POST", body: JSON.stringify({ risk_id: saved.id, process_id: processId }) });
    await load();
    onNotice(value.id ? "风险已更新" : "风险已保存到当前流程");
  };

  const deleteRisk = async (risk: Risk) => {
    await api(`/api/risks/${risk.id}?organization_id=${organizationId}`, { method: "DELETE" });
    await load();
    setSelected(null);
    onNotice("风险已删除");
  };

  const openReference = (process: TemplateProcess, risk: TemplateRisk) => {
    const matched = processes.find(item => item.name === process.name || item.code === process.code || item.code.endsWith(`-${process.code}`));
    setDraft(emptyDraft({ process_id: matched?.id || "", name: risk.name, description: risk.description, category: risk.category, likelihood: String(risk.likelihood), impact: String(risk.impact), verification_methods: risk.verification_methods.join("\n"), evidence_requirements: risk.evidence_requirements.join("\n"), sample_guidance: risk.sample_guidance || risk.test_procedure, verification_frequency: risk.frequency, owner_role: risk.owner_role }));
    setTab("register");
    setProcessId(matched?.id || "");
    onNotice("已将行业模板带入填写表单，请补充编号并确认后保存");
  };

  if (busy && !data) return <div className="risk-loading"><LoaderCircle className="spin" size={20} />正在加载流程风险台账</div>;

  return <div className="risk-page">
    <div className="risk-heading"><div><div className="section-kicker">CONTROL RISK REGISTER</div><h1>风险库</h1><p>全局查看企业风险及其所属流程、责任人与控制覆盖；行业模板仅作为参考。</p></div><div className="risk-heading-actions">{canManage && <button className="primary-btn compact" onClick={() => setDraft(emptyDraft({ process_id: processId }))}><Plus size={15} />新增风险</button>}<button className={`risk-tab ${tab === "register" ? "active" : ""}`} onClick={() => setTab("register")}><ClipboardCheck size={15} />风险台账</button><button className={`risk-tab ${tab === "templates" ? "active" : ""}`} onClick={() => setTab("templates")}><ShieldCheck size={15} />行业参考模板</button></div></div>
    {tab === "register" ? <>
      <div className="risk-summary" aria-label="风险等级仪表盘">{([[
        "all", "全部风险", "当前公司风险事项", "summary-total",
      ], [
        "critical", "重大风险", "风险等级 重大", "summary-critical",
      ], [
        "high", "高风险", "风险等级 高", "summary-high",
      ], [
        "medium", "中风险", "风险等级 中", "summary-medium",
      ], [
        "low", "低风险", "风险等级 低", "summary-low",
      ], [
        "uncontrolled", "待补控制", "未建立有效控制", "summary-uncontrolled",
      ]] as [RiskFilter, string, string, string][]).map(([key, label, detail, tone]) => <button type="button" key={key} className={`risk-summary-card ${tone} ${riskFilter === key ? "active" : ""}`} aria-pressed={riskFilter === key} aria-label={`筛选${label}，${riskCounts[key]}项`} onClick={() => setRiskFilter(key)}><b>{riskCounts[key]}</b><span>{label}</span><small>{detail}</small></button>)}</div>
      <section className="card table-card risk-register-card"><div className="table-headline"><div className="table-title-icon"><AlertTriangle size={18}/></div><div><h3>{activeProcess ? `${activeProcess.name} · 风险事件` : "全局风险清单"}</h3><p>{activeProcess ? `当前显示“${activeProcess.name}”关联的风险事件；跨流程风险仍使用同一条风险记录。` : "企业风险集中在此维护；可按所属流程查看关联风险。"}</p></div><div className="table-controls"><select className="risk-process-filter" aria-label="按业务流程筛选风险" value={processId} onChange={event => setProcessId(event.target.value)}><option value="">全部业务流程</option>{processes.map(process => <option key={process.id} value={process.id}>{process.name}</option>)}</select><label className="search-box"><input aria-label="搜索风险库" value={riskSearch} onChange={event => setRiskSearch(event.target.value)} placeholder="搜索编号、风险或流程"/></label><span className="rows-count">{libraryRisks.length} 项</span></div></div><div className="data-table-wrap"><table><thead><tr><th>风险编号</th><th>风险名称</th><th>所属流程</th><th>风险等级</th><th>责任部门 / 责任人</th><th>关联控制措施</th><th>状态</th></tr></thead><tbody>{busy?<tr><td colSpan={7} className="loading-cell"><LoaderCircle className="spin" size={19}/>读取风险记录…</td></tr>:libraryRisks.map(risk=>{const targets=Array.from(new Set((risk.controls||[]).map((control:Control)=>control.id)));return <tr key={risk.id} className="risk-row-clickable" tabIndex={0} aria-label={`查看风险详情：${risk.name}`} onClick={() => setSelected(risk)} onKeyDown={event => { if (event.target === event.currentTarget && (event.key === "Enter" || event.key === " ")) { event.preventDefault(); setSelected(risk); } }}><td><code title={`完整编号：${risk.code}`}>{compactRiskCode(risk, risks)}</code></td><td><button className="risk-register-name" onClick={()=>setSelected(risk)}>{risk.name}</button></td><td>{risk.process_names?.join("、") || risk.process_name}</td><td><strong className={levelClass(risk.risk_level)}>{risk.risk_level_label} · {risk.risk_score}</strong></td><td><span>{risk.department_name}</span><small className="risk-register-owner">{risk.owner_name||"未指定责任人"}</small></td><td><button className="risk-control-count" onClick={()=>setSelected(risk)}>{targets.length} 项</button></td><td><span className={`state-pill ${risk.status}`}>{labels[risk.status]||risk.status}</span></td></tr>;})}{!busy&&!libraryRisks.length&&<tr><td colSpan={7} className="loading-cell">{processId || riskSearch?"没有匹配的风险记录":"当前筛选下没有风险记录"}</td></tr>}</tbody></table></div></section>
    </> : <TemplatePanel template={template} templates={templates} actualProcesses={processes} industry={industry} setIndustry={setIndustry} canManage={canManage} onReference={openReference} />}
    {selected && <RiskDrawer risk={selected} allRisks={risks} canManage={canManage} onEdit={() => { setDraft(draftFromRisk(selected)); setSelected(null); }} onSaved={async () => { await load(); setSelected(null); }} onDelete={() => deleteRisk(selected)} close={() => setSelected(null)} />}
    {draft && <RiskForm draft={draft} processes={processes} members={members} onClose={() => setDraft(null)} onSave={saveDraft} />}
  </div>;
}


function TemplatePanel({ template, templates, actualProcesses, industry, setIndustry, canManage, onReference }: { template?: Template; templates: Template[]; actualProcesses: Process[]; industry: string; setIndustry: (value: string) => void; canManage: boolean; onReference: (process: TemplateProcess, risk: TemplateRisk) => void }) {
  return <div className="template-panel"><div className="template-selector"><div><label>行业参考模板</label><select value={industry} onChange={event => setIndustry(event.target.value)}>{templates.map(item => <option key={item.industry_key} value={item.industry_key}>{item.industry} · {item.risk_count} 项风险点</option>)}</select></div><span className="template-readonly-note">仅供参考，不会自动写入风险台账</span></div>{template && <><div className="template-meta"><div><b>{template.industry}</b><p>{template.summary}</p></div><span>v{template.version} · {template.process_count} 个流程 · {template.risk_count} 项风险点</span></div><div className="template-note"><Check size={14} /><span>{template.rating_note} 选择“带入填写表单”后仍需用户补充和确认，不会自动创建风险。</span></div><div className="template-processes">{template.processes.map(process => { const matched = actualProcesses.find(item => item.name === process.name || item.code === process.code || item.code.endsWith(`-${process.code}`)); return <section className="template-process" key={process.code}><div className="template-process-head"><div><b>{process.name}</b><small>{process.code} · {process.department} · {process.risks.length} 项风险点</small></div><span className={matched ? "process-match" : "process-unmatched"}>{matched ? `可参考：${matched.code}` : "需先选择公司流程"}</span></div><p>{process.description}</p><div className="template-risk-grid">{process.risks.map(risk => <article key={risk.key}><div className="template-risk-top"><b>{risk.name}</b><span className={levelClass(risk.likelihood * risk.impact <= 4 ? "low" : risk.likelihood * risk.impact <= 9 ? "medium" : risk.likelihood * risk.impact <= 16 ? "high" : "critical")}>{labels[risk.likelihood * risk.impact <= 4 ? "low" : risk.likelihood * risk.impact <= 9 ? "medium" : risk.likelihood * risk.impact <= 16 ? "high" : "critical"]} · {risk.likelihood * risk.impact}</span></div><p>{risk.description}</p><small>核查参考：{risk.verification_methods.join("、")}</small>{canManage && <button className="template-reference-btn" onClick={() => onReference(process, risk)}><Plus size={12} />带入填写表单</button>}</article>)}</div></section>; })}</div></>}</div>;
}

function RiskDrawer({ risk, allRisks, canManage, onEdit, onSaved, onDelete, close }: { risk: Risk; allRisks: Risk[]; canManage: boolean; onEdit: () => void; onSaved: () => Promise<void>; onDelete: () => Promise<void>; close: () => void }) {
  const [editing, setEditing] = useState(false);
  const [likelihood, setLikelihood] = useState(String(risk.likelihood));
  const [impact, setImpact] = useState(String(risk.impact));
  const [residualLikelihood, setResidualLikelihood] = useState(risk.residual_likelihood ? String(risk.residual_likelihood) : "");
  const [residualImpact, setResidualImpact] = useState(risk.residual_impact ? String(risk.residual_impact) : "");
  const [saving, setSaving] = useState(false);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState("");
  const save = async () => { setSaving(true); try { await api(`/api/risks/${risk.id}?organization_id=${encodeURIComponent(risk.organization_id)}`, { method: "PATCH", body: JSON.stringify({ likelihood: Number(likelihood), impact: Number(impact), residual_likelihood: residualLikelihood ? Number(residualLikelihood) : null, residual_impact: residualImpact ? Number(residualImpact) : null }) }); await onSaved(); } finally { setSaving(false); } };
  const remove = async () => { setDeleting(true); setDeleteError(""); try { await onDelete(); } catch (reason) { setDeleteError(reason instanceof Error ? reason.message : "删除风险失败，请检查关联记录"); } finally { setDeleting(false); } };
  return <div className="risk-drawer-backdrop" onClick={close}><aside className="risk-drawer" onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={close}><X size={17} /></button><div className="section-kicker">SECOND LEVEL · <span title={`完整编号：${risk.code}`}>{compactRiskCode(risk, allRisks)}</span></div><h2>{risk.name}</h2><p className="drawer-description">{risk.description}</p><div className="drawer-context"><span>所属流程</span><b>{risk.process_name}</b><small>{risk.category} · {risk.department_name}</small></div><div className="drawer-rating"><div><span>固有风险</span>{editing ? <div className="rating-edit"><select value={likelihood} onChange={event => setLikelihood(event.target.value)}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select><b>×</b><select value={impact} onChange={event => setImpact(event.target.value)}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></div> : <><b className={levelClass(risk.risk_level)}>{risk.risk_level_label} · {risk.risk_score}</b><small>可能性 {risk.likelihood} × 影响 {risk.impact}</small></>}</div><div><span>剩余风险</span>{editing ? <div className="rating-edit"><select aria-label="剩余可能性" value={residualLikelihood} onChange={event => setResidualLikelihood(event.target.value)}><option value="">未评估</option>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select><b>×</b><select aria-label="剩余影响" value={residualImpact} onChange={event => setResidualImpact(event.target.value)}><option value="">未评估</option>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></div> : <b className={risk.residual_level ? levelClass(risk.residual_level) : "unassessed"}>{risk.residual_level ? `${risk.residual_level_label} · ${risk.residual_score}` : "未评估"}</b>}</div></div>{canManage && <div className="drawer-edit-actions">{editing ? <><button className="outline-btn" onClick={() => setEditing(false)}>取消</button><button className="primary-btn" disabled={saving || ((residualLikelihood === "") !== (residualImpact === ""))} onClick={save}>{saving ? <LoaderCircle className="spin" size={14} /> : <Check size={14} />}保存评分</button></> : confirmingDelete ? <><span className="delete-confirm-text">删除后可重新从模板带入</span><button className="outline-btn" onClick={() => { setConfirmingDelete(false); setDeleteError(""); }}>取消</button><button className="danger-btn" disabled={deleting} onClick={remove}>{deleting ? <LoaderCircle className="spin" size={13} /> : <Trash2 size={13} />}确认删除</button></> : <><button className="outline-btn" onClick={onEdit}>编辑风险</button><button className="outline-btn" onClick={() => setEditing(true)}>调整评分</button><button className="danger-btn" onClick={() => setConfirmingDelete(true)}><Trash2 size={13} />删除风险</button></>}</div>}{deleteError && <div className="delete-error"><AlertTriangle size={14} />{deleteError}</div>}<InfoBlock title="关联控制目标与控制措施" content={<><div className="drawer-control"><b>关联控制目标</b><p>{(risk.objective_names || []).join("、") || "尚未关联控制目标"}</p></div>{risk.controls?.length ? risk.controls.map(control => <div key={control.id} className="drawer-control"><b>{control.name}</b><p>{control.description}</p><small>{control.process_name} · 所属目标：{control.objective_name || "未关联目标"} · 频率：{labels[control.frequency] || control.frequency}</small></div>) : <span>尚未建立控制关联</span>}</>} /><InfoBlock title="核查手段" content={(risk.verification_methods || []).map((item: string) => <li key={item}>{item}</li>)} /><InfoBlock title="检查程序" content={<p>{risk.sample_guidance || "请根据实际业务总体、期间、抽样方法和通过标准补充。"}</p>} /><InfoBlock title="所需证据" content={(risk.evidence_requirements || []).map((item: string) => <li key={item}>{item}</li>)} /><div className="drawer-owner"><b>责任岗位</b><span>{risk.owner_role || "待指定"} · 核查频率：{labels[risk.verification_frequency] || risk.verification_frequency}</span></div></aside></div>;
}

function RiskForm({ draft, processes, members, embedded = false, onClose, onSave }: { draft: RiskDraft; processes: Process[]; members: Member[]; embedded?: boolean; onClose: () => void; onSave: (draft: RiskDraft) => Promise<void> }) {
  const [form, setForm] = useState(draft);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const update = (key: keyof RiskDraft, value: string) => setForm(current => ({ ...current, [key]: value }));
  const changePrimaryProcess = (nextId: string) => setForm(current => {
    const linked = new Set(current.additional_process_ids);
    if (current.process_id) linked.add(current.process_id);
    linked.delete(nextId);
    return { ...current, process_id: nextId, additional_process_ids: [...linked] };
  });
  const toggleAdditionalProcess = (id: string) => setForm(current => ({ ...current, additional_process_ids: current.additional_process_ids.includes(id) ? current.additional_process_ids.filter(value => value !== id) : [...current.additional_process_ids, id] }));
  const submit = async (event: FormEvent) => { event.preventDefault(); setSaving(true); setError(""); try { await onSave(form); onClose(); } catch (reason) { setError(reason instanceof Error ? reason.message : "保存风险失败"); } finally { setSaving(false); } };
  const panel = <aside className={`risk-drawer risk-form-panel ${embedded ? "risk-form-embedded" : ""}`} onClick={event => event.stopPropagation()}><button className="drawer-close" onClick={onClose}><X size={17} /></button><div className="section-kicker">USER ENTERED RISK</div><h2>{form.id ? "编辑风险" : "填写风险"}</h2><p className="drawer-description">风险必须由公司结合实际业务自行确认。行业模板带入的内容只是参考，保存前请补充、修改并确认。</p><form onSubmit={submit}><div className="risk-form-grid"><label className="field-label">风险编号<span className="required">*</span><input value={form.code} onChange={event => update("code", event.target.value)} required maxLength={40} placeholder="例如 R-001" /></label><label className="field-label">风险点名称<span className="required">*</span><input value={form.name} onChange={event => update("name", event.target.value)} required maxLength={180} placeholder="填写具体风险点" /></label></div><label className="field-label">主业务流程<span className="required">*</span><select value={form.process_id} onChange={event => changePrimaryProcess(event.target.value)} required><option value="">请选择主业务流程</option>{processes.map(process => <option key={process.id} value={process.id}>{process.name} · {process.code}</option>)}</select></label><div className="field-label risk-process-links"><b>关联其他业务流程</b><span className="field-hint">可将同一风险关联到多个流程；已关联控制目标或控制措施的流程需先在流程详情中解除关系才能移除。</span><div className="risk-process-link-options">{processes.filter(process => process.id !== form.process_id).map(process => <label className="risk-process-option" key={process.id}><input type="checkbox" disabled={!form.process_id} checked={form.additional_process_ids.includes(process.id)} onChange={() => toggleAdditionalProcess(process.id)} /><span>{process.name}</span><small>{process.code}</small></label>)}</div></div><label className="field-label">风险描述<span className="required">*</span><textarea value={form.description} onChange={event => update("description", event.target.value)} rows={3} required placeholder="说明风险如何发生、影响什么结果" /></label><div className="risk-form-grid"><label className="field-label">风险类别<input value={form.category} onChange={event => update("category", event.target.value)} maxLength={80} /></label><label className="field-label">责任人<select value={form.owner_user_id} onChange={event => update("owner_user_id", event.target.value)}><option value="">未指定</option>{members.map(member => <option key={member.id} value={member.id}>{member.name}{member.email ? ` · ${member.email}` : ""}</option>)}</select></label><label className="field-label">责任岗位<input value={form.owner_role} onChange={event => update("owner_role", event.target.value)} maxLength={160} placeholder="例如 门店店长、财务复核岗" /></label></div><div className="risk-form-grid"><label className="field-label">固有可能性<select value={form.likelihood} onChange={event => update("likelihood", event.target.value)}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label><label className="field-label">固有影响程度<select value={form.impact} onChange={event => update("impact", event.target.value)}>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label></div><div className="risk-form-grid"><label className="field-label">剩余可能性<select value={form.residual_likelihood} onChange={event => update("residual_likelihood", event.target.value)}><option value="">未评估</option>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label><label className="field-label">剩余影响程度<select value={form.residual_impact} onChange={event => update("residual_impact", event.target.value)}><option value="">未评估</option>{[1, 2, 3, 4, 5].map(value => <option key={value}>{value}</option>)}</select></label></div><label className="field-label">核查手段<span className="field-hint">每行一项，例如：资料核验、抽样穿行、异常追踪</span><textarea value={form.verification_methods} onChange={event => update("verification_methods", event.target.value)} rows={3} placeholder="填写实际核查方式" /></label><label className="field-label">所需证据<span className="field-hint">每行一项，填写核查时必须留存的证据</span><textarea value={form.evidence_requirements} onChange={event => update("evidence_requirements", event.target.value)} rows={3} placeholder="填写证据清单" /></label><label className="field-label">检查程序与抽样要求<textarea value={form.sample_guidance} onChange={event => update("sample_guidance", event.target.value)} rows={3} placeholder="填写总体、期间、抽样方法和通过标准" /></label><div className="risk-form-grid"><label className="field-label">核查频率<select value={form.verification_frequency} onChange={event => update("verification_frequency", event.target.value)}>{[["per_transaction", "每笔"], ["continuous", "持续"], ["daily", "每日"], ["weekly", "每周"], ["monthly", "每月"], ["quarterly", "每季度"], ["annual", "每年"], ["ad_hoc", "按需"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label><label className="field-label">风险状态<select value={form.status} onChange={event => update("status", event.target.value)}>{[["active", "进行中"], ["accepted", "已接受"], ["mitigating", "应对中"], ["closed", "已关闭"]].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label></div>{error && <div className="form-error"><AlertTriangle size={15} />{error}</div>}<div className="modal-actions"><button className="outline-btn" type="button" onClick={onClose}>取消</button><button className="primary-btn" disabled={saving}>{saving ? <><LoaderCircle className="spin" size={15} />保存中</> : <>保存风险 <Check size={15} /></>}</button></div></form></aside>;
  return embedded ? <div className="risk-form-embedded-wrap">{panel}</div> : <div className="risk-drawer-backdrop" onClick={onClose}>{panel}</div>;
}

function InfoBlock({ title, content }: { title: string; content: any }) { return <section className="drawer-block"><h3>{title}</h3>{Array.isArray(content) ? <ul>{content}</ul> : content}</section>; }
