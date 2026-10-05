"use client";

import { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, ArrowDownToLine, BookOpen, Check, CircleAlert, FileCheck2, FileText, GitBranch, Layers3, LoaderCircle, LockKeyhole, Scale, Settings2, ShieldAlert, Sparkles, Upload, X } from "lucide-react";
import "./policy-review.css";
import "./policy-material.css";
import "./policy-workspace.css";

type Organization = { id: string; name: string; industry?: string };
type Citation = { id: string; title: string; authority: string; source_url: string; scope_note: string };
type Finding = { title: string; severity: "high" | "medium" | "low"; policy_excerpt: string; risk: string; regulatory_gap: string; recommendation: string; confidence: "high" | "medium" | "low"; law_references: Citation[] };
type Result = { summary: string; overall_severity: string; findings: Finding[]; positive_controls: string[]; open_questions: string[]; raw_report?: string | null; format_warning?: string | null; regulation_index_checked_on?: string; regulation_index_only?: boolean; official_text_fetched?: boolean; supplementary_law_source?: { url?: string; material_char_count: number; verified_by_system: boolean } | null };
type Analysis = { id: string; document_id: string; provider: string; model: string; token_usage: number; usage_estimated: boolean; result: Result; created_at: string };
type PolicyDocument = { id: string; file_name: string; content_type: string; size_bytes: number; sha256: string; extracted_char_count: number; created_at: string; latest_analysis: Analysis | null };
type AISettings = { configured: boolean; provider?: string | null; model?: string | null };
type Quota = { is_unlimited: boolean; remaining_tokens: number | null; effective_limit_tokens: number | null; used_tokens: number };
type ProcessOption = { id: string; code: string; name: string; description: string; revision: number; published_revision: number | null; has_configuration: boolean; configuration_char_count: number; estimated_source_chars: number; linked_policy_references: { id: string; file_name: string }[] };
type CrossSource = { source_type: "policy" | "process"; id: string; name: string; sha256?: string; char_count?: number; configuration_revision?: number; published_revision?: number | null; configuration_state?: string };
type CrossFinding = { title: string; conflict_type: string; severity: "high" | "medium" | "low"; confidence: "high" | "medium" | "low"; source_refs: { source_type: "policy" | "process"; source_id: string }[]; evidence: { source_type: "policy" | "process"; source_id: string; excerpt: string }[]; conflict_reason: string; risk: string; recommendation: string; suggested_resolution: string };
type CrossResult = { summary: string; overall_severity: string; conflicts: CrossFinding[]; quick_wins: string[]; open_questions: string[]; format_warning?: string | null; input_char_count?: number; scope_note?: string };
type CrossAnalysis = { id: string; provider: string; model: string; token_usage: number; usage_estimated: boolean; input_char_count: number; source_snapshot: CrossSource[]; result: CrossResult; created_at: string };

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const MAX_CROSS_CHARS = 100_000;

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: "include", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `请求失败 (${response.status})`);
  return data;
}

const severityLabels: Record<string, string> = { high: "高", medium: "中", low: "低", unknown: "待评估" };
const formatDate = (value: string) => new Date(value).toLocaleString("zh-CN", { hour12: false });

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readJsonStringProperty(source: string, key: string): string | null {
  const keyOffset = source.indexOf(`"${key}"`);
  if (keyOffset < 0) return null;
  const colon = source.indexOf(":", keyOffset + key.length + 2);
  if (colon < 0) return null;
  let start = colon + 1;
  while (start < source.length && /\s/.test(source[start])) start++;
  if (source[start] !== '"') return null;
  let escaped = false;
  for (let index = start + 1; index < source.length; index++) {
    const char = source[index];
    if (escaped) escaped = false;
    else if (char === "\\") escaped = true;
    else if (char === '"') {
      try { return JSON.parse(source.slice(start, index + 1)) as string; }
      catch { return null; }
    }
  }
  return null;
}

function readCompleteJsonObjects(source: string, key: string): Record<string, unknown>[] {
  const match = new RegExp(`"${key}"\\s*:\\s*\\[`).exec(source);
  if (!match) return [];
  let depth = 0;
  let objectStart = -1;
  let inString = false;
  let escaped = false;
  const objects: Record<string, unknown>[] = [];
  for (let index = match.index + match[0].length; index < source.length; index++) {
    const char = source[index];
    if (inString) {
      if (escaped) escaped = false;
      else if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
      continue;
    }
    if (char === '"') inString = true;
    else if (char === "{") {
      if (depth === 0) objectStart = index;
      depth++;
    } else if (char === "}" && depth > 0) {
      depth--;
      if (depth === 0 && objectStart >= 0) {
        try {
          const item: unknown = JSON.parse(source.slice(objectStart, index + 1));
          if (isRecord(item)) objects.push(item);
        } catch { /* Ignore an incomplete or malformed finding. */ }
        objectStart = -1;
      }
    } else if (char === "]" && depth === 0) break;
  }
  return objects;
}

function readablePolicyReport(result: Result): Result {
  const raw = result.raw_report?.trim();
  if (!raw) return result;
  const candidate = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "").trim();
  let parsed: Record<string, unknown> | null = null;
  try {
    const value: unknown = JSON.parse(candidate);
    if (isRecord(value)) parsed = value;
    else if (typeof value === "string") {
      const nested: unknown = JSON.parse(value);
      if (isRecord(nested)) parsed = nested;
    }
  } catch {
    const start = candidate.indexOf("{");
    if (start >= 0) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let index = start; index < candidate.length; index++) {
        const char = candidate[index];
        if (inString) {
          if (escaped) escaped = false;
          else if (char === "\\") escaped = true;
          else if (char === '"') inString = false;
        } else if (char === '"') inString = true;
        else if (char === "{") depth++;
        else if (char === "}" && --depth === 0) {
          try {
            const value: unknown = JSON.parse(candidate.slice(start, index + 1));
            if (isRecord(value)) parsed = value;
          } catch { /* Continue with partial-field recovery below. */ }
          break;
        }
      }
    }
    if (!parsed) {
      const summary = readJsonStringProperty(candidate, "summary");
      const overallSeverity = readJsonStringProperty(candidate, "overall_severity");
      const findings = readCompleteJsonObjects(candidate, "findings");
      if (summary || overallSeverity || findings.length) {
        parsed = { summary, overall_severity: overallSeverity, findings };
      }
    }
  }

  const looksStructured = candidate.startsWith("{") || candidate.startsWith("[");
  if (!parsed) {
    return looksStructured ? {
      ...result,
      summary: "模型输出没有完整生成，无法整理成报告。请重新分析。",
      raw_report: null,
      format_warning: "已隐藏不完整的原始结构文本；法规来源仍以本地法规索引为准。",
    } : { ...result, raw_report: raw };
  }

  const text = (value: unknown) => typeof value === "string" ? value.trim() : "";
  const sourceFindings = Array.isArray(parsed.findings) ? parsed.findings : [];
  const findings = sourceFindings.filter(isRecord).slice(0, 12).map((item): Finding => ({
    title: text(item.title) || "待核实风险点",
    severity: ["high", "medium", "low"].includes(text(item.severity)) ? text(item.severity) as Finding["severity"] : "medium",
    policy_excerpt: text(item.policy_excerpt),
    risk: text(item.risk),
    regulatory_gap: text(item.regulatory_gap),
    recommendation: text(item.recommendation),
    confidence: ["high", "medium", "low"].includes(text(item.confidence)) ? text(item.confidence) as Finding["confidence"] : "low",
    law_references: Array.isArray(item.law_references) ? item.law_references.filter(isRecord) as unknown as Citation[] : [],
  }));
  const complete = (() => { try { JSON.parse(candidate); return true; } catch { return false; } })();
  return {
    ...result,
    summary: text(parsed.summary) || result.summary,
    overall_severity: text(parsed.overall_severity) || result.overall_severity,
    findings: findings.length ? findings : result.findings,
    positive_controls: Array.isArray(parsed.positive_controls) ? parsed.positive_controls.filter((item): item is string => typeof item === "string") : result.positive_controls,
    open_questions: Array.isArray(parsed.open_questions) ? parsed.open_questions.filter((item): item is string => typeof item === "string") : result.open_questions,
    raw_report: null,
    format_warning: complete ? null : "模型输出未完整结束，已整理出完整生成的部分；如需完整报告，建议重新分析。",
  };
}

export default function PolicyReviewPage({ org, canUse, onOpenSettings }: { org: Organization; canUse: boolean; onOpenSettings: () => void }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [view, setView] = useState<"library" | "review" | "cross">("library");
  const [documents, setDocuments] = useState<PolicyDocument[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [analysisHistory, setAnalysisHistory] = useState<Analysis[]>([]);
  const [processes, setProcesses] = useState<ProcessOption[]>([]);
  const [selectedCrossPolicyIds, setSelectedCrossPolicyIds] = useState<string[]>([]);
  const [selectedProcessIds, setSelectedProcessIds] = useState<string[]>([]);
  const [crossHistory, setCrossHistory] = useState<CrossAnalysis[]>([]);
  const [crossAnalysis, setCrossAnalysis] = useState<CrossAnalysis | null>(null);
  const [regulationMaterial, setRegulationMaterial] = useState("");
  const [regulationSourceUrl, setRegulationSourceUrl] = useState("");
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [quota, setQuota] = useState<Quota | null>(null);
  const [confirmed, setConfirmed] = useState(false);
  const [crossConfirmed, setCrossConfirmed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [crossAnalyzing, setCrossAnalyzing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const selected = useMemo(() => documents.find(row => row.id === selectedId) || null, [documents, selectedId]);
  const selectedCrossDocuments = useMemo(() => documents.filter(row => selectedCrossPolicyIds.includes(row.id)), [documents, selectedCrossPolicyIds]);
  const selectedProcesses = useMemo(() => processes.filter(row => selectedProcessIds.includes(row.id)), [processes, selectedProcessIds]);
  const crossInputChars = useMemo(() => selectedCrossDocuments.reduce((sum, row) => sum + row.extracted_char_count, 0)
    + selectedProcesses.reduce((sum, row) => sum + row.estimated_source_chars, 0), [selectedCrossDocuments, selectedProcesses]);
  const ready = !!settings?.configured;

  useEffect(() => {
    let active = true;
    setLoading(true); setError(""); setDocuments([]); setSelectedId(""); setAnalysis(null); setConfirmed(false); setCrossConfirmed(false); setRegulationMaterial(""); setRegulationSourceUrl("");
    if (!canUse) { setLoading(false); return () => { active = false; }; }
    Promise.all([
      request(`/api/policies?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/ai/settings?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/ai/quota?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/policy-cross-analysis/context?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/policy-cross-analyses?organization_id=${encodeURIComponent(org.id)}`),
    ]).then(([rows, config, quotaData, context, history]: [PolicyDocument[], AISettings, Quota, { processes: ProcessOption[]; max_source_chars: number }, CrossAnalysis[]]) => {
      if (!active) return;
      setDocuments(rows); setSettings(config); setQuota(quotaData); setProcesses(context.processes); setCrossHistory(history); setCrossAnalysis(history[0] || null);
      if (rows.length) {
        setSelectedId(rows[0].id);
        setAnalysis(rows[0].latest_analysis);
      }
      let defaultDocumentIds: string[] = [];
      let sourceChars = 0;
      for (const row of rows) {
        if (defaultDocumentIds.length >= 20) break;
        if (sourceChars + row.extracted_char_count > MAX_CROSS_CHARS - 1000) continue;
        defaultDocumentIds.push(row.id); sourceChars += row.extracted_char_count;
      }
      setSelectedCrossPolicyIds(defaultDocumentIds);
      const defaultProcessIds: string[] = [];
      for (const row of context.processes) {
        const rowChars = row.estimated_source_chars;
        if (sourceChars + rowChars > MAX_CROSS_CHARS - 1000) continue;
        defaultProcessIds.push(row.id); sourceChars += rowChars;
      }
      setSelectedProcessIds(defaultProcessIds);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "制度资料加载失败");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [org.id, canUse]);

  useEffect(() => {
    let active = true;
    setAnalysisHistory([]);
    if (!canUse || !selectedId) return () => { active = false; };
    request(`/api/policies/${selectedId}/analyses?organization_id=${encodeURIComponent(org.id)}`)
      .then((rows: Analysis[]) => { if (active) setAnalysisHistory(rows); })
      .catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "分析历史读取失败"); });
    return () => { active = false; };
  }, [org.id, selectedId, canUse]);

  const chooseDocument = (row: PolicyDocument) => {
    setSelectedId(row.id); setAnalysis(row.latest_analysis); setConfirmed(false); setRegulationMaterial(""); setRegulationSourceUrl(""); setError(""); setNotice("");
  };

  const chooseDocumentId = (id: string) => {
    const row = documents.find(item => item.id === id);
    if (row) chooseDocument(row);
  };

  const upload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (file.size > 20 * 1024 * 1024) { setError("单个制度文件不能超过 20 MB"); return; }
    setUploading(true); setError(""); setNotice("");
    const body = new FormData(); body.append("file", file);
    try {
      const row = await request(`/api/policies/upload?organization_id=${encodeURIComponent(org.id)}`, { method: "POST", body }) as PolicyDocument;
      row.latest_analysis = null;
      setDocuments(current => [row, ...current]); setSelectedId(row.id); setAnalysis(null); setConfirmed(false); setRegulationMaterial(""); setRegulationSourceUrl("");
      setAnalysisHistory([]);
      setView("library");
      setSelectedCrossPolicyIds(current => current.length < 20 && [...current, row.id].reduce((sum, id) => sum + (id === row.id ? row.extracted_char_count : documents.find(item => item.id === id)?.extracted_char_count || 0), 0) <= MAX_CROSS_CHARS - 1000 ? [...current, row.id] : current);
      setNotice(`已安全保存“${row.file_name}”，提取正文 ${row.extracted_char_count.toLocaleString()} 字。`);
    } catch (err) { setError(err instanceof Error ? err.message : "制度文件上传失败"); }
    finally { setUploading(false); }
  };

  const analyze = async () => {
    if (!selected || !confirmed) return;
    setAnalyzing(true); setError(""); setNotice("");
    try {
      const result = await request(`/api/policies/${selected.id}/analyze?organization_id=${encodeURIComponent(org.id)}`, {
        method: "POST", body: JSON.stringify({ confirm_external_transfer: true, regulation_material: regulationMaterial, regulation_source_url: regulationSourceUrl }),
      }) as Analysis & { quota?: Quota };
      setAnalysis(result);
      setQuota(result.quota || null);
      setAnalysisHistory(current => [result, ...current.filter(row => row.id !== result.id)]);
      setDocuments(current => current.map(row => row.id === selected.id ? { ...row, latest_analysis: result } : row));
      setConfirmed(false);
      setNotice(`分析完成，消耗 ${result.token_usage.toLocaleString()} tokens。建议由法务或内控负责人复核。`);
    } catch (err) { setError(err instanceof Error ? err.message : "AI 制度分析失败"); }
    finally { setAnalyzing(false); }
  };

  const toggleCrossPolicy = (id: string) => {
    setSelectedCrossPolicyIds(current => {
      if (current.includes(id)) return current.filter(value => value !== id);
      const row = documents.find(item => item.id === id);
      if (!row || current.length >= 20) return current;
      const nextChars = crossInputChars + row.extracted_char_count;
      if (nextChars > MAX_CROSS_CHARS - 1000) { setError(`所选范围接近 ${MAX_CROSS_CHARS.toLocaleString()} 字符上限，请缩小流程或制度范围。`); return current; }
      setError(""); return [...current, id];
    });
  };

  const toggleProcess = (id: string) => {
    setSelectedProcessIds(current => {
      if (current.includes(id)) return current.filter(value => value !== id);
      const row = processes.find(item => item.id === id);
      if (!row) return current;
      const nextChars = crossInputChars + row.estimated_source_chars;
      if (nextChars > MAX_CROSS_CHARS - 1000) { setError(`所选范围接近 ${MAX_CROSS_CHARS.toLocaleString()} 字符上限，请减少制度或流程后重试。`); return current; }
      setError(""); return [...current, id];
    });
  };

  const analyzeCrossScope = async () => {
    if (!crossConfirmed || !ready || selectedCrossPolicyIds.length < 2 || crossInputChars > MAX_CROSS_CHARS) return;
    setCrossAnalyzing(true); setError(""); setNotice("");
    try {
      const result = await request(`/api/policy-cross-analyses?organization_id=${encodeURIComponent(org.id)}`, {
        method: "POST", body: JSON.stringify({
          confirm_external_transfer: true,
          policy_document_ids: selectedCrossPolicyIds,
          process_ids: selectedProcessIds,
        }),
      }) as CrossAnalysis & { quota?: Quota };
      setCrossAnalysis(result);
      setCrossHistory(current => [result, ...current.filter(row => row.id !== result.id)]);
      setQuota(result.quota || null); setCrossConfirmed(false);
      setNotice(`交叉分析完成，覆盖 ${result.source_snapshot.filter(row => row.source_type === "policy").length} 份制度、${result.source_snapshot.filter(row => row.source_type === "process").length} 个流程，消耗 ${result.token_usage.toLocaleString()} tokens。`);
    } catch (err) { setError(err instanceof Error ? err.message : "制度间 AI 分析失败"); }
    finally { setCrossAnalyzing(false); }
  };

  const download = async (row: PolicyDocument) => {
    setError("");
    try {
      const response = await fetch(`${API}/api/policies/${row.id}/download?organization_id=${encodeURIComponent(org.id)}`, { credentials: "include", cache: "no-store" });
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.detail || "下载失败"); }
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement("a"); anchor.href = url; anchor.download = row.file_name; anchor.click();
      URL.revokeObjectURL(url);
    } catch (err) { setError(err instanceof Error ? err.message : "制度文件下载失败"); }
  };

  if (!canUse) return <div className="module-page"><div className="card policy-access-denied"><LockKeyhole/><h2>当前角色无权访问制度合规分析</h2><p>请联系公司经理或内控审计员。</p></div></div>;

  const views = [
    { id: "library" as const, number: "01", title: "公司制度库", detail: `${documents.length} 份制度`, icon: FileText },
    { id: "review" as const, number: "02", title: "AI 单份审阅", detail: selected ? selected.file_name : "选择制度分析", icon: Sparkles },
    { id: "cross" as const, number: "03", title: "制度间 AI 分析", detail: crossHistory.length ? `${crossHistory.length} 份交叉报告` : "检查制度与流程冲突", icon: GitBranch },
  ];

  return <div className="module-page policy-review-page">
    <header className="policy-review-header">
      <div><div className="section-kicker">INTERNAL POLICY · COMPLIANCE REVIEW</div><h1>制度合规分析</h1><p>管理公司制度，开展单份合规审阅，并交叉检查制度与业务流程的一致性。</p></div>
      <div className="policy-org-chip"><BookOpen size={15}/><span>{org.name}</span><small>{org.industry || "通用企业"}</small></div>
    </header>

    <nav className="policy-workspace-nav" aria-label="制度合规分析功能">
      {views.map(item => <button type="button" key={item.id} className={`policy-workspace-tab ${view === item.id ? "active" : ""}`} onClick={() => { setView(item.id); setError(""); }} aria-current={view === item.id ? "page" : undefined}>
        <span className="policy-workspace-number">{item.number}</span><span className="policy-workspace-icon"><item.icon size={17}/></span><span className="policy-workspace-label"><b>{item.title}</b><small title={item.detail}>{item.detail}</small></span>
      </button>)}
    </nav>

    <div className="policy-privacy-banner"><CircleAlert size={17}/><div><b>外发分析需逐次确认</b><p>制度原件保存在 MinIO，正文不复制到数据库。单份审阅会发送所选制度正文和法规索引摘要；交叉分析会发送本次所选制度正文及流程配置草稿至公司设置的 {settings?.provider || "AI 服务商"}（{settings?.model || "模型尚未配置"}）。确认前请核查服务商的数据处理政策。</p></div></div>

    {error && <div className="policy-alert error"><AlertTriangle size={16}/>{error}<button onClick={() => setError("")} aria-label="关闭"><X size={14}/></button></div>}
    {notice && <div className="policy-alert success"><Check size={16}/>{notice}</div>}

    {view === "library" && <div className="policy-library-layout">
      <section className="card policy-document-panel">
        <div className="policy-panel-heading"><div className="policy-panel-icon"><FileText size={18}/></div><div><h2>公司制度库</h2><p>统一保管公司现行制度原件，供单份审阅与交叉分析复用。</p></div><span className="policy-count-pill">{documents.length} 份</span></div>
        <div className="policy-library-toolbar"><span>支持 PDF、DOCX、TXT、Markdown；扫描 PDF 暂不支持 OCR。</span><button className="primary-btn policy-upload-btn" disabled={uploading} onClick={() => inputRef.current?.click()}>{uploading ? <><LoaderCircle size={16} className="spin"/>正在上传</> : <><Upload size={16}/>上传制度</>}</button></div>
        <input ref={inputRef} className="policy-file-input" type="file" accept=".pdf,.docx,.txt,.md,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain,text/markdown" onChange={upload}/>
        <div className="policy-document-note">单个文件最多 20 MB、正文最多 60,000 字。制度正文不写入数据库。</div>
        <div className="policy-document-list">
          {loading ? <div className="policy-list-empty"><LoaderCircle size={16} className="spin"/>正在读取制度列表…</div>
            : documents.length ? documents.map(row => <button type="button" key={row.id} className={`policy-document-row ${row.id === selectedId ? "selected" : ""}`} onClick={() => chooseDocument(row)}>
              <span className="policy-file-icon"><FileText size={17}/></span><span className="policy-file-copy"><b title={row.file_name}>{row.file_name}</b><small>{row.extracted_char_count.toLocaleString()} 字 · {(row.size_bytes / 1024).toFixed(0)} KB · {formatDate(row.created_at)}</small></span>
              <span className={`policy-document-status ${row.latest_analysis ? "reviewed" : "pending"}`}>{row.latest_analysis ? "已审阅" : "待审阅"}</span>
            </button>) : <div className="policy-list-empty"><FileText size={18}/><span>还没有公司制度。上传后可启动单份审阅，也可与其他制度和流程做交叉分析。</span></div>}
        </div>
      </section>
      <aside className="card policy-library-aside"><div className="policy-panel-heading"><div className="policy-panel-icon analysis"><Layers3 size={18}/></div><div><h2>制度工作区</h2><p>制度文件作为后续分析的统一来源。</p></div></div>
        <div className="policy-library-stat"><span>已上传制度</span><b>{documents.length}</b></div>
        <div className="policy-library-stat"><span>已有单份审阅报告</span><b>{documents.filter(row => row.latest_analysis).length}</b></div>
        <div className="policy-library-stat"><span>可纳入交叉分析的流程</span><b>{processes.length}</b></div>
        <div className="policy-storage-note"><BookOpen size={16}/><span>文件原件保存在公司私有 MinIO 存储中，页面中的制度选择只引用现有文件，不复制或重复上传。</span></div>
        <button type="button" className="outline-btn policy-aside-action" onClick={() => setView("review")}>前往 AI 单份审阅 <Sparkles size={14}/></button>
        <button type="button" className="outline-btn policy-aside-action" onClick={() => setView("cross")}>前往制度间 AI 分析 <GitBranch size={14}/></button>
      </aside>
    </div>}

    {view === "review" && <>
      <section className="card policy-analysis-panel policy-single-review">
        <div className="policy-panel-heading"><div className="policy-panel-icon analysis"><Sparkles size={18}/></div><div><h2>AI 单份审阅</h2><p>选择一份公司制度，使用公司已配置的 AI 服务商和模型进行分析。</p></div></div>
        {!ready && <div className="policy-ai-unconfigured"><div><Settings2 size={16}/><b>需要先配置 AI 服务商和模型</b><small>由公司经理在“系统设置 → AI 内控助手”配置公司采购的模型与 Token。</small></div><button type="button" className="outline-btn" onClick={onOpenSettings}>打开设置</button></div>}
        {selected ? <>
          <div className="policy-review-controls"><label htmlFor="policy-review-document">选择制度</label><select id="policy-review-document" value={selectedId} onChange={event => chooseDocumentId(event.target.value)}>{documents.map(row => <option value={row.id} key={row.id}>{row.file_name}</option>)}</select><button type="button" className="policy-icon-button" title="下载原文件" onClick={() => download(selected)}><ArrowDownToLine size={15}/></button></div>
          <div className="policy-analysis-meta"><span><Scale size={14}/>公司行业法规索引</span><span>{analysis ? `当前报告 ${formatDate(analysis.created_at)}` : "该制度尚未审阅"}</span><span>模型：{settings?.provider || "未配置"} / {settings?.model || "未配置"}</span></div>
          {analysisHistory.length > 1 && <label className="policy-history-select">审阅历史<select value={analysis?.id || ""} onChange={event => setAnalysis(analysisHistory.find(row => row.id === event.target.value) || null)}>{analysisHistory.map((row, index) => <option value={row.id} key={row.id}>{formatDate(row.created_at)} · 第 {analysisHistory.length - index} 次</option>)}</select></label>}
          {quota && <div className="policy-quota">{quota.is_unlimited ? `系统管理员本月已用 ${quota.used_tokens.toLocaleString()} tokens · 不限额` : `本月 AI 额度：已用 ${quota.used_tokens.toLocaleString()} / ${(quota.effective_limit_tokens ?? 0).toLocaleString()} · 剩余 ${(quota.remaining_tokens ?? 0).toLocaleString()} tokens`}</div>}
          <div className="policy-law-material"><label htmlFor="policy-law-excerpt">补充法规原文或官方摘录（可选）</label><textarea id="policy-law-excerpt" rows={4} maxLength={20000} value={regulationMaterial} onChange={event => setRegulationMaterial(event.target.value)} disabled={analyzing} placeholder="可从法规索引的官方链接复制相关条文，帮助 AI 对照具体要求；不要粘贴无权外传的内容。"/><div className="policy-law-counter">{regulationMaterial.length.toLocaleString()} / 20,000 字符</div><input type="url" maxLength={500} value={regulationSourceUrl} onChange={event => setRegulationSourceUrl(event.target.value)} disabled={analyzing} placeholder="可选：官方法规来源链接（仅接受 HTTPS .gov.cn）"/><small>系统不会打开该链接；粘贴的法规材料和链接在报告中均标记为未核验。</small></div>
          <div className="policy-consent-box"><label><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)} disabled={!ready || analyzing}/><span>我确认将“{selected.file_name}”的完整提取正文、行业法规索引摘要，以及填写的法规摘录/链接（如有）发送至 <b>{settings?.provider || "公司 AI 服务商"}</b>（{settings?.model || "未配置模型"}），并已了解服务商的数据处理政策。</span></label><small>AI 不会自动访问法规网站全文；报告及 Token 用量会保存到本公司工作区。</small></div>
          <button type="button" className="primary-btn policy-analyze-btn" disabled={!ready || !confirmed || analyzing} onClick={analyze}>{analyzing ? <><LoaderCircle size={16} className="spin"/>正在审阅制度</> : <><Sparkles size={16}/>开始 AI 审阅</>}</button>
        </> : <div className="policy-empty-analysis"><ShieldAlert size={24}/><b>制度库还没有可审阅文件</b><span>先上传公司制度，再回来选择文件。</span><button type="button" className="outline-btn" onClick={() => setView("library")}>前往公司制度库</button></div>}
      </section>
      {analysis && selected && <PolicyReport key={analysis.id} analysis={analysis} />}
      <div className="policy-review-disclaimer"><CircleAlert size={15}/><span>AI 输出属于工作草案，不是法律意见。系统法规索引不是完整法规库，也未实时抓取或核验法规原文；请由公司法务/内控负责人复核后再修订制度。</span></div>
    </>}

    {view === "cross" && <>
      <div className="policy-cross-intro"><div><div className="section-kicker">CROSS-POLICY & PROCESS REVIEW</div><h2>制度间 AI 分析</h2><p>把不同制度与业务流程放在同一上下文中，重点寻找互相冲突、执行口径不一致、责任断点和重复规定。</p></div><span className="policy-cross-limit">单次输入上限 {MAX_CROSS_CHARS.toLocaleString()} 字符</span></div>
      <div className="policy-cross-grid">
        <section className="card policy-source-panel">
          <div className="policy-panel-heading"><div className="policy-panel-icon"><FileText size={18}/></div><div><h2>选择制度文件</h2><p>至少选择两份；最多 20 份。</p></div><span className="policy-count-pill">{selectedCrossPolicyIds.length} / 20</span></div>
          <div className="policy-source-list">{loading ? <div className="policy-list-empty"><LoaderCircle size={16} className="spin"/>正在读取制度…</div> : documents.length ? documents.map(row => <label className="policy-source-row" key={row.id}><input type="checkbox" checked={selectedCrossPolicyIds.includes(row.id)} onChange={() => toggleCrossPolicy(row.id)} disabled={crossAnalyzing || (!selectedCrossPolicyIds.includes(row.id) && (selectedCrossPolicyIds.length >= 20 || crossInputChars + row.extracted_char_count > MAX_CROSS_CHARS - 1000))}/><span><b title={row.file_name}>{row.file_name}</b><small>{row.extracted_char_count.toLocaleString()} 字 · {row.latest_analysis ? "已有单份报告" : "尚无单份报告"}</small></span></label>) : <div className="policy-list-empty">制度库为空；请先上传至少两份制度文件。</div>}</div>
          <div className="policy-panel-heading policy-process-heading"><div className="policy-panel-icon analysis"><GitBranch size={18}/></div><div><h2>纳入业务流程</h2><p>对照当前流程草稿；同时参考已发布版本号和制度关联。</p></div><span className="policy-count-pill">{selectedProcessIds.length} / {processes.length}</span></div>
          <div className="policy-source-list policy-process-list">{processes.length ? processes.map(row => <label className="policy-source-row" key={row.id}><input type="checkbox" checked={selectedProcessIds.includes(row.id)} onChange={() => toggleProcess(row.id)} disabled={crossAnalyzing || (!selectedProcessIds.includes(row.id) && crossInputChars + row.estimated_source_chars > MAX_CROSS_CHARS - 1000)}/><span><b>{row.code} · {row.name}</b><small>{row.has_configuration ? `草稿 v${row.revision} · ${row.published_revision ? `已发布 v${row.published_revision}` : "尚未发布"}` : "尚无流程配置"}{row.linked_policy_references.length ? ` · 关联 ${row.linked_policy_references.length} 份制度` : ""}</small></span></label>) : <div className="policy-list-empty">当前公司还没有启用中的业务流程。</div>}</div>
        </section>

        <section className="card policy-cross-run-panel">
          <div className="policy-panel-heading"><div className="policy-panel-icon analysis"><Sparkles size={18}/></div><div><h2>交叉检查与历史报告</h2><p>AI 使用系统设置中当前配置的模型。</p></div></div>
          <div className="policy-cross-scope-summary"><div><span>制度</span><b>{selectedCrossPolicyIds.length} 份</b></div><div><span>流程</span><b>{selectedProcessIds.length} 个</b></div><div><span>输入规模估算</span><b className={crossInputChars > MAX_CROSS_CHARS ? "over-limit" : ""}>{crossInputChars.toLocaleString()} 字符</b></div></div>
          <div className="policy-ai-model-card"><Sparkles size={16}/><span><b>{settings?.provider || "尚未配置服务商"} · {settings?.model || "尚未配置模型"}</b><small>来源：系统设置 → AI 内控助手</small></span>{!ready && <button type="button" className="outline-btn" onClick={onOpenSettings}>配置</button>}</div>
          {quota && <div className="policy-quota">{quota.is_unlimited ? `系统管理员本月已用 ${quota.used_tokens.toLocaleString()} tokens · AI 使用不限额` : `本月剩余 ${(quota.remaining_tokens ?? 0).toLocaleString()} tokens · 当前模型调用按实际或估算用量计入个人额度`}</div>}
          {crossHistory.length > 0 && <label className="policy-history-select">历史交叉分析<select value={crossAnalysis?.id || ""} onChange={event => setCrossAnalysis(crossHistory.find(row => row.id === event.target.value) || null)}>{crossHistory.map(row => <option value={row.id} key={row.id}>{formatDate(row.created_at)} · {row.source_snapshot.filter(item => item.source_type === "policy").length} 份制度 / {row.source_snapshot.filter(item => item.source_type === "process").length} 个流程</option>)}</select></label>}
          <div className="policy-consent-box policy-cross-consent"><label><input type="checkbox" checked={crossConfirmed} onChange={event => setCrossConfirmed(event.target.checked)} disabled={!ready || crossAnalyzing}/><span>我确认将本次选中的 <b>{selectedCrossPolicyIds.length} 份制度全文</b>、<b>{selectedProcessIds.length} 个流程草稿配置</b>发送至 <b>{settings?.provider || "公司 AI 服务商"}</b>（{settings?.model || "未配置模型"}）进行交叉分析，并已核查服务商的数据处理政策。</span></label><small>每次分析都需重新确认。制度全文只在本次调用时读取，不写入交叉分析记录。</small></div>
          <button type="button" className="primary-btn policy-analyze-btn" disabled={!ready || !crossConfirmed || selectedCrossPolicyIds.length < 2 || crossInputChars > MAX_CROSS_CHARS || crossAnalyzing} onClick={analyzeCrossScope}>{crossAnalyzing ? <><LoaderCircle size={16} className="spin"/>正在对照制度与流程</> : <><GitBranch size={16}/>开始制度间 AI 分析</>}</button>
          {selectedCrossPolicyIds.length < 2 && <div className="policy-cross-hint"><AlertTriangle size={14}/>至少勾选两份制度后才可分析。</div>}
          {crossInputChars > MAX_CROSS_CHARS && <div className="policy-cross-hint over-limit"><AlertTriangle size={14}/>当前范围超过单次输入上限，请减少制度或流程。</div>}
          {!ready && <div className="policy-cross-hint"><Settings2 size={14}/>请先配置公司 AI 服务商、模型和 Token。</div>}
        </section>
      </div>
      {crossAnalysis && <CrossAnalysisReport key={crossAnalysis.id} analysis={crossAnalysis} />}
      <div className="policy-review-disclaimer"><CircleAlert size={15}/><span>交叉分析只覆盖报告记录的所选制度和流程。流程材料为当前保存的配置草稿，不代表生产中的实际审批行为。AI 输出是供人工核实的工作草案；确认差异后，再由制度负责人和流程负责人协同修订并履行公司审批。</span></div>
    </>}
  </div>;
}

function CrossAnalysisReport({ analysis }: { analysis: CrossAnalysis }) {
  const report = analysis.result;
  const labels = new Map(analysis.source_snapshot.map(source => [`${source.source_type}:${source.id}`, source.name]));
  const conflictTypeLabels: Record<string, string> = { policy_policy: "制度与制度", policy_process: "制度与流程", process_process: "流程与流程", policy_gap: "制度缺口", process_gap: "流程缺口" };
  return <section className="card policy-report policy-cross-report">
    <div className="policy-report-heading"><div><div className="section-kicker">CROSS-ANALYSIS REPORT</div><h2>制度与流程一致性报告</h2><p>{formatDate(analysis.created_at)} · {analysis.provider} / {analysis.model} · {analysis.token_usage.toLocaleString()} tokens{analysis.usage_estimated ? "（估算）" : ""} · 输入 {analysis.input_char_count.toLocaleString()} 字符</p></div><span className={`policy-severity-badge ${report.overall_severity}`}>总体风险：{severityLabels[report.overall_severity] || "待评估"}</span></div>
    <div className="policy-cross-sources"><b>本报告依据</b><div>{analysis.source_snapshot.map(source => <span className="policy-source-chip" key={`${source.source_type}:${source.id}`}><i>{source.source_type === "policy" ? <FileText size={12}/> : <GitBranch size={12}/>}</i>{source.name}{source.source_type === "process" && ` · 草稿 v${source.configuration_revision ?? 0}`}</span>)}</div></div>
    <div className="policy-summary"><b>总体判断</b><p>{report.summary}</p></div>
    {report.format_warning && <div className="policy-format-warning"><AlertTriangle size={15}/>{report.format_warning}</div>}
    {!!report.conflicts?.length ? <div className="policy-findings"><div className="policy-report-section-title"><ShieldAlert size={16}/><h3>发现的不一致与缺口 <span>{report.conflicts.length}</span></h3></div>{report.conflicts.map((finding, index) => <article className="policy-finding-card policy-cross-finding" key={`${index}-${finding.title}`}>
      <div className="policy-finding-top"><span className="policy-finding-number">{String(index + 1).padStart(2, "0")}</span><h4>{finding.title}</h4><span className="policy-conflict-type">{conflictTypeLabels[finding.conflict_type] || "交叉检查"}</span><span className={`policy-severity-badge ${finding.severity}`}>{severityLabels[finding.severity]}</span></div>
      <div className="policy-conflict-sources"><b>涉及来源</b><div>{finding.source_refs.map(source => <span key={`${source.source_type}:${source.source_id}`}>{source.source_type === "policy" ? <FileText size={12}/> : <GitBranch size={12}/>} {labels.get(`${source.source_type}:${source.source_id}`) || "来源已记录"}</span>)}</div></div>
      {!!finding.evidence.length && <div className="policy-conflict-evidence">{finding.evidence.map((item, evidenceIndex) => <blockquote key={`${item.source_id}-${evidenceIndex}`}><small>{labels.get(`${item.source_type}:${item.source_id}`) || "来源摘录"}</small>“{item.excerpt}”</blockquote>)}</div>}
      <div className="policy-finding-columns"><div><b>差异说明</b><p>{finding.conflict_reason || "—"}</p></div><div><b>潜在影响</b><p>{finding.risk || "—"}</p></div></div>
      <div className="policy-recommendation"><b>优化建议</b><p>{finding.recommendation || "—"}</p>{finding.suggested_resolution && <><b>建议统一口径</b><p>{finding.suggested_resolution}</p></>}<small>模型判断置信度：{severityLabels[finding.confidence] || "低"}</small></div>
    </article>)}</div> : <div className="policy-cross-no-findings"><Check size={18}/><div><b>本次没有生成明确冲突项</b><span>仍需由制度与流程负责人确认所选资料完整，且报告结论只适用于本次选定范围。</span></div></div>}
    {!!report.quick_wins?.length && <div className="policy-positive-list"><b><Check size={15}/>可先处理的优化事项</b><ul>{report.quick_wins.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
    {!!report.open_questions?.length && <div className="policy-open-questions"><b>建议进一步确认</b><ul>{report.open_questions.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
    <div className="policy-report-foot"><Layers3 size={14}/>{report.scope_note || "报告范围以本次选中的制度及流程版本为准；AI 结论需人工复核。"}</div>
  </section>;
}

function PolicyReport({ analysis }: { analysis: Analysis }) {
  const report = readablePolicyReport(analysis.result);
  return <section className="card policy-report">
    <div className="policy-report-heading"><div><div className="section-kicker">AI REVIEW REPORT</div><h2>制度风险与改进建议</h2><p>{formatDate(analysis.created_at)} · {analysis.provider} / {analysis.model} · {analysis.token_usage.toLocaleString()} tokens{analysis.usage_estimated ? "（估算）" : ""}</p></div><span className={`policy-severity-badge ${report.overall_severity}`}>总体风险：{severityLabels[report.overall_severity] || "待评估"}</span></div>
    <div className="policy-summary"><b>总体判断</b><p>{report.summary}</p></div>
    {report.format_warning && <div className="policy-format-warning"><AlertTriangle size={15}/>{report.format_warning}</div>}
    {!!report.findings?.length && <div className="policy-findings"><div className="policy-report-section-title"><ShieldAlert size={16}/><h3>发现的风险点 <span>{report.findings.length}</span></h3></div>{report.findings.map((finding, index) => <article className="policy-finding-card" key={`${index}-${finding.title}`}>
      <div className="policy-finding-top"><span className="policy-finding-number">{String(index + 1).padStart(2, "0")}</span><h4>{finding.title}</h4><span className={`policy-severity-badge ${finding.severity}`}>{severityLabels[finding.severity]}</span></div>
      {finding.policy_excerpt && <blockquote>制度原文：“{finding.policy_excerpt}”</blockquote>}
      <div className="policy-finding-columns"><div><b>潜在风险</b><p>{finding.risk || "—"}</p></div><div><b>法规差距/待核事项</b><p>{finding.regulatory_gap || "—"}</p></div></div>
      <div className="policy-recommendation"><b>建议修改与实施</b><p>{finding.recommendation || "—"}</p><small>模型判断置信度：{severityLabels[finding.confidence] || "低"}</small></div>
      {!!finding.law_references?.length && <div className="policy-citations"><b>系统法规索引来源</b>{finding.law_references.map(law => <a href={law.source_url} key={law.id} target="_blank" rel="noreferrer"><span>{law.title}<small>{law.authority} · {law.scope_note}</small></span><BookOpen size={14}/></a>)}</div>}
    </article>)}</div>}
    {!!report.positive_controls?.length && <div className="policy-positive-list"><b><Check size={15}/>已有较好做法</b><ul>{report.positive_controls.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
    {!!report.open_questions?.length && <div className="policy-open-questions"><b>建议补充确认</b><ul>{report.open_questions.map((item,index)=><li key={index}>{item}</li>)}</ul></div>}
    {report.raw_report && <div className="policy-raw-report">{report.raw_report}</div>}
    {report.supplementary_law_source && <div className="policy-supplementary-source"><BookOpen size={14}/><span>用户补充法规材料：{report.supplementary_law_source.material_char_count.toLocaleString()} 字符 · 系统未核验</span>{report.supplementary_law_source.url && <a href={report.supplementary_law_source.url} target="_blank" rel="noreferrer">打开来源 <BookOpen size={12}/></a>}</div>}
    <div className="policy-report-foot"><Scale size={14}/>法规索引核对日期：{report.regulation_index_checked_on || "—"} · {report.official_text_fetched ? "已获取官方原文" : "未实时获取官方原文"} · AI 结论需人工复核。</div>
  </section>;
}
