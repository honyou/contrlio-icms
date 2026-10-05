"use client";

import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle, ArrowDownRight, ArrowRight, BadgeCheck, Check, ChevronRight,
  CircleHelp, ClipboardCheck, GitBranch, LoaderCircle, Network, RotateCw,
  Search, Shield, ShieldCheck, type LucideIcon,
} from "lucide-react";
import "./risk-control-matrix.css";
import { compactRiskCode } from "./risk-code";

const API = process.env.NEXT_PUBLIC_API_URL || "";
type Row = Record<string, any> & { id: string; name?: string; code?: string };
export type IntegrityTarget = {
  id: string;
  page: "controls" | "processes";
  recordId?: string;
  processId?: string;
  tab?: "objectives" | "risk-controls";
  focusRiskId?: string;
  focusObjectiveId?: string;
  title: string;
  detail: string;
  action: string;
};
type Finding = { label: string; count: number; detail: string; targets: IntegrityTarget[] };
type Props = { organizationId: string; onError: (message: string) => void; onNavigate: (page: string) => void; onOpenTarget: (target: IntegrityTarget) => void };
type Metric = { id: string; label: string; completed: number; total: number; weight: number; value: number | null; note: string };

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(body.detail || `请求失败 (${response.status})`);
  return body as T;
}

const riskLevel = (score: number): [string, string] => score <= 4 ? ["low", "低"] : score <= 9 ? ["medium", "中"] : score <= 16 ? ["high", "高"] : ["critical", "重大"];
const frequencyLabels: Record<string, string> = { per_transaction: "每笔", continuous: "持续", daily: "每日", weekly: "每周", monthly: "每月", quarterly: "每季度", annual: "每年", ad_hoc: "按需" };
const lineageSteps: [LucideIcon, string][] = [[GitBranch, "业务流程"], [ShieldCheck, "控制目标"], [AlertTriangle, "风险"], [Shield, "控制措施"], [ClipboardCheck, "检查与整改"]];
const riskScore = (risk: Row) => Number(risk.risk_score ?? Number(risk.likelihood || 0) * Number(risk.impact || 0));
const ratioMetric = (id: string, label: string, completed: number, total: number, weight: number, note: string): Metric => ({
  id, label, completed, total, weight, value: total ? Math.round(completed / total * 100) : null, note,
});

export default function RiskControlMatrixPage({ organizationId, onError, onNavigate, onOpenTarget }: Props) {
  const [data, setData] = useState<{ processes: Row[]; objectives: Row[]; risks: Row[]; controls: Row[]; rcms: Row[]; riskObjectiveLinks: Row[]; members: Row[]; inspectionTests: Row[]; issues: Row[] } | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedRiskCell, setSelectedRiskCell] = useState<string | null>(null);
  const [expandedFinding, setExpandedFinding] = useState<string | null>(null);
  const [scanRevision, setScanRevision] = useState(0);
  const [scannedAt, setScannedAt] = useState<Date | null>(null);

  useEffect(() => {
    let active = true;
    let settleTimer: number | undefined;
    const startedAt = Date.now();
    const query = `?organization_id=${encodeURIComponent(organizationId)}`;
    setLoading(true);
    Promise.all([
      request<Row[]>(`/api/processes${query}`),
      request<Row[]>(`/api/control-objectives${query}`),
      request<{ risks: Row[] }>(`/api/risk-management${query}`).then(result => result.risks),
      request<Row[]>(`/api/controls${query}`),
      request<Row[]>(`/api/rcms${query}`),
      request<Row[]>(`/api/risk-objective-links${query}`),
      request<Row[]>(`/api/organizations/${encodeURIComponent(organizationId)}/members`),
      request<Row[]>(`/api/inspection-tests${query}`),
      request<Row[]>(`/api/issues${query}`),
    ]).then(([processes, objectives, risks, controls, rcms, riskObjectiveLinks, members, inspectionTests, issues]) => {
      if (active) {
        setData({ processes, objectives, risks, controls, rcms, riskObjectiveLinks, members, inspectionTests, issues });
        setScannedAt(new Date());
      }
    }).catch(error => { if (active) onError(error instanceof Error ? error.message : "RCM 数据加载失败"); })
      .finally(() => {
        const remaining = Math.max(0, 3400 - (Date.now() - startedAt));
        settleTimer = window.setTimeout(() => { if (active) setLoading(false); }, remaining);
      });
    return () => { active = false; if (settleTimer !== undefined) window.clearTimeout(settleTimer); };
  }, [organizationId, onError, scanRevision]);

  const rows = useMemo(() => {
    if (!data) return [];
    const processes = new Map(data.processes.map(row => [row.id, row]));
    const objectives = new Map(data.objectives.map(row => [row.id, row]));
    const riskObjectiveSet = new Set(data.riskObjectiveLinks.map(link => `${link.risk_id}:${link.objective_id}`));
    const risks = new Map(data.risks.map(row => [row.id, row]));
    const controls = new Map(data.controls.map(row => [row.id, row]));
    const members = new Map(data.members.map(row => [String((row.user as Row | undefined)?.id || row.id), String((row.user as Row | undefined)?.full_name || row.name || "未指定")]));
    return data.rcms.flatMap(link => {
      const risk = risks.get(String(link.risk_id));
      const control = controls.get(String(link.control_id));
      if (!risk || !control || control.is_active === false) return [];
      const process = processes.get(String(link.process_id));
      const objective = objectives.get(String(control.objective_id));
      if (!objective || !riskObjectiveSet.has(`${risk.id}:${objective.id}`)) return [];
      const score = riskScore(risk);
      const [level, levelLabel] = riskLevel(score);
      return [{
        id: link.id, riskId: risk.id, process: process?.name || "未知流程", objective: objective.name || "未关联目标",
        risk: risk.name || "未命名风险", riskCode: compactRiskCode(risk, data.risks), riskFullCode: risk.code || "—",
        score, level, levelLabel,
        control: control.name || "未命名控制", controlCode: control.code || "—",
        owner: control.owner_user_id ? members.get(String(control.owner_user_id)) || "未指定" : "未指定",
        frequency: frequencyLabels[String(control.frequency)] || "未设置", key: Boolean(control.is_key_control),
      }];
    });
  }, [data]);

  const findings = useMemo(() => {
    if (!data) return [];
    const linksByRisk = new Map<string, Row[]>();
    const controls = new Map(data.controls.map(row => [row.id, row]));
    const processes = new Map(data.processes.map(row => [row.id, row]));
    data.rcms.forEach(link => {
      const list = linksByRisk.get(String(link.risk_id)) || [];
      list.push(link); linksByRisk.set(String(link.risk_id), list);
    });
    const hasControl = (link: Row) => {
      const control = controls.get(String(link.control_id));
      return Boolean(control && control.is_active !== false);
    };
    const processTarget = (id: string, processId: string, title: string, detail: string, tab: "objectives" | "risk-controls", focus: { focusRiskId?: string; focusObjectiveId?: string }): IntegrityTarget => ({
      id, page: "processes", processId, tab, ...focus, title, detail,
      action: tab === "objectives" ? "打开目标及风险关联" : "打开风险与控制关系",
    });
    const check = (label: string, detail: string, targets: IntegrityTarget[]): Finding => ({ label, count: targets.length, detail, targets });
    const risksWithoutControls = data.risks.filter(risk => !(linksByRisk.get(risk.id) || []).some(hasControl)).map(risk => {
      const processId = String(risk.process_id || "");
      return processTarget(risk.id, processId, risk.name || "未命名风险", `${processes.get(processId)?.name || "所属流程"} · ${compactRiskCode(risk, data.risks)}`, "risk-controls", { focusRiskId: risk.id });
    });
    const controlsWithoutOwner = data.controls.filter(control => control.is_active !== false && !control.owner_user_id).map(control => ({
      id: control.id, page: "controls" as const, recordId: control.id, title: control.name || "未命名控制",
      detail: `${control.code || "无编号"} · ${processes.get(String(control.process_id))?.name || "所属流程未识别"} · 缺少控制责任人`, action: "打开控制编辑表单",
    }));
    const keyWithoutFrequency = data.controls.filter(control => control.is_active !== false && control.is_key_control && !control.frequency).map(control => ({
      id: control.id, page: "controls" as const, recordId: control.id, title: control.name || "未命名控制",
      detail: `${control.code || "无编号"} · ${processes.get(String(control.process_id))?.name || "所属流程未识别"} · 执行频率未设置`, action: "打开控制编辑表单",
    }));
    const linkedObjectiveIds = new Set(data.riskObjectiveLinks.map(link => String(link.objective_id)));
    const objectivesWithoutRisks = data.objectives.filter(objective => !linkedObjectiveIds.has(objective.id)).map(objective => {
      const processId = String(objective.process_id || "");
      return processTarget(objective.id, processId, objective.name || "未命名控制目标", `${objective.code || "无编号"} · ${processes.get(processId)?.name || "所属流程"}`, "objectives", { focusObjectiveId: objective.id });
    });
    const highWithoutKey = data.risks.filter(risk => riskScore(risk) > 9 && !(linksByRisk.get(risk.id) || []).some(link => {
      const control = controls.get(String(link.control_id));
      return Boolean(control && control.is_active !== false && control.is_key_control);
    })).map(risk => {
      const processId = String(risk.process_id || "");
      const relatedControls = (linksByRisk.get(risk.id) || []).map(link => controls.get(String(link.control_id))).filter((control): control is Row => Boolean(control && control.is_active !== false));
      const editableControl = relatedControls.find(control => !control.is_key_control) || relatedControls[0];
      return editableControl ? {
        id: risk.id, page: "controls" as const, recordId: editableControl.id, title: risk.name || "未命名风险",
        detail: `${compactRiskCode(risk, data.risks)} · ${editableControl.name || "关联控制"} 尚未标记为关键控制`, action: "打开关联控制并设为关键",
      } : processTarget(risk.id, processId, risk.name || "未命名风险", `${compactRiskCode(risk, data.risks)} · ${processes.get(processId)?.name || "所属流程"} · 尚无关键控制`, "risk-controls", { focusRiskId: risk.id });
    });
    return [
      check("风险无控制措施", "展开清单，直接打开对应流程的风险与控制关系", risksWithoutControls),
      check("控制措施无责任人", "展开清单，直接打开缺少责任人的控制编辑表单", controlsWithoutOwner),
      check("关键控制未设置执行频率", "展开清单，直接打开关键控制编辑表单", keyWithoutFrequency),
      check("控制目标无风险", "展开清单，直接打开目标及风险关联位置", objectivesWithoutRisks),
      check("高风险无关键控制", "展开清单，编辑对应控制或定位风险关系", highWithoutKey),
    ];
  }, [data]);

  const metrics = useMemo(() => {
    if (!data) return [];
    const validControlIds = new Set(data.controls.filter(control => control.is_active !== false).map(control => control.id));
    const coveredRiskIds = new Set(data.rcms.filter(link => validControlIds.has(String(link.control_id))).map(link => String(link.risk_id)));
    const linkedObjectiveIds = new Set(data.riskObjectiveLinks.map(link => String(link.objective_id)));
    const activeControls = data.controls.filter(control => control.is_active !== false);
    const testCoveredRcmIds = new Set(data.inspectionTests.filter(test => test.result !== "not_tested").map(test => String(test.rcm_id)));
    const issueMetric = ratioMetric("remediation", "整改闭环", data.issues.filter(issue => issue.status === "closed").length, data.issues.length, 10, "已关闭问题 / 全部问题");
    return [
      ratioMetric("processes", "流程配置", data.processes.filter(process => process.configuration_status === "published").length, data.processes.length, 15, "已发布流程 / 全部流程"),
      ratioMetric("objectives", "目标关联", data.objectives.filter(objective => linkedObjectiveIds.has(objective.id)).length, data.objectives.length, 15, "已关联风险目标 / 全部目标"),
      ratioMetric("coverage", "风险覆盖", data.risks.filter(risk => coveredRiskIds.has(risk.id)).length, data.risks.length, 25, "有有效控制的风险 / 全部风险"),
      ratioMetric("controls", "控制配置", activeControls.filter(control => control.owner_user_id && control.frequency && control.execution_mode && control.control_type).length, activeControls.length, 20, "已配置责任人、频率及属性的控制 / 启用控制"),
      ratioMetric("testing", "检查执行", data.rcms.filter(link => testCoveredRcmIds.has(link.id)).length, data.rcms.length, 15, "已有检查结论的关系 / 全部关系"),
      issueMetric,
    ];
  }, [data]);

  const overallScore = useMemo(() => {
    const applicable = metrics.filter(metric => metric.value !== null);
    const weight = applicable.reduce((sum, metric) => sum + metric.weight, 0);
    return weight ? Math.round(applicable.reduce((sum, metric) => sum + (metric.value || 0) * metric.weight, 0) / weight) : null;
  }, [metrics]);
  const risksByCell = useMemo(() => {
    const map = new Map<string, Row[]>();
    data?.risks.forEach(risk => {
      const key = `${Math.max(1, Math.min(5, Number(risk.likelihood) || 1))}:${Math.max(1, Math.min(5, Number(risk.impact) || 1))}`;
      const group = map.get(key) || [];
      group.push(risk); map.set(key, group);
    });
    return map;
  }, [data]);
  const allRisks = data?.risks || [];
  const highRiskCount = allRisks.filter(risk => riskScore(risk) > 9).length;
  const criticalRiskCount = allRisks.filter(risk => riskScore(risk) > 16).length;
  const issueCount = findings.reduce((sum, item) => sum + item.count, 0);
  const filteredRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return rows.filter(row => {
      const matchesCell = !selectedRiskCell || (() => {
        const risk = data?.risks.find(item => item.id === row.riskId);
        return risk && `${risk.likelihood}:${risk.impact}` === selectedRiskCell;
      })();
      const matchesSearch = !query || [row.process, row.objective, row.risk, row.riskCode, row.riskFullCode, row.control, row.controlCode, row.owner, row.frequency, row.key ? "关键控制" : "普通控制"]
        .some(value => String(value ?? "").toLocaleLowerCase().includes(query));
      return matchesCell && matchesSearch;
    });
  }, [data, rows, search, selectedRiskCell]);
  const selectedCellRisks = selectedRiskCell ? risksByCell.get(selectedRiskCell) || [] : [];
  const selectedCellLabel = selectedRiskCell ? selectedRiskCell.split(":").reverse().join(" × ") : "全部风险分布";
  const scoreState = overallScore === null ? "等待数据" : overallScore >= 85 ? "健康" : overallScore >= 65 ? "需关注" : "需整改";
  const scoreCaption = loading ? "正在扫描内控关系" : overallScore === null ? "数据尚未完整，暂无法评分" : overallScore >= 85 ? "运行良好，可持续优化" : overallScore >= 65 ? "发现薄弱项，建议继续优化" : "存在重点缺口，建议优先整改";

  return <div className="module-page rcm-page">
    <header className="module-header"><div><span className="section-kicker">RISK MAP & CONTROL HEALTH SCAN</span><h1>风险控制矩阵 <span>RCM</span></h1><p>自动汇总流程、目标、风险、控制与执行记录，用风险地图定位薄弱区域。</p></div></header>

    <section className="card rcm-scan-panel" aria-label="内控健康扫描">
      <div className={`rcm-scan-overview ${loading ? "is-scanning" : "is-complete"}`}>
        <div className={`rcm-scan-visual ${loading ? "is-scanning" : "is-complete"} ${overallScore !== null && overallScore < 65 ? "needs-action" : ""}`} aria-label={loading ? "内控扫描进行中" : `内控评分 ${overallScore ?? "暂无"}`}>
          <span className="rcm-scan-orb-glow"/><span className="rcm-scan-orbit orbit-hud"/>
          <div className="rcm-score-ring">
            <div className="rcm-score-ring-inner"><small className="rcm-score-kicker">RCM HEALTH SCORE</small><strong>{overallScore === null ? (loading ? "…" : "—") : overallScore}</strong><span>{scoreCaption}</span></div>
          </div>
        </div>
        <div className="rcm-scan-copy">
          <div className="rcm-scan-heading"><div><span className="rcm-scan-eyebrow"><span className="rcm-scan-dot"/> 自动体检 · {loading ? "扫描中" : scoreState}</span><h2>分板块覆盖完成度</h2></div><button type="button" className="outline-btn rcm-rescan" onClick={() => setScanRevision(value => value + 1)} disabled={loading}><RotateCw size={14} className={loading ? "rcm-spin" : ""}/>{loading ? "扫描中" : "重新扫描"}</button></div>
          <div className="rcm-metric-grid">{metrics.map(metric => <div className="rcm-metric" key={metric.id}><div className="rcm-metric-label"><b>{metric.label}</b><span>{metric.value === null ? (loading ? "读取中" : "—") : `${metric.value}%`}</span></div><div className={`rcm-metric-track ${loading ? "is-scanning" : ""}`}><span style={{ width: `${metric.value ?? 0}%` }}/></div><small>{metric.value === null ? (loading ? "正在读取…" : "暂无数据 · 不纳入总评分") : `${metric.completed} / ${metric.total} · ${metric.note}`}</small></div>)}</div>
          <div className="rcm-score-footnote"><span><Check size={13}/>综合评分按完成度加权</span>{scannedAt && <span>最近扫描 {scannedAt.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}</span>}<button className="rcm-method-tip" type="button" title="按各板块权重计算加权平均：流程15%、目标15%、风险25%、控制20%、检查15%、整改10%；没有基础数据的板块不计入总分。" aria-label="评分口径：按各板块权重计算加权平均；流程15%、目标15%、风险25%、控制20%、检查15%、整改10%；没有基础数据的板块不计入总分"><CircleHelp size={15}/></button></div>
        </div>
      </div>
    </section>

    <section className="card rcm-map-card" aria-label="风险地图">
      <div className="rcm-map-heading"><div><span className="section-kicker">INHERENT RISK PROFILE</span><h2>风险地图</h2><p>按风险可能性与影响程度落点；点击任一格，筛选下方对应关系。</p></div><button type="button" className={`rcm-map-reset ${selectedRiskCell ? "active" : ""}`} onClick={() => setSelectedRiskCell(null)} disabled={!selectedRiskCell}>查看全部风险 <ArrowRight size={13}/></button></div>
      <div className="rcm-map-layout">
        <div className="rcm-map-axis-wrap"><div className="rcm-y-axis"><span>影响程度</span><span>很高</span><span>高</span><span>中</span><span>低</span><span>很低</span></div><div className="rcm-map-main"><div className="rcm-map-grid" role="grid" aria-label="风险可能性与影响程度分布">{[5,4,3,2,1].map(impact => [1,2,3,4,5].map(likelihood => {
          const cellKey = `${likelihood}:${impact}`;
          const score = likelihood * impact;
          const [level, label] = riskLevel(score);
          const risks = risksByCell.get(cellKey) || [];
          return <button type="button" role="gridcell" key={cellKey} aria-pressed={selectedRiskCell === cellKey} aria-label={`${label}风险区域，可能性${likelihood}，影响程度${impact}，${risks.length}项风险`} className={`rcm-map-cell level-${level} ${selectedRiskCell === cellKey ? "selected" : ""} ${risks.length ? "populated" : ""}`} onClick={() => setSelectedRiskCell(selectedRiskCell === cellKey ? null : cellKey)}><span>{risks.length || "·"}</span>{risks.length > 0 && <small>项</small>}</button>;
        }))}</div><div className="rcm-x-axis"><span>较低</span><div>{[1,2,3,4,5].map(value=><span key={value}>{value}</span>)}</div><span>较高</span></div><div className="rcm-x-title">可能性</div></div></div>
        <aside className="rcm-map-summary"><div className="rcm-map-summary-top"><span>{selectedRiskCell ? "已选风险区域" : "风险分布概览"}</span><strong>{selectedRiskCell ? selectedCellRisks.length : allRisks.length}<small>项</small></strong></div><b className="rcm-map-selected-label">{selectedCellLabel}</b><div className="rcm-map-stat-list"><span><i className="critical-dot"/>重大风险<strong>{criticalRiskCount}</strong></span><span><i className="high-dot"/>高风险<strong>{highRiskCount - criticalRiskCount}</strong></span><span><i className="medium-dot"/>中风险<strong>{allRisks.filter(risk => { const score=riskScore(risk); return score > 4 && score <= 9; }).length}</strong></span><span><i className="low-dot"/>低风险<strong>{allRisks.filter(risk => riskScore(risk) <= 4).length}</strong></span></div>{selectedRiskCell ? <div className="rcm-map-risk-list">{selectedCellRisks.slice(0, 4).map(risk=><div key={risk.id}><span title={risk.code}>{compactRiskCode(risk, allRisks)}</span><b>{risk.name}</b></div>)}{selectedCellRisks.length > 4 && <small>另有 {selectedCellRisks.length - 4} 项风险</small>}{!selectedCellRisks.length && <small>该区域暂时没有风险</small>}</div> : <p className="rcm-map-hint">点击色块查看该区域的风险和关联控制。越靠右上，风险等级越高。</p>}<div className="rcm-map-legend"><span><i className="low-dot"/>低</span><span><i className="medium-dot"/>中</span><span><i className="high-dot"/>高</span><span><i className="critical-dot"/>重大</span></div></aside>
      </div>
    </section>

    <section className="rcm-check-section" aria-label="完整性检查">
      <div className="rcm-section-heading"><div><span className="section-kicker">INTEGRITY DIAGNOSTICS</span><h2>完整性检查</h2><p>点击问题类型，跳到对应维护页面；同一记录可能命中多项检查。</p></div><span className={`rcm-summary-pill ${issueCount ? "pending" : "complete"}`}>{loading ? "正在检查" : issueCount ? `${issueCount} 项待处理` : "完整性良好"}</span></div>
      <div className="rcm-integrity-grid">{findings.map(item => <div className="rcm-integrity-item" key={item.label}>
        <button type="button" className={`rcm-integrity-card ${item.count ? "has-issue" : "complete"} ${expandedFinding === item.label ? "expanded" : ""}`} disabled={loading || !item.count} aria-expanded={item.count > 1 ? expandedFinding === item.label : undefined} aria-label={`${item.label}：${loading ? "正在检查" : item.count === 1 ? "定位到具体项目" : item.count ? `${item.count}项，查看具体项目` : "无问题"}`} onClick={() => item.count === 1 ? onOpenTarget(item.targets[0]) : setExpandedFinding(expandedFinding === item.label ? null : item.label)}>
          <span className="rcm-check-icon">{item.count ? <AlertTriangle size={16} /> : <BadgeCheck size={16} />}</span><span className="rcm-integrity-copy"><b>{item.label}</b><small>{item.detail}</small></span><strong>{loading ? "—" : item.count}</strong><ChevronRight size={14} className="rcm-integrity-arrow"/>
        </button>
        {expandedFinding === item.label && <div className="rcm-integrity-target-list" aria-label={`${item.label}具体项目`}>
          {item.targets.map(target => <button type="button" className="rcm-integrity-target" key={target.id} onClick={() => onOpenTarget(target)}><span><b>{target.title}</b><small>{target.detail}</small></span><em>{target.action} <ArrowRight size={12}/></em></button>)}
        </div>}
      </div>)}</div>
    </section>

    <section className="card table-card rcm-table-card">
      <div className="table-headline"><div className="table-title-icon"><Network size={18}/></div><div><h3>关系矩阵</h3><p>自动呈现「流程 → 目标 → 风险 → 控制」，无需在此重复录入。</p></div><div className="table-controls">{selectedRiskCell && <button className="rcm-filter-chip" type="button" onClick={()=>setSelectedRiskCell(null)}>风险地图 · {selectedCellRisks.length} 项 <span>×</span></button>}<label className="search-box rcm-search"><Search size={15}/><input value={search} onChange={event=>setSearch(event.target.value)} placeholder="搜索流程、风险或控制"/></label><span className="rows-count">{loading ? "—" : filteredRows.length} 条关系</span></div></div>
      <div className="data-table-wrap rcm-table-wrap"><table><thead><tr><th>业务流程</th><th>控制目标</th><th>风险 / 风险等级</th><th>控制措施与执行信息</th></tr></thead><tbody>
        {loading && <tr><td colSpan={4} className="loading-cell"><LoaderCircle className="spin" size={19} />正在汇总控制关系…</td></tr>}
        {!loading && filteredRows.map(row => <tr key={row.id}><td><span className="rcm-process-name">{row.process}</span></td><td><span className="rcm-objective-name">{row.objective}</span></td><td><div className="rcm-risk-cell"><span className="rcm-risk-code" title={`完整编号：${row.riskFullCode}`}>{row.riskCode}</span><b>{row.risk}</b><span className={`risk-level risk-${row.level}`}>{row.levelLabel} · {row.score}</span></div></td><td><div className="rcm-control-cell"><div><span className="rcm-control-code">{row.controlCode}</span><b>{row.control}</b></div><div className="rcm-control-meta"><span><small>责任人</small>{row.owner}</span><span><small>频率</small>{row.frequency}</span><span><small>属性</small><i className={`rcm-key-pill ${row.key ? "key" : "standard"}`}>{row.key ? "关键控制" : "一般控制"}</i></span></div></div></td></tr>)}
        {!loading && filteredRows.length === 0 && <tr><td colSpan={4} className="rcm-empty"><Network size={23}/><b>{search ? "没有匹配的关系" : selectedRiskCell ? "该区域暂无已关联的控制关系" : "还没有可汇总的风险与控制关系"}</b><span>{search ? "换一个流程、风险或控制名称再试。" : selectedRiskCell ? `地图中该区域有 ${selectedCellRisks.length} 项风险，可在业务流程详情维护其控制关系。` : "请在业务流程详情的「风险与控制」中维护关系，矩阵会自动更新。"}</span></td></tr>}
      </tbody></table></div>
    </section>
    <section className="rcm-purpose-footnote"><div className="rcm-purpose-icon"><ArrowDownRight size={16}/></div><p><b>RCM 的作用：</b>它把已有内控数据转成一张关系地图和体检报告，帮助企业发现未覆盖风险、责任缺失和执行空档；企业在业务流程、控制库、内控检查和整改页面维护数据，RCM 自动汇总并计算完成度。</p><div className="rcm-lineage-mini">{lineageSteps.map(([Icon,label],i)=><span key={label}><Icon size={12}/>{label}{i<lineageSteps.length-1&&<ArrowRight size={11}/>}</span>)}</div></section>
  </div>;
}
