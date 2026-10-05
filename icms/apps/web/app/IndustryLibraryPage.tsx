"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, BadgeCheck, BookOpen, Building2, ClipboardCheck, Download, Files, LoaderCircle, ShieldCheck } from "lucide-react";

type Organization = { id: string; name: string; code: string; industry?: string };
type Source = { title: string; url: string; note: string };
type PracticeCase = { title: string; kind: string; process_code: string; process_name: string; scenario: string; sample_plan: string; test_program: string; exception_criteria: string; finding_example: string; root_cause: string; actions: string[]; owner: string; evidence: string; retest: string; closure_criteria: string };
type TemplateProcess = { department: string; name: string; description: string; risk: string; objective: string; control_design: string; test: string; population: string; sample_guidance: string; evidence: string; scenario: string; implementation_case: PracticeCase };
type Policy = { title: string; owner: string; purpose: string; clauses: string[]; evidence: string[]; exceptions: string };
type WorkPhase = { period: string; owner: string; deliverables: string[]; acceptance: string };
type Case = { title: string; jurisdiction: string; facts: string; lesson: string; url: string };
type Simulation = { title: string; scenario: string; finding: string; response: string; retest: string };
type RaciRow = { activity: string; board: string; executive: string; coordinator: string; process_owner: string; operator: string; independent: string };
type Handbook = {
  sector_policy: Policy; focus: string; public_cases: Case[]; sources: Source[];
  implementation_cases: PracticeCase[];
  simulation: Simulation; organization_models: { size: string; framework: string; design: string }[];
  raci: RaciRow[]; work_plan: WorkPhase[]; shared_policies: Policy[]; practice_note: string;
};
type IndustryTemplate = {
  id: string; version: string; industry_key: string; industry: string; industry_description: string;
  maturity: string; maturity_label: string; summary: string; practice_benchmark: string;
  sample_guidance: string; next_steps: string; organization_shape: string[]; reference_organization_shape?: string[]; processes: TemplateProcess[]; reference_processes?: TemplateProcess[];
  workflow_example: string; sources: Source[]; disclaimer: string; handbook: Handbook;
};
type IndustryTemplateSummary = Pick<IndustryTemplate, "id" | "version" | "industry_key" | "industry" | "industry_description" | "maturity" | "maturity_label" | "summary"> & { process_count: number };

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: "include", cache: options.cache ?? "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `请求失败 (${response.status})`);
  return data;
}

async function loadIndustryCatalog(): Promise<IndustryTemplateSummary[]> {
  try {
    return await api("/api/industry-template-catalog", { cache: "default" });
  } catch {
    // Older API deployments only expose the original full-template endpoint.
    const templates: IndustryTemplate[] = await api("/api/industry-templates", { cache: "default" });
    return templates.map(template => ({
      id: template.id, version: template.version, industry_key: template.industry_key, industry: template.industry,
      industry_description: template.industry_description, maturity: template.maturity,
      maturity_label: template.maturity_label, summary: template.summary,
      process_count: (template.reference_processes || template.processes).length,
    }));
  }
}

async function loadIndustryTemplate(templateId: string): Promise<IndustryTemplate> {
  try {
    return await api(`/api/industry-templates/${encodeURIComponent(templateId)}`, { cache: "default" });
  } catch {
    // Keep the page usable while the API server is being upgraded separately.
    const templates: IndustryTemplate[] = await api("/api/industry-templates", { cache: "default" });
    const template = templates.find(item => item.id === templateId);
    if (!template) throw new Error("行业参考模板不存在");
    return template;
  }
}

const tabs = [
  ["organization", "组织框架与职责"], ["policies", "具体制度与控制"],
  ["plan", "工作方案与论证"], ["cases", "实施案例"], ["processes", "流程、样本与证据"],
] as const;
const roleNames: Record<string, string> = { board: "治理层", executive: "管理层", coordinator: "内控协调人", process_owner: "流程负责人", operator: "控制执行人", independent: "独立复核/内审" };

export default function IndustryLibraryPage({ org, canApply, onApplied }: { org: Organization; canApply: boolean; onApplied: (message: string) => void }) {
  const [templates, setTemplates] = useState<IndustryTemplateSummary[]>([]);
  const [details, setDetails] = useState<Record<string, IndustryTemplate>>({});
  const [applications, setApplications] = useState<Record<string, unknown>[]>([]);
  const [applicationsLoaded, setApplicationsLoaded] = useState(false);
  const [industryKey, setIndustryKey] = useState("");
  const [maturity, setMaturity] = useState("starter");
  const [tab, setTab] = useState<(typeof tabs)[number][0]>("organization");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    loadIndustryCatalog().then((catalog: IndustryTemplateSummary[]) => {
      if (!active) return;
      setTemplates(catalog);
      setIndustryKey(catalog[0]?.industry_key || "");
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "行业目录加载失败"); });
    api(`/api/organizations/${org.id}/industry-template-applications`).then((applied: Record<string, unknown>[]) => {
      if (!active) return;
      setApplications(applied);
      setApplicationsLoaded(true);
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "公司样例应用记录加载失败"); });
    return () => { active = false; };
  }, [org.id]);

  const industries = useMemo(() => Array.from(new Map(templates.map(item => [item.industry_key, item])).values()), [templates]);
  const selectedTemplate = templates.find(item => item.industry_key === industryKey && item.maturity === maturity);
  const selectedTemplateId = selectedTemplate?.id;
  const current = selectedTemplateId ? details[selectedTemplateId] : undefined;
  const referenceProcesses = current?.reference_processes || current?.processes || [];
  const referenceOrganizationShape = current?.reference_organization_shape || current?.organization_shape || [];
  useEffect(() => {
    if (!selectedTemplateId || details[selectedTemplateId]) return;
    let active = true;
    setError("");
    loadIndustryTemplate(selectedTemplateId).then((detail: IndustryTemplate) => {
      if (active) setDetails(previous => ({ ...previous, [detail.id]: detail }));
    }).catch(err => { if (active) setError(err instanceof Error ? err.message : "行业手册加载失败"); });
    return () => { active = false; };
  }, [selectedTemplateId, details]);
  const applied = applications.some(item => item.template_id === selectedTemplate?.id);
  const apply = async () => {
    if (!current || !applicationsLoaded) return;
    setBusy(true); setError("");
    try {
      const result = await api(`/api/organizations/${org.id}/industry-templates/${current.id}/apply`, { method: "POST" });
      setApplications(previous => [{ template_id: current.id, industry: current.industry, maturity: current.maturity_label, counts: result.counts }, ...previous]);
      onApplied(`已把 ${current.industry} · ${current.maturity_label} 的 ${current.processes.length} 条阶段流程写入 PostgreSQL，检查仍处于待执行状态`);
    } catch (err) { setError(err instanceof Error ? err.message : "应用失败"); }
    finally { setBusy(false); }
  };
  const exportHandbook = () => {
    if (!current) return;
    const h = current.handbook;
    const lines = [
      `# ${current.industry}｜${current.maturity_label} 内控实施手册`, "", `版本：${current.version}`, "",
      `> ${current.disclaimer}`, "", "## 组织框架", ...h.organization_models.flatMap(model => [`### ${model.size}`, model.framework, `设计要点：${model.design}`, ""]),
      "## RACI 职责矩阵", `|事项|${Object.values(roleNames).join("|")}|`, `|${Array(Object.keys(roleNames).length + 1).fill("---").join("|")}|`,
      ...h.raci.map(row => `|${row.activity}|${row.board}|${row.executive}|${row.coordinator}|${row.process_owner}|${row.operator}|${row.independent}|`), "",
      "## 制度包", ...[...h.shared_policies, h.sector_policy].flatMap(policy => [`### ${policy.title}`, `责任人：${policy.owner}`, `目的：${policy.purpose}`, ...policy.clauses.map((clause, i) => `${i + 1}. ${clause}`), `留痕：${policy.evidence.join("；")}`, `例外：${policy.exceptions}`, ""]),
      "## 12 周工作方案", ...h.work_plan.flatMap(phase => [`### ${phase.period}`, `牵头：${phase.owner}`, ...phase.deliverables.map(item => `- ${item}`), `验收：${phase.acceptance}`, ""]),
      "## 公开案例", ...(h.public_cases.length ? h.public_cases.flatMap(item => [`### ${item.title}`, `司法辖区：${item.jurisdiction}`, item.facts, `内控启示：${item.lesson}`, `来源：${item.url}`, ""]) : ["本行业条目当前没有收录可核实的公开执法案例；请看下方明确标注的模拟实施案例。", ""]),
      "## 模拟实施案例（非真实公司事件）", `### ${h.simulation.title}`, `情境：${h.simulation.scenario}`, `发现：${h.simulation.finding}`, `处置：${h.simulation.response}`, `重测：${h.simulation.retest}`, "",
      "## 按流程拆解的模拟实施案例（均非真实公司事件）", ...h.implementation_cases.flatMap(item => [
        `### ${item.process_code} · ${item.title}`, `情境：${item.scenario}`, `抽样方案：${item.sample_plan}`, `测试程序：${item.test_program}`,
        `异常判定：${item.exception_criteria}`, `示例发现：${item.finding_example}`, `根因验证：${item.root_cause}`,
        "整改动作：", ...item.actions.map(action => `- ${action}`), `整改责任：${item.owner}`, `建议证据：${item.evidence}`,
        `独立复测：${item.retest}`, `关闭标准：${item.closure_criteria}`, "",
      ]),
      "## 行业重点", h.focus, "", "## 流程、风险、控制与检查", ...referenceProcesses.flatMap((process, i) => [`### ${i + 1}. ${process.name}（${process.department}）`, process.description, `风险：${process.risk}`, `目标：${process.objective}`, `控制：${process.control_design}`, `检查总体：${process.population}`, `抽样建议：${process.implementation_case.sample_plan}`, `测试程序：${process.implementation_case.test_program}`, `证据：${process.evidence}`, ""]),
      "## 参考来源", ...current.sources.map(source => `- [${source.title}](${source.url}) — ${source.note}`), "", `说明：${h.practice_note}`,
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob); const anchor = document.createElement("a");
    anchor.href = url; anchor.download = `${current.industry_key}-${current.maturity}-内控手册.md`; anchor.click(); URL.revokeObjectURL(url);
  };

  return <div className="module-page industry-library-page">
    <div className="module-header"><div><div className="section-kicker">INDUSTRY CONTROL PLAYBOOKS · RESEARCH EDITION</div><h1>行业内控参考库</h1><p>公开监管资料、可编辑制度范本、组织职责、12 周工作方案、实施演练和检查证据链。适用边界与来源随条目展示。</p></div>
      {current && <button className="outline-btn handbook-export" onClick={exportHandbook}><Download size={15}/>导出完整手册</button>}
    </div>
    <div className="industry-library-grid">
      <aside className="card industry-picker"><div className="section-kicker">行业目录</div><p>{industries.length} 个行业 · {templates.length} 套阶段参考 · 展示各行业完整流程</p>
        {industries.map(item => <button key={item.industry_key} className={`industry-choice ${industryKey === item.industry_key ? "selected" : ""}`} onClick={() => { setIndustryKey(item.industry_key); setTab("organization"); }}>
          <span className="industry-choice-icon"><Building2 size={16}/></span><span><b>{item.industry}</b><small>{item.process_count} 条端到端流程 · {templates.filter(stage => stage.industry_key === item.industry_key).length} 套阶段模板</small></span><ArrowUpRight size={14}/>
        </button>)}
      </aside>
      <section className="industry-detail">
        {!current ? <div className="card loading-cell">{error ? <><span role="alert">{error}</span><button className="outline-btn" onClick={() => { setError(""); if (selectedTemplateId) setDetails(previous => { const next = { ...previous }; delete next[selectedTemplateId]; return next; }); }}>重新加载</button></> : <><LoaderCircle className="spin" size={18}/>{selectedTemplate ? "正在载入当前行业手册…" : "正在载入行业目录…"}</>}</div> : <>
          <section className="card industry-hero"><div className="industry-hero-top"><div><div className="section-kicker">{current.industry.toUpperCase()}</div><h2>{current.industry}</h2><p>{current.industry_description}</p></div><div className="hero-actions"><span className="industry-count">{referenceProcesses.length} 条行业流程</span><span className="industry-count">{current.handbook.implementation_cases.length} 个详细案例</span><span className="industry-count">手册 v{current.version}</span></div></div>
            <div className="maturity-options">{templates.filter(item => item.industry_key === industryKey).map(item => <button key={item.maturity} className={`maturity-option ${maturity === item.maturity ? "active" : ""}`} onClick={() => setMaturity(item.maturity)}><span>{item.maturity_label}</span><small>{item.summary}</small></button>)}</div>
            <div className="maturity-benchmark"><div><b>阶段定位</b><p>{current.practice_benchmark}</p></div><div><b>样本计划提示</b><p>{current.sample_guidance}</p></div><div><b>下一步完善</b><p>{current.next_steps}</p></div></div>
          </section>
          <nav className="handbook-tabs" aria-label="行业手册章节">{tabs.map(([key, label]) => <button key={key} className={tab === key ? "active" : ""} onClick={() => setTab(key)}>{label}</button>)}</nav>

          {tab === "organization" && <>
            <section className="card handbook-intro"><div className="playbook-section-head"><div><div className="section-kicker">GOVERNANCE & ACCOUNTABILITY</div><h3>内控组织框架：按规模配置，不把监督交给执行人</h3></div><Building2 size={19}/></div><p>内控不是单独一个部门替公司“背责”：管理层提供方向与资源，业务流程负责人拥有控制，内控协调岗位统一方法和推动整改，独立复核/内审提供客观评价。</p></section>
            <div className="org-model-grid">{current.handbook.organization_models.map(model => <article className="card org-model" key={model.size}><span>{model.size}</span><p>{model.framework}</p><small>{model.design}</small></article>)}</div>
            <section className="card org-shape-card"><div className="playbook-section-head"><div><div className="section-kicker">INDUSTRY OPERATING UNITS</div><h3>行业业务组织建议</h3></div><span>岗位可合并，职责制衡要保留</span></div><div className="org-shape-tree"><div className="org-shape-root"><ShieldCheck size={16}/>董事会/公司负责人 · 管理层</div><div className="org-shape-branches">{referenceOrganizationShape.map((name, index) => <div className="org-shape-node" key={name}><i/><span>{name}</span><small>{referenceProcesses.filter(process => process.department === name).length} 条参考流程</small></div>)}</div></div></section>
            <section className="card raci-card"><div className="playbook-section-head"><div><div className="section-kicker">RACI</div><h3>职责分工与不相容岗位</h3></div><span>R 执行 · A 最终负责 · C 协商 · I 知会</span></div><div className="raci-wrap"><table><thead><tr><th>活动</th>{Object.values(roleNames).map(name => <th key={name}>{name}</th>)}</tr></thead><tbody>{current.handbook.raci.map(row => <tr key={row.activity}><td>{row.activity}</td>{[row.board, row.executive, row.coordinator, row.process_owner, row.operator, row.independent].map((value, index) => <td key={index}><span className={`raci-mark mark-${value.toLowerCase()}`}>{value}</span></td>)}</tr>)}</tbody></table></div></section>
          </>}

          {tab === "policies" && <>
            <section className="card sector-focus"><div className="section-kicker">INDUSTRY CONTROL PRIORITIES</div><h3>本行业优先控制主线</h3><p>{current.handbook.focus}</p></section>
            <div className="policy-grid">{[...current.handbook.shared_policies, current.handbook.sector_policy].map((policy, index) => <article className={`card policy-card ${index === current.handbook.shared_policies.length ? "sector-policy" : ""}`} key={policy.title}>
              <div className="policy-head"><span>{index === current.handbook.shared_policies.length ? "行业制度" : `核心制度 ${index + 1}`}</span><Files size={17}/></div><h3>{policy.title}</h3><p className="policy-owner"><b>责任归属</b>{policy.owner}</p><p className="policy-purpose">{policy.purpose}</p><ol>{policy.clauses.map((clause, i) => <li key={i}>{clause}</li>)}</ol>
              <div className="policy-evidence"><b>必备留痕样例</b><div>{policy.evidence.map(item => <span key={item}>{item}</span>)}</div></div><div className="policy-exception"><b>异常升级 / 适用边界</b><p>{policy.exceptions}</p></div>
            </article>)}</div>
            <div className="handbook-note"><ShieldCheck size={16}/><span>以上条款是可复制、可编辑的制度草案。落地前应补入公司名称、审批阈值、保存期限、岗位名称和所在地适用要求，并经有权管理者批准。</span></div>
          </>}

          {tab === "plan" && <>
            <section className="card sector-focus"><div className="section-kicker">IMPLEMENTATION ARGUMENT</div><h3>工作方案及实施论证</h3><p>先从高风险且有真实业务总体的流程试点，再扩展覆盖。这个顺序能先验证数据是否可用、岗位是否可执行、证据能否重演，避免只发布制度却没有运行记录。</p><p><b>本行业切入点：</b>{current.handbook.focus}</p></section>
            <div className="work-plan-list">{current.handbook.work_plan.map((phase, index) => <article className="card work-phase" key={phase.period}><div className="phase-number">0{index + 1}</div><div className="phase-content"><div className="phase-top"><div><span>{phase.period}</span><small>牵头：{phase.owner}</small></div><ClipboardCheck size={18}/></div><ul>{phase.deliverables.map(item => <li key={item}>{item}</li>)}</ul><div className="acceptance"><b>验收标准</b><p>{phase.acceptance}</p></div></div></article>)}</div>
            <section className="card target-card"><div><div className="section-kicker">MEASURES TO TAILOR</div><h3>管理层可设定的项目目标</h3></div><div className="target-grid"><span><b>覆盖</b>全部高优先级流程指定负责人及风险所有者</span><span><b>执行</b>试点控制按规定频率运行并保存同期证据</span><span><b>闭环</b>每个高风险发现都有根因、临时控制、期限和升级对象</span><span><b>验证</b>整改关闭前完成独立复核和重测，未通过不关闭</span></div><small>{current.handbook.practice_note}</small></section>
          </>}

          {tab === "cases" && <>
            <section className="card handbook-intro"><div className="section-kicker">PRACTICE CASES</div><h3>真实公开案例与模拟实施案例分开阅读</h3><p>公开案例只陈述监管机构或法院页面中可核对的事实；执法指控会明确标记为指控。模拟案例是为演练本系统闭环而编写的情境，不是真实公司事件。</p></section>
            {current.handbook.public_cases.length ? current.handbook.public_cases.map(item => <article className="card public-case-card" key={item.title}><div className="case-badge">公开案例 · {item.jurisdiction}</div><h3>{item.title}</h3><p>{item.facts}</p><div className="case-lesson"><b>控制启示</b><span>{item.lesson}</span></div><a href={item.url} target="_blank" rel="noreferrer">查看监管/执法原文 <ArrowUpRight size={14}/></a></article>) : <section className="card no-public-case"><BookOpen size={18}/><span>该行业条目暂未收录经核实的公开执法案例；下方给出可直接在系统中演练的模拟案例，不把模拟内容冒充真实事件。</span></section>}
            <div className="implementation-case-grid">{current.handbook.implementation_cases.map((item, index) => <article className="card implementation-case-card" key={item.process_code}>
              <div className="implementation-case-top"><span className="case-badge simulated">流程案例 · 模拟情境</span><span className="process-index">{item.process_code}</span></div><h3>{item.title}</h3><p className="implementation-case-process">{item.process_name} · {index + 1}/{current.handbook.implementation_cases.length}</p>
              <div className="case-step"><b>情境与总体</b><p>{item.scenario}</p></div><div className="case-step"><b>抽样方案</b><p>{item.sample_plan}</p></div><div className="case-step"><b>测试程序</b><p>{item.test_program}</p></div><div className="case-step"><b>异常判定</b><p>{item.exception_criteria}</p></div><div className="case-step"><b>Finding 示例</b><p>{item.finding_example}</p></div><div className="case-step"><b>根因验证</b><p>{item.root_cause}</p></div>
              <div className="implementation-case-actions"><b>整改方案</b><ol>{item.actions.map((action, actionIndex) => <li key={actionIndex}>{action}</li>)}</ol></div><div className="case-step"><b>责任与证据</b><p>{item.owner} 建议证据：{item.evidence}</p></div><div className="case-step"><b>独立复测</b><p>{item.retest}</p></div><div className="case-flow"><b>关闭标准：</b>{item.closure_criteria}</div>
            </article>)}</div>
            <article className="card simulation-card"><div className="case-badge simulated">端到端闭环演练 · 模拟情境</div><h3>{current.handbook.simulation.title}</h3><div className="case-step"><b>① 情境</b><p>{current.handbook.simulation.scenario}</p></div><div className="case-step"><b>② 检查发现</b><p>{current.handbook.simulation.finding}</p></div><div className="case-step"><b>③ 处置和整改方案</b><p>{current.handbook.simulation.response}</p></div><div className="case-step"><b>④ 独立重测</b><p>{current.handbook.simulation.retest}</p></div><div className="case-flow">将实际执行记录录入「内控检查 → 检查发现 → 转 Issue → 整改责任人上传证据 → 独立复核 → 重测 → Close」。本卡只是模拟流程，不会预先生成真实检查结论。</div></article>
          </>}

          {tab === "processes" && <>
            <div className="playbook-section-head process-sample-heading"><div><div className="section-kicker">PROCESS · RISK · CONTROL · SAMPLE</div><h3>流程、风险控制矩阵和检查样本</h3></div><span>执行前确认总体完整并重新确定样本</span></div>
            <div className="playbook-process-grid">{referenceProcesses.map((item, index) => <article className="card playbook-process-card" key={item.name}><div className="playbook-process-top"><span className="process-index">0{index + 1}</span><span className="department-tag">{item.department}</span></div><h3>{item.name}</h3><p>{item.description}</p><div className="playbook-detail-block"><b>风险与控制目标</b><span><strong>风险</strong>{item.risk}</span><span><strong>目标</strong>{item.objective}</span></div><div className="playbook-detail-block control-example"><b>控制设计</b><span>{item.control_design}</span></div><div className="sample-box"><div><b>检查总体</b><span>{item.population}</span></div><div><b>本流程抽样方案</b><span>{item.implementation_case.sample_plan}</span></div><div><b>测试程序</b><span>{item.implementation_case.test_program}</span></div><div><b>异常判定</b><span>{item.implementation_case.exception_criteria}</span></div><div><b>建议证据</b><span>{item.evidence}</span></div></div><details className="scenario-details"><summary>查看具体情境、根因、整改与复测</summary><p><b>模拟情境：</b>{item.implementation_case.scenario}</p><p><b>Finding 示例：</b>{item.implementation_case.finding_example}</p><p><b>根因验证：</b>{item.implementation_case.root_cause}</p><p><b>整改：</b>{item.implementation_case.actions.join("；")}</p><p><b>独立复测：</b>{item.implementation_case.retest}</p></details></article>)}</div>
            <section className="card workflow-example"><div><div className="section-kicker">SAMPLE WORKFLOW</div><h3>从总体抽样到整改闭环</h3><p>{current.workflow_example}</p></div><div className="workflow-note"><ShieldCheck size={18}/><span>套用只建立组织、流程、风险、控制、RCM 和待执行检查。系统不会伪造已执行证据、Finding 或整改结论。</span></div></section>
          </>}

          <section className="card source-card"><div className="playbook-section-head"><div><div className="section-kicker">RESEARCH & SCOPE</div><h3>官方资料和公开来源</h3></div><span>{current.sources.length} 个来源</span></div><div className="source-link-grid">{current.sources.map(source => <a href={source.url} target="_blank" rel="noreferrer" key={source.url}><b>{source.title} <ArrowUpRight size={13}/></b><span>{source.note}</span></a>)}</div><p className="template-disclaimer">{current.disclaimer}</p></section>
          <div className="template-apply-bar"><div><b>{applied ? "本阶段样例已应用到当前公司" : "将可编辑样例应用到当前公司"}</b><span>{applied ? `已应用 ${String(applications.find(item => item.template_id === current.id)?.industry || current.industry)} · ${current.maturity_label}。参考手册含 ${referenceProcesses.length} 条行业流程，本阶段写入 ${current.processes.length} 条；记录可在部门、业务流程、风险、RCM 和内控检查中继续修改。` : `目标公司：${org.name}。手册展示本行业全部 ${referenceProcesses.length} 条流程；应用 ${current.maturity_label} 阶段时写入 ${current.processes.length} 条流程样例，检查保持待执行。`}</span></div>
            <div className="apply-actions"><button className="outline-btn" onClick={exportHandbook}><Download size={14}/>导出手册</button>{applied ? <span className="applied-indicator"><BadgeCheck size={16}/>已应用</span> : canApply ? <button className="primary-btn" disabled={busy || !applicationsLoaded} onClick={apply}>{busy ? <><LoaderCircle className="spin" size={15}/>正在写入</> : !applicationsLoaded ? <>读取应用记录…</> : <>应用这套样例 <ArrowUpRight size={15}/></>}</button> : <span className="readonly-note">公司经理可应用样例</span>}</div>
          </div>
          {error && <div className="form-error">{error}</div>}
        </>}
      </section>
    </div>
  </div>;
}
