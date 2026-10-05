"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowDownToLine, ArrowLeft, ArrowUpRight, BadgeCheck, CalendarDays, CheckCircle2, ClipboardCheck, FileCheck2, Files, GitBranch, LoaderCircle, ShieldAlert, UserRound } from "lucide-react";
import "./inspection-detail.css";

const API = process.env.NEXT_PUBLIC_API_URL || "";

export type InspectionTab = "overview" | "tests" | "evidence" | "findings";
export type InspectionRoute = { inspectionId: string; tab: InspectionTab };
type Row = Record<string, unknown> & { id: string; code?: string; name?: string; title?: string; status?: string };

const tabs: { id: InspectionTab; label: string; icon: typeof ClipboardCheck }[] = [
  { id: "overview", label: "检查概览", icon: ClipboardCheck },
  { id: "tests", label: "检查执行项", icon: FileCheck2 },
  { id: "evidence", label: "证据", icon: Files },
  { id: "findings", label: "检查发现", icon: ShieldAlert },
];
const labels: Record<string, string> = { planned: "计划中", in_progress: "执行中", completed: "已完成", not_tested: "未测试", pass: "通过", fail: "未通过", needs_improvement: "需改进", not_applicable: "不适用", open: "待转整改", converted: "已转整改", accepted: "已接受", low: "低", medium: "中", high: "高", critical: "严重" };
const dateText = (value: unknown) => value ? new Date(String(value)).toLocaleDateString("zh-CN") : "—";
const stateClass = (value: unknown) => String(value || "").replace(/[^a-z0-9_-]/giu, "");

async function api(path: string) {
  const response = await fetch(`${API}${path}`, { credentials: "include", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error((data as { detail?: string }).detail || `请求失败 (${response.status})`);
  return data;
}
const withOrg = (endpoint: string, orgId: string) => `/api/${endpoint}?organization_id=${encodeURIComponent(orgId)}`;

export default function InspectionDetail({ organizationId, inspectionId, tab, onTabChange, onOpenLegacyPage }: {
  organizationId: string;
  inspectionId: string;
  tab: InspectionTab;
  onTabChange: (tab: InspectionTab) => void;
  onOpenLegacyPage: (page: string) => void;
}) {
  const [inspection, setInspection] = useState<Row | null>(null);
  const [tests, setTests] = useState<Row[]>([]);
  const [rcms, setRcms] = useState<Row[]>([]);
  const [evidences, setEvidences] = useState<Row[]>([]);
  const [findings, setFindings] = useState<Row[]>([]);
  const [processes, setProcesses] = useState<Row[]>([]);
  const [risks, setRisks] = useState<Row[]>([]);
  const [controls, setControls] = useState<Row[]>([]);
  const [people, setPeople] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const [inspectionRows, testRows, rcmRows, evidenceRows, findingRows, processRows, riskRows, controlRows, memberRows] = await Promise.all([
        api(withOrg("inspections", organizationId)), api(withOrg("inspection-tests", organizationId)), api(withOrg("rcms", organizationId)),
        api(withOrg("evidence", organizationId)), api(withOrg("findings", organizationId)), api(withOrg("processes", organizationId)),
        api(withOrg("risks", organizationId)), api(withOrg("controls", organizationId)),
        api(`/api/organizations/${encodeURIComponent(organizationId)}/members`),
      ]) as [Row[], Row[], Row[], Row[], Row[], Row[], Row[], Row[], Row[]];
      setInspection(inspectionRows.find(row => row.id === inspectionId) || null);
      setTests(testRows.filter(row => row.inspection_id === inspectionId));
      setRcms(rcmRows); setEvidences(evidenceRows); setFindings(findingRows); setProcesses(processRows); setRisks(riskRows); setControls(controlRows);
      setPeople(memberRows.map(row => { const user = row.user as Record<string, unknown> | undefined; return { id: String(user?.id || ""), name: String(user?.full_name || user?.email || "成员") }; }));
    } catch (err) { setError(err instanceof Error ? err.message : "读取检查详情失败"); }
    finally { setLoading(false); }
  }, [inspectionId, organizationId]);
  useEffect(() => { load(); }, [load]);

  const mapsById = useMemo(() => new Map(rcms.map(row => [row.id, row])), [rcms]);
  const risksById = useMemo(() => new Map(risks.map(row => [row.id, row])), [risks]);
  const controlsById = useMemo(() => new Map(controls.map(row => [row.id, row])), [controls]);
  const testsById = useMemo(() => new Map(tests.map(row => [row.id, row])), [tests]);
  const personById = useMemo(() => new Map(people.map(row => [row.id, row])), [people]);
  const testRcmIds = useMemo(() => new Set(tests.map(row => String(row.rcm_id || ""))), [tests]);
  const relatedEvidence = evidences.filter(row => row.rcm_id && testRcmIds.has(String(row.rcm_id)));
  const relatedFindings = findings.filter(row => testsById.has(String(row.inspection_test_id || "")));
  const process = processes.find(row => row.id === inspection?.process_id);
  const lead = personById.get(String(inspection?.lead_user_id || ""));
  const doneTests = tests.filter(row => row.result && row.result !== "not_tested").length;
  const heading = String(inspection?.name || inspection?.code || "检查详情");

  const downloadEvidence = async (row: Row) => {
    try {
      const response = await fetch(`${API}/api/evidence/${encodeURIComponent(row.id)}/download?organization_id=${encodeURIComponent(organizationId)}`, { credentials: "include" });
      if (!response.ok) throw new Error("证据下载失败");
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = String(row.file_name || "evidence"); link.click(); URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "证据下载失败"); }
  };

  return <div className="module-page inspection-detail-page">
    <div className="inspection-detail-head">
      <div><span className="section-kicker">INTERNAL CONTROL INSPECTION</span><h1>{heading}</h1><p>{String(inspection?.code || "")}{process ? ` · ${String(process.name || process.code || "业务流程")}` : " · 检查计划与执行记录"}</p></div>
      <button type="button" className="outline-btn" onClick={() => onOpenLegacyPage("inspections")}><ArrowLeft size={14}/>返回检查列表</button>
    </div>
    <div className="inspection-detail-summary">
      <span className={`state-pill ${stateClass(inspection?.status)}`}>{labels[String(inspection?.status || "")] || String(inspection?.status || "读取中")}</span>
      <span><CalendarDays size={14}/>{dateText(inspection?.period_start)} – {dateText(inspection?.period_end)}</span>
      <span><UserRound size={14}/>{String(lead?.name || "未指定检查负责人")}</span>
    </div>
    <div className="inspection-tabs" role="tablist" aria-label="检查详情页面">
      {tabs.map(item => { const Icon = item.icon; return <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`inspection-tab${tab === item.id ? " active" : ""}`} onClick={() => onTabChange(item.id)}><Icon size={16}/><span>{item.label}</span>{item.id === "tests" && <small>{tests.length}</small>}{item.id === "findings" && <small>{relatedFindings.length}</small>}</button>; })}
    </div>
    {error && <div className="form-error inspection-detail-error">{error}<button type="button" className="text-btn" onClick={load}>重新读取</button></div>}
    {loading ? <div className="card inspection-detail-empty"><LoaderCircle className="spin" size={20}/>正在读取检查详情…</div> : !inspection ? <div className="card inspection-detail-empty"><ClipboardCheck size={22}/><b>找不到这条检查记录</b><span>检查可能已删除，或当前账号无权访问。</span><button type="button" className="text-btn" onClick={() => onOpenLegacyPage("inspections")}>返回内控检查</button></div> : <>
      {tab === "overview" && <section className="inspection-overview-grid">
        <article className="card inspection-overview-main"><div className="inspection-card-title"><span><ClipboardCheck size={17}/></span><div><h2>检查概览</h2><p>当前检查计划及执行情况</p></div></div><div className="inspection-overview-fields"><div><small>所属流程</small><b><GitBranch size={14}/>{String(process?.name || process?.code || "未关联流程")}</b></div><div><small>检查负责人</small><b><UserRound size={14}/>{String(lead?.name || "未指定")}</b></div><div><small>检查期间</small><b><CalendarDays size={14}/>{dateText(inspection.period_start)} – {dateText(inspection.period_end)}</b></div><div><small>执行进度</small><b><CheckCircle2 size={14}/>{doneTests} / {tests.length} 项已记录结论</b></div></div><div className="inspection-progress"><span style={{ width: `${tests.length ? Math.round(doneTests / tests.length * 100) : 0}%` }}/></div></article>
        <article className="card inspection-overview-side"><span className="section-kicker">REVIEW FLOW</span><h3>检查整改链路</h3><p>检查执行项记录结论，未通过事项进入发现与整改闭环。</p><div className="inspection-flow"><span>执行</span><i/><span>发现</span><i/><span>整改</span><i/><span>复核</span></div><button type="button" className="text-btn" onClick={() => onTabChange("tests")}>查看执行项 <ArrowUpRight size={14}/></button></article>
      </section>}
      {tab === "tests" && <section className="card table-card inspection-tab-panel"><div className="table-headline"><div className="table-title-icon"><FileCheck2 size={18}/></div><div><h3>检查执行项</h3><p>本次检查下的控制测试与执行记录。</p></div><div className="table-controls"><span className="rows-count">{tests.length} 项</span><button type="button" className="text-btn" onClick={() => onOpenLegacyPage("inspection-tests")}>打开完整清单 <ArrowUpRight size={13}/></button></div></div><div className="data-table-wrap"><table><thead><tr><th>检查项</th><th>关联风险 / 控制</th><th>执行人</th><th>检查结果</th><th>样本说明</th></tr></thead><tbody>{tests.map(row => { const rcm = mapsById.get(String(row.rcm_id || "")); const risk = rcm ? risksById.get(String(rcm.risk_id || "")) : undefined; const control = rcm ? controlsById.get(String(rcm.control_id || "")) : undefined; const tester = personById.get(String(row.tester_user_id || "")); return <tr key={row.id}><td>{String(row.procedure || "检查程序")}</td><td>{[risk?.name, control?.name].filter(Boolean).join(" / ") || String(rcm?.assertion || "—")}</td><td>{String(tester?.name || "—")}</td><td><span className={`state-pill ${stateClass(row.result)}`}>{labels[String(row.result || "")] || String(row.result || "未测试")}</span></td><td>{String(row.sample_description || "—")}</td></tr>; })}{!tests.length && <tr><td colSpan={5} className="inspection-detail-empty-row">本次检查还没有执行项。可打开完整清单创建或维护检查项。</td></tr>}</tbody></table></div></section>}
      {tab === "evidence" && <section className="card table-card inspection-tab-panel"><div className="table-headline"><div className="table-title-icon"><Files size={18}/></div><div><h3>关联证据</h3><p>按本次检查执行项关联的 RCM 控制映射汇总。</p></div><div className="table-controls"><span className="rows-count">{relatedEvidence.length} 份</span><button type="button" className="text-btn" onClick={() => onOpenLegacyPage("evidence")}>打开证据库 <ArrowUpRight size={13}/></button></div></div><div className="data-table-wrap"><table><thead><tr><th>文件名称</th><th>业务关联</th><th>文件类型</th><th>上传日期</th><th>操作</th></tr></thead><tbody>{relatedEvidence.map(row => <tr key={row.id}><td>{String(row.file_name || "—")}</td><td>{String(row.related_label || "RCM 控制映射")}</td><td>{String(row.content_type || "—")}</td><td>{dateText(row.created_at)}</td><td><button type="button" className="icon-btn" title="下载证据" aria-label={`下载证据 ${String(row.file_name || "")}`} onClick={() => downloadEvidence(row)}><ArrowDownToLine size={15}/></button></td></tr>)}{!relatedEvidence.length && <tr><td colSpan={5} className="inspection-detail-empty-row">当前检查关联的控制映射暂无证据。可进入证据库上传并关联 RCM。</td></tr>}</tbody></table></div></section>}
      {tab === "findings" && <section className="card table-card inspection-tab-panel"><div className="table-headline"><div className="table-title-icon"><ShieldAlert size={18}/></div><div><h3>检查发现</h3><p>本次检查执行项形成的发现，以及后续整改状态。</p></div><div className="table-controls"><span className="rows-count">{relatedFindings.length} 项</span><button type="button" className="text-btn" onClick={() => onOpenLegacyPage("findings")}>打开发现清单 <ArrowUpRight size={13}/></button></div></div><div className="data-table-wrap"><table><thead><tr><th>发现事项</th><th>关联检查项</th><th>严重程度</th><th>整改状态</th><th>实际情况</th></tr></thead><tbody>{relatedFindings.map(row => { const test = testsById.get(String(row.inspection_test_id || "")); return <tr key={row.id}><td>{String(row.title || "—")}</td><td>{String(test?.procedure || test?.id || "—")}</td><td><span className={`state-pill ${stateClass(row.severity)}`}>{labels[String(row.severity || "")] || String(row.severity || "—")}</span></td><td><span className={`state-pill ${stateClass(row.status)}`}>{labels[String(row.status || "")] || String(row.status || "—")}</span></td><td>{String(row.condition || "—")}</td></tr>; })}{!relatedFindings.length && <tr><td colSpan={5} className="inspection-detail-empty-row">本次检查暂无检查发现。</td></tr>}</tbody></table></div><div className="table-footnote"><span><BadgeCheck size={13}/>检查发现可转为整改事项，随后提交整改证据、复核并关闭。</span><button type="button" className="text-btn" onClick={() => onOpenLegacyPage("findings")}>查看检查发现 <ArrowUpRight size={13}/></button></div></section>}
    </>}
  </div>;
}
