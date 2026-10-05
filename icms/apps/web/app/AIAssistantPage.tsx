"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, ArrowUp, BookOpen, Check, CircleAlert, LoaderCircle, LockKeyhole, MessageCircle, Network, Plus, Scale, Settings2, Sparkles, Trash2 } from "lucide-react";

type Organization = { id: string; name: string; industry?: string };
type ProcessRow = { id: string; code?: string; name: string; description?: string };
type RegulationRow = { id: string; title: string; source_url?: string };
type AISettings = { configured: boolean; provider?: string | null; model?: string | null };
type AIQuota = {
  period_start: string; is_unlimited: boolean; monthly_limit_tokens: number | null; approved_extra_tokens: number;
  effective_limit_tokens: number | null; used_tokens: number; reserved_tokens: number;
  remaining_tokens: number | null; can_request: boolean;
  pending_request: { id: string; requested_tokens: number; reason: string } | null;
};
type ChatMessage = { role: "user" | "assistant"; content: string };
type Task = "process_guidance" | "regulatory_update";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const processPrompts = [
  "请基于当前登记内容，指出这个流程最优先的控制缺口和整改顺序。",
  "结合最近检查发现和未关闭 Issue，给出责任人、期限、证据和复测标准。",
  "检查现有风险、控制目标、控制措施和 RCM 是否对应，并给出可执行的调整建议。",
];
const regulationPrompts = [
  "基于我提供的官方原文，梳理适用范围和对现有流程的影响。",
  "把法规变化拆成制度、岗位、控制、留痕和整改任务清单。",
];

async function request(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body) headers.set("Content-Type", "application/json");
  const response = await fetch(`${API}${path}`, { ...options, headers, credentials: "include", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `请求失败 (${response.status})`);
  return data;
}

export default function AIAssistantPage({ org, canUse, onOpenSettings }: { org: Organization; canUse: boolean; onOpenSettings: () => void }) {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [quota, setQuota] = useState<AIQuota | null>(null);
  const [quotaBlocked, setQuotaBlocked] = useState(false);
  const [requestedTokens, setRequestedTokens] = useState("5000");
  const [quotaReason, setQuotaReason] = useState("");
  const [quotaBusy, setQuotaBusy] = useState(false);
  const [quotaNotice, setQuotaNotice] = useState("");
  const [task, setTask] = useState<Task>("process_guidance");
  const [processes, setProcesses] = useState<ProcessRow[]>([]);
  const [regulations, setRegulations] = useState<RegulationRow[]>([]);
  const [processId, setProcessId] = useState("");
  const [regulationId, setRegulationId] = useState("");
  const [sourceMaterial, setSourceMaterial] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const transcriptEnd = useRef<HTMLDivElement>(null);
  const currentOrganizationId = useRef(org.id);

  useEffect(() => {
    let active = true;
    currentOrganizationId.current = org.id;
    setSettings(null); setProcesses([]); setRegulations([]); setProcessId(""); setRegulationId("");
    setSourceMaterial(""); setMessages([]); setDraft(""); setConfirmed(false); setError(""); setBusy(false); setQuota(null); setQuotaBlocked(false); setQuotaNotice("");
    Promise.all([
      request(`/api/ai/settings?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/ai/quota?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/compliance-library?organization_id=${encodeURIComponent(org.id)}`),
      request(`/api/processes?organization_id=${encodeURIComponent(org.id)}`),
    ]).then(([saved, quotaSnapshot, library, processRows]) => {
      if (!active) return;
      setSettings(saved as AISettings);
      setQuota(quotaSnapshot as AIQuota);
      setRegulations(library.regulations || []);
      setProcesses(processRows || []);
      setProcessId((processRows as ProcessRow[])[0]?.id || "");
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "AI 助手初始化失败"); });
    return () => { active = false; };
  }, [org.id]);

  useEffect(() => { transcriptEnd.current?.scrollIntoView({ behavior: "smooth", block: "end" }); }, [messages, busy]);

  const selectedProcess = processes.find(row => row.id === processId);
  const ready = !!settings?.configured;
  const clearConversation = () => { setMessages([]); setDraft(""); setConfirmed(false); setError(""); };
  const chooseTask = (next: Task) => {
    if (next === task) return;
    setTask(next); clearConversation(); setError("");
  };
  const chooseProcess = (id: string) => {
    if (id === processId) return;
    setProcessId(id); clearConversation();
  };

  const refreshQuota = async () => {
    const snapshot = await request(`/api/ai/quota?organization_id=${encodeURIComponent(org.id)}`) as AIQuota;
    if (currentOrganizationId.current === org.id) setQuota(snapshot);
    return snapshot;
  };

  const requestAdditionalQuota = async (event: FormEvent) => {
    event.preventDefault(); setQuotaBusy(true); setQuotaNotice(""); setError("");
    try {
      await request(`/api/ai/quota-requests?organization_id=${encodeURIComponent(org.id)}`, {
        method: "POST", body: JSON.stringify({ requested_tokens: Number(requestedTokens), reason: quotaReason }),
      });
      setQuotaReason(""); setQuotaBlocked(false); setQuotaNotice("额度申请已提交，等待公司管理员审批。");
      await refreshQuota();
    } catch (err) { setError(err instanceof Error ? err.message : "额度申请提交失败"); }
    finally { setQuotaBusy(false); }
  };

  const sendMessage = async (event?: FormEvent, suggestedText?: string) => {
    event?.preventDefault();
    const question = (suggestedText ?? draft).trim();
    if (question.length < 3 || !ready || !canUse || !confirmed || busy) return;
    if (task === "process_guidance" && !processId) return;
    setError(""); setDraft(""); setBusy(true);
    const requestOrganizationId = org.id;
    const previous = messages.slice(-8).map(message => ({ ...message, content: message.content.slice(0, 4000) }));
    const nextMessages: ChatMessage[] = [...messages, { role: "user" as const, content: question }].slice(-20);
    setMessages(nextMessages);
    try {
      const result = await request(`/api/ai/assist?organization_id=${encodeURIComponent(org.id)}`, {
        method: "POST",
        body: JSON.stringify({
          task,
          process_id: task === "process_guidance" ? processId : null,
          regulation_id: task === "regulatory_update" ? regulationId || null : null,
          question,
          source_material: task === "regulatory_update" ? sourceMaterial : "",
          conversation: previous,
          confirm_external_transfer: confirmed,
        }),
      });
      if (currentOrganizationId.current === requestOrganizationId) {
        setMessages(current => [...current, { role: "assistant" as const, content: result.answer }].slice(-20));
        if (result.quota) setQuota(result.quota as AIQuota);
        setQuotaBlocked(false);
      }
    } catch (err) {
      if (currentOrganizationId.current === requestOrganizationId) {
        const message = err instanceof Error ? err.message : "AI 请求失败，请检查设置和网络后重试。";
        setError(message);
        if (message.includes("Token 额度不足")) { setQuotaBlocked(true); void refreshQuota(); }
      }
    } finally { if (currentOrganizationId.current === requestOrganizationId) setBusy(false); }
  };

  const prompts = task === "process_guidance" ? processPrompts : regulationPrompts;
  const quotaPercent = quota?.effective_limit_tokens
    ? Math.min(100, quota.used_tokens / quota.effective_limit_tokens * 100)
    : 0;
  return <div className="module-page ai-page ai-chat-page">
    <div className="module-header"><div><div className="section-kicker">AI ASSISTED INTERNAL CONTROL</div><h1>AI 内控助手</h1><p>围绕公司现有流程对话，结合已登记风险、控制、检查发现和整改记录提出建议。</p></div><div className="ai-header-actions"><span className={`ai-status ${ready ? "ready" : ""}`}><i/>{ready ? `${settings?.provider} · ${settings?.model}` : "尚未连接模型"}</span><button className="outline-btn ai-settings-shortcut" onClick={onOpenSettings}><Settings2 size={14}/>模型设置</button></div></div>

    <div className="ai-disclosure"><CircleAlert size={17}/><div><b>发送前确认资料范围</b><span>流程对话会把公司行业、所选流程、关联风险/控制/RCM、检查测试、发现、Issue 和整改计划发送给已配置的第三方模型服务商；不会发送 Evidence 文件内容。请勿提交未脱敏个人信息或不应外传的机密资料。</span></div></div>

    {quota && <section className="card ai-quota-summary"><div className="ai-quota-summary-top"><div><b>个人本月 Token 用量</b><span>{quota.period_start.slice(0, 7)} · {quota.is_unlimited ? "系统管理员不限额" : "普通用户每月默认 2,000,000 tokens"}</span></div><strong>{quota.used_tokens.toLocaleString()} <small>/ {quota.is_unlimited ? "不限额" : (quota.effective_limit_tokens ?? 0).toLocaleString()}</small></strong></div>{!quota.is_unlimited && <div className="ai-quota-track"><i style={{ width: `${quotaPercent}%` }}/></div>}<div className="ai-quota-summary-bottom"><span>{quota.is_unlimited ? "系统管理员 AI 使用不限额" : `剩余 ${(quota.remaining_tokens ?? 0).toLocaleString()} tokens${quota.approved_extra_tokens ? `（含追加 ${quota.approved_extra_tokens.toLocaleString()}）` : ""}`}</span>{quota.pending_request && <span className="ai-quota-pending">追加额度申请处理中：{quota.pending_request.requested_tokens.toLocaleString()} tokens</span>}</div>{quotaNotice && <div className="ai-quota-notice"><Check size={14}/>{quotaNotice}</div>}{(quota.can_request || quotaBlocked) && !quota.is_unlimited && !quota.pending_request && canUse && <form className="ai-quota-request-form" onSubmit={requestAdditionalQuota}><div><b>额度不足？申请追加使用</b><span>说明本次申请用途，公司管理员审批后本月生效。</span></div><input aria-label="申请追加 Token 数量" type="number" min="1000" max="5000000" step="1000" value={requestedTokens} onChange={event => setRequestedTokens(event.target.value)} required/><input aria-label="申请理由" value={quotaReason} onChange={event => setQuotaReason(event.target.value)} placeholder="填写申请理由" minLength={5} maxLength={2000} required/><button className="outline-btn" type="submit" disabled={quotaBusy || quotaReason.trim().length < 5}>{quotaBusy ? <LoaderCircle size={14} className="spin"/> : <Plus size={14}/>}申请额度</button></form>}</section>}

    <section className="card ai-chat-shell">
      <div className="ai-chat-toolbar">
        <div className="ai-assist-title"><span className="ai-assist-icon"><Sparkles size={18}/></span><div><div className="section-kicker">PRIVATE TO YOUR CURRENT COMPANY</div><h2>内控工作对话</h2><p>建议仅作为草案；不会自动修改台账、创建发现或关闭整改。</p></div></div>
        <button className="outline-btn ai-clear-btn" onClick={clearConversation} disabled={busy || (messages.length === 0 && !draft)}><Trash2 size={14}/>清空对话</button>
      </div>

      <div className="ai-tabs" role="tablist" aria-label="对话任务">
        <button role="tab" aria-selected={task === "process_guidance"} className={task === "process_guidance" ? "active" : ""} onClick={() => chooseTask("process_guidance")} disabled={busy}><Network size={15}/>现有流程整改建议</button>
        <button role="tab" aria-selected={task === "regulatory_update"} className={task === "regulatory_update" ? "active" : ""} onClick={() => chooseTask("regulatory_update")} disabled={busy}><Scale size={15}/>法规影响分析</button>
      </div>

      {task === "process_guidance" ? <div className="ai-process-context">
        <label className="field-label"><span>选择公司现有流程</span><select value={processId} onChange={event => chooseProcess(event.target.value)} disabled={busy}><option value="">请选择要分析的流程</option>{processes.map(row => <option key={row.id} value={row.id}>{row.code ? `${row.code} · ` : ""}{row.name}</option>)}</select></label>
        {selectedProcess ? <div className="ai-context-summary"><b data-no-translate>{selectedProcess.code ? `${selectedProcess.code} · ` : ""}{selectedProcess.name}</b><span data-no-translate>{selectedProcess.description || "将结合该流程在数据库中的风险、控制、检查和整改记录生成建议。"}</span></div> : <div className="ai-context-summary muted">当前公司尚未登记业务流程。先在「业务流程」建立流程，再回来获取整改建议。</div>}
      </div> : <details className="ai-reference-panel">
        <summary><BookOpen size={14}/>法规分析资料与索引</summary>
        <div className="ai-reference-fields">
          <label className="field-label">关联法规索引<select value={regulationId} onChange={event => { setRegulationId(event.target.value); clearConversation(); }} disabled={busy}><option value="">不关联已收录条目</option>{regulations.map(row => <option key={row.id} value={row.id}>{row.title}</option>)}</select></label>
          <label className="field-label">官方来源原文/材料<textarea rows={5} value={sourceMaterial} onChange={event => { setSourceMaterial(event.target.value); setConfirmed(false); }} placeholder="粘贴主管部门官网公告或正式法规条文（最多 20,000 字符）。仅粘贴链接不会自动打开或检索网页。" disabled={busy}/></label>
        </div>
      </details>}

      <div className="ai-chat-transcript" role="log" aria-live="polite" aria-label="对话内容">
        {messages.length === 0 ? <div className="ai-chat-welcome"><span className="ai-assist-icon"><MessageCircle size={18}/></span><div><b>{task === "process_guidance" ? "从现有流程开始" : "讨论法规及流程影响"}</b><p>{task === "process_guidance" ? "选择流程后，我会先读取系统当前记录。你可以询问控制缺口、检查发现整改方案、抽样和复测标准。" : "提供法规原文或选择已收录索引，再提出你要核实的问题。未提供原文时，我会把法规内容标为待核实。"}</p></div></div> : messages.map((message, index) => <div className={`ai-chat-message ${message.role}`} key={`${index}-${message.role}`}><span className="ai-chat-avatar">{message.role === "assistant" ? <Sparkles size={14}/> : "你"}</span><div className="ai-chat-bubble"><div className="ai-chat-speaker">{message.role === "assistant" ? "AI 内控助手 · 建议草案" : "你"}</div><div className="ai-chat-content" data-no-translate>{message.content}</div>{message.role === "assistant" && <div className="ai-chat-review"><CircleAlert size={13}/>请由流程负责人/内控人员核验后再决定是否采纳。</div>}</div></div>)}
        {busy && <div className="ai-chat-message assistant"><span className="ai-chat-avatar"><Sparkles size={14}/></span><div className="ai-chat-bubble ai-thinking"><LoaderCircle size={14} className="spin"/>正在读取流程现状并生成建议…</div></div>}
        <div ref={transcriptEnd}/>
      </div>

      {messages.length === 0 && <div className="ai-quick-prompts"><span>可以这样问</span>{prompts.map(prompt => <button key={prompt} type="button" onClick={() => setDraft(prompt)} disabled={busy || (task === "process_guidance" && !processId)}>{prompt}</button>)}</div>}
      {task === "regulatory_update" && <p className="ai-source-footnote">已配置法规索引：{regulations.length} 条。模型不会自动浏览网页或核实法规现行状态。</p>}
      {error && <div className="form-error ai-error"><AlertTriangle size={15}/>{error}</div>}
      {!canUse && <div className="ai-manager-note"><LockKeyhole size={16}/>当前角色无权调用模型；请由公司经理或内控审计员操作。模型 Token 由公司自行采购。</div>}
      {!ready && <div className="ai-unconfigured"><span><Settings2 size={16}/><b>先在「系统设置」配置 AI 服务商和公司自己的 Token</b></span><button className="outline-btn" onClick={onOpenSettings}>打开系统设置</button></div>}

      <form className="ai-chat-composer" onSubmit={event => sendMessage(event)}>
        <textarea value={draft} onChange={event => setDraft(event.target.value)} rows={3} maxLength={4000} disabled={!ready || !canUse || busy} placeholder={task === "process_guidance" ? "继续追问当前流程，例如：把高优先级整改拆成 30 天实施计划……" : "提出法规核验或影响分析问题……"}/>
        <div className="ai-chat-composer-bottom"><span>{draft.length}/4000</span><button className="primary-btn ai-send-btn" disabled={!ready || !canUse || !confirmed || busy || draft.trim().length < 3 || (task === "process_guidance" && !processId)}>{busy ? <><LoaderCircle size={15} className="spin"/>生成中</> : <>发送 <ArrowUp size={15}/></>}</button></div>
      </form>
      <label className="ai-consent"><input type="checkbox" checked={confirmed} onChange={event => setConfirmed(event.target.checked)}/><span>我确认本对话中选择的公司流程记录、历史消息及我输入的内容可发送至第三方 AI 服务商，并自行承担服务商 Token 费用。修改流程/法规资料、切换任务或清空对话后需重新确认。</span></label>
    </section>
    <div className="ai-chat-storage-note"><CircleAlert size={14}/>对话只保留在当前页面内存中，刷新或离开页面后不会保存；模型回答不是法律意见，也不代表系统已执行整改。</div>
  </div>;
}
