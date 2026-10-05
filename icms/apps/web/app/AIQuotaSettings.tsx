"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Check, CircleAlert, LoaderCircle, Save } from "lucide-react";

 type SettingsOrganization = { id: string };
type MemberQuota = {
  user_id: string; full_name: string; email: string; role: string; is_active: boolean;
  is_system_admin: boolean; is_unlimited: boolean;
  period_start: string; monthly_limit_tokens: number | null; approved_extra_tokens: number;
  effective_limit_tokens: number | null; used_tokens: number; reserved_tokens: number; remaining_tokens: number | null;
};
type QuotaRequest = {
  id: string; user_id: string; full_name: string; email: string; period_start: string;
  requested_tokens: number; approved_tokens: number; reason: string; status: "pending" | "approved" | "rejected";
  review_note?: string | null; created_at: string;
};

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, { ...init, credentials: "include", cache: "no-store", headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `请求失败 (${response.status})`);
  return data;
}
const tokenCount = (value: number) => new Intl.NumberFormat("zh-CN").format(value);

export default function AIQuotaSettings({ org }: { org: SettingsOrganization }) {
  const [members, setMembers] = useState<MemberQuota[]>([]);
  const [requests, setRequests] = useState<QuotaRequest[]>([]);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [grantDrafts, setGrantDrafts] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    const organizationId = encodeURIComponent(org.id);
    const [memberRows, requestRows] = await Promise.all([
      request(`/api/ai/quotas?organization_id=${organizationId}`),
      request(`/api/ai/quota-requests?organization_id=${organizationId}`),
    ]) as [MemberQuota[], QuotaRequest[]];
    setMembers(memberRows);
    setRequests(requestRows);
    setDrafts(Object.fromEntries(memberRows.filter(row => !row.is_unlimited).map(row => [row.user_id, String(row.monthly_limit_tokens ?? 2_000_000)])));
    setGrantDrafts(Object.fromEntries(requestRows.map(row => [row.id, String(row.requested_tokens)])));
  }, [org.id]);

  useEffect(() => { setError(""); setNotice(""); load().catch(err => setError(err instanceof Error ? err.message : "额度数据读取失败")); }, [load]);

  const saveQuota = async (member: MemberQuota) => {
    if (member.is_unlimited) return;
    const value = Number(drafts[member.user_id]);
    if (!Number.isSafeInteger(value) || value < 0 || value > 100_000_000) { setError("额度请输入 0 到 100,000,000 之间的整数。"); return; }
    setBusy(member.user_id); setError(""); setNotice("");
    try {
      await request(`/api/ai/quotas/${member.user_id}?organization_id=${encodeURIComponent(org.id)}`, { method: "PUT", body: JSON.stringify({ monthly_limit_tokens: value }) });
      await load(); setNotice(`已更新 ${member.full_name} 的每月 Token 额度。`);
    } catch (err) { setError(err instanceof Error ? err.message : "额度保存失败"); }
    finally { setBusy(""); }
  };

  const review = async (item: QuotaRequest, approved: boolean) => {
    const grant = Number(grantDrafts[item.id] ?? item.requested_tokens);
    if (approved && (!Number.isSafeInteger(grant) || grant < 1000 || grant > item.requested_tokens)) { setError("批准额度须在 1,000 至申请数量之间。"); return; }
    setBusy(item.id); setError(""); setNotice("");
    try {
      await request(`/api/ai/quota-requests/${item.id}?organization_id=${encodeURIComponent(org.id)}`, {
        method: "PATCH", body: JSON.stringify({ approved, approved_tokens: approved ? grant : 0, review_note: "" }),
      });
      await load(); setNotice(approved ? `已批准 ${item.full_name} 的额度申请。` : `已驳回 ${item.full_name} 的额度申请。`);
    } catch (err) { setError(err instanceof Error ? err.message : "额度申请处理失败"); }
    finally { setBusy(""); }
  };

  const pending = requests.filter(item => item.status === "pending");
  return <section className="card ai-quota-admin">
    <div className="ai-quota-admin-head"><div><div className="section-kicker">AI USAGE CONTROL</div><h2>成员 AI Token 额度</h2><p>按自然月统计；普通成员默认每月 2,000,000 tokens，系统管理员不限额。AI 助手仍按角色授权（公司经理、审计员）。追加额度仅在本月有效。</p></div><button className="outline-btn" type="button" onClick={() => load().catch(err => setError(err.message))} disabled={!!busy}><LoaderCircle size={14} className={busy ? "spin" : ""}/>刷新</button></div>
    {error && <div className="form-error ai-quota-message"><AlertTriangle size={14}/>{error}</div>}
    {notice && <div className="settings-note ai-quota-message"><Check size={14}/><span>{notice}</span></div>}
    <div className="ai-quota-member-list">{members.map(member => {
      const percent = member.effective_limit_tokens ? Math.min(100, member.used_tokens / member.effective_limit_tokens * 100) : 0;
      return <article className="ai-quota-member" key={member.user_id}>
        <div className="ai-quota-person"><b>{member.full_name}</b><span>{member.email} · {member.is_system_admin ? "系统管理员" : member.role}{member.is_active ? "" : " · 已停用"}</span></div>
        <div className="ai-quota-meter"><div className="ai-quota-numbers"><span>本月已用 {tokenCount(member.used_tokens)} tokens{member.is_unlimited ? " · 不限额" : ` / ${tokenCount(member.effective_limit_tokens ?? 0)} tokens`}</span><small>{member.is_unlimited ? "系统管理员不限额" : `剩余 ${tokenCount(member.remaining_tokens ?? 0)}${member.approved_extra_tokens ? `（含追加 ${tokenCount(member.approved_extra_tokens)}）` : ""}`}</small></div>{!member.is_unlimited && <div className="ai-quota-track"><i style={{ width: `${percent}%` }}/></div>}</div>
        {!member.is_unlimited && <><label className="ai-quota-edit">每月额度<input type="number" min="0" max="100000000" step="1000" value={drafts[member.user_id] ?? member.monthly_limit_tokens ?? 2_000_000} onChange={event => setDrafts(current => ({ ...current, [member.user_id]: event.target.value }))}/></label>
        <button className="outline-btn ai-quota-save" type="button" onClick={() => saveQuota(member)} disabled={busy === member.user_id || !!busy}><Save size={13}/>{busy === member.user_id ? "保存中" : "保存"}</button></>}
      </article>;
    })}{!members.length && <p className="ai-quota-empty">当前公司暂无成员额度记录。</p>}</div>
    <div className="ai-quota-requests-head"><div><h3>追加额度申请</h3><p>待审批 {pending.length} 条</p></div></div>
    <div className="ai-quota-request-list">{requests.map(item => <article className={`ai-quota-request ${item.status}`} key={item.id}>
      <div className="ai-quota-request-content"><div><b>{item.full_name}</b><span>{item.email} · 申请 {tokenCount(item.requested_tokens)} tokens · {item.period_start.slice(0, 7)}</span></div><p>{item.reason}</p>{item.review_note && <small>审批说明：{item.review_note}</small>}</div>
      {item.status === "pending" ? <div className="ai-quota-request-actions"><label className="ai-quota-grant">批准数量<input type="number" min="1000" max={item.requested_tokens} step="1000" value={grantDrafts[item.id] ?? item.requested_tokens} onChange={event => setGrantDrafts(current => ({ ...current, [item.id]: event.target.value }))}/></label><button className="primary-btn compact" type="button" onClick={() => review(item, true)} disabled={!!busy}><Check size={13}/>批准</button><button className="outline-btn" type="button" onClick={() => review(item, false)} disabled={!!busy}><AlertTriangle size={13}/>驳回</button></div> : <span className={`ai-quota-status ${item.status}`}>{item.status === "approved" ? `已批准 ${tokenCount(item.approved_tokens)}` : "已驳回"}</span>}
    </article>)}{!requests.length && <div className="ai-quota-empty"><CircleAlert size={15}/>本月还没有追加额度申请。</div>}</div>
  </section>;
}
