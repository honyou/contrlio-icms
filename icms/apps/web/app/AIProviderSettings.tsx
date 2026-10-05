"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { AlertTriangle, Check, CircleAlert, ExternalLink, Globe2, LoaderCircle, LockKeyhole, Settings2, Trash2, Wifi } from "lucide-react";

type SettingsOrganization = { id: string };
type AISettings = { configured: boolean; provider?: string | null; protocol?: string | null; base_url?: string | null; model?: string | null; api_key_masked?: string | null };
type Preset = { label: string; group: string; protocol: string; base: string; hint: string; docs: string; note: string };

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const presets: Record<string, Preset> = {
  openai: { label: "OpenAI", group: "国际服务商", protocol: "openai-responses", base: "https://api.openai.com/v1", hint: "例如 gpt-5 或你的可用模型", docs: "https://platform.openai.com/docs/api-reference/responses", note: "Responses API，服务端默认关闭存储。" },
  anthropic: { label: "Anthropic Claude", group: "国际服务商", protocol: "anthropic", base: "https://api.anthropic.com", hint: "例如 claude-sonnet-4-5", docs: "https://docs.anthropic.com/en/api/messages", note: "Messages API，使用 x-api-key。" },
  gemini: { label: "Google Gemini", group: "国际服务商", protocol: "google-gemini", base: "https://generativelanguage.googleapis.com/v1beta", hint: "例如 gemini-2.5-flash", docs: "https://ai.google.dev/api/generate-content", note: "Gemini 原生 generateContent 接口。" },
  mistral: { label: "Mistral AI", group: "国际服务商", protocol: "openai-compatible", base: "https://api.mistral.ai/v1", hint: "例如 mistral-large-latest", docs: "https://docs.mistral.ai/api/", note: "OpenAI Chat Completions 兼容接口。" },
  groq: { label: "Groq", group: "国际服务商", protocol: "openai-compatible", base: "https://api.groq.com/openai/v1", hint: "例如 llama-3.3-70b-versatile", docs: "https://console.groq.com/docs/openai", note: "OpenAI Chat Completions 兼容接口。" },
  openrouter: { label: "OpenRouter", group: "聚合网关", protocol: "openai-compatible", base: "https://openrouter.ai/api/v1", hint: "例如 openai/gpt-5 或 anthropic/claude…", docs: "https://openrouter.ai/docs/api-reference/overview", note: "一个 Token 切换多个上游模型。" },
  deepseek: { label: "DeepSeek", group: "中国服务商", protocol: "openai-compatible", base: "https://api.deepseek.com", hint: "例如 deepseek-chat", docs: "https://api-docs.deepseek.com/", note: "OpenAI Chat Completions 兼容接口。" },
  qwen: { label: "阿里云百炼 / 通义千问", group: "中国服务商", protocol: "openai-compatible", base: "https://dashscope.aliyuncs.com/compatible-mode/v1", hint: "例如 qwen-plus", docs: "https://help.aliyun.com/zh/model-studio/", note: "兼容模式，区域地址可按账号调整。" },
  moonshot: { label: "Moonshot / Kimi", group: "中国服务商", protocol: "openai-compatible", base: "https://api.moonshot.cn/v1", hint: "例如 kimi-k2-0905-preview", docs: "https://platform.moonshot.cn/docs/", note: "OpenAI Chat Completions 兼容接口。" },
  zhipu: { label: "智谱 GLM", group: "中国服务商", protocol: "openai-compatible", base: "https://open.bigmodel.cn/api/paas/v4", hint: "例如 glm-4.5", docs: "https://open.bigmodel.cn/dev/api", note: "OpenAI Chat Completions 兼容接口。" },
  doubao: { label: "火山方舟 / 豆包", group: "中国服务商", protocol: "openai-compatible", base: "https://ark.cn-beijing.volces.com/api/v3", hint: "填写推理接入点 ID", docs: "https://www.volcengine.com/docs/82379/", note: "使用推理接入点作为模型 ID。" },
  baichuan: { label: "百川智能", group: "中国服务商", protocol: "openai-compatible", base: "https://api.baichuan-ai.com/v1", hint: "填写百川控制台中的模型 ID", docs: "https://platform.baichuan-ai.com/docs", note: "OpenAI Chat Completions 兼容接口。" },
  siliconflow: { label: "硅基流动", group: "中国服务商", protocol: "openai-compatible", base: "https://api.siliconflow.cn/v1", hint: "例如 deepseek-ai/DeepSeek-V3", docs: "https://docs.siliconflow.cn/", note: "聚合多家开源模型的兼容网关。" },
  together: { label: "Together AI", group: "国际服务商", protocol: "openai-compatible", base: "https://api.together.xyz/v1", hint: "填写 Together 模型 ID", docs: "https://docs.together.ai/docs/openai-api-compatibility", note: "OpenAI Chat Completions 兼容接口。" },
  fireworks: { label: "Fireworks AI", group: "国际服务商", protocol: "openai-compatible", base: "https://api.fireworks.ai/inference/v1", hint: "填写 Fireworks 模型 ID", docs: "https://docs.fireworks.ai/tools-sdks/openai-compatibility", note: "OpenAI Chat Completions 兼容接口。" },
  ollama: { label: "Ollama（本机）", group: "本地服务", protocol: "openai-compatible", base: "http://localhost:11434/v1", hint: "例如 qwen3:8b", docs: "https://docs.ollama.com/api/openai-compatibility", note: "仅允许本机 HTTP loopback，不会将请求发往公网。" },
  custom: { label: "自定义服务商 / 网关", group: "自定义", protocol: "openai-compatible", base: "", hint: "填写服务商文档中的模型 ID", docs: "", note: "支持兼容 Chat Completions、Responses、Anthropic 或 Gemini 的网关。" },
};

const protocolLabels: Record<string, string> = {
  "openai-compatible": "OpenAI 兼容 · Chat Completions",
  "openai-responses": "OpenAI Responses",
  anthropic: "Anthropic Messages",
  "google-gemini": "Google Gemini generateContent",
};

const presetGroups = Array.from(new Set(Object.values(presets).map(item => item.group)));

async function request(path: string, init: RequestInit = {}) {
  const response = await fetch(`${API}${path}`, {
    ...init,
    credentials: "include",
    cache: "no-store",
    headers: { ...(init.body ? { "Content-Type": "application/json" } : {}), ...init.headers },
  });
  const data = response.status === 204 ? null : await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.detail || `请求失败 (${response.status})`);
  return data;
}

export default function AIProviderSettings({ org, canManage }: { org: SettingsOrganization; canManage: boolean }) {
  const [settings, setSettings] = useState<AISettings | null>(null);
  const [provider, setProvider] = useState("openai");
  const [protocol, setProtocol] = useState("openai-responses");
  const [baseUrl, setBaseUrl] = useState(presets.openai.base);
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const activeOrganizationId = useRef(org.id);

  useEffect(() => {
    let active = true;
    activeOrganizationId.current = org.id;
    setSettings(null); setBusy(false); setTesting(false);
    request(`/api/ai/settings?organization_id=${encodeURIComponent(org.id)}`).then((saved: AISettings) => {
      if (!active) return;
      setSettings(saved);
      if (saved.configured) {
        const selected = presets[saved.provider || ""] ? saved.provider! : "custom";
        setProvider(selected);
        setProtocol(saved.protocol || "openai-compatible");
        setBaseUrl(saved.base_url || "");
        setModel(saved.model || "");
      } else {
        setProvider("openai"); setProtocol(presets.openai.protocol); setBaseUrl(presets.openai.base); setModel("");
      }
      setApiKey(""); setError(""); setNotice("");
    }).catch((err: unknown) => { if (active) setError(err instanceof Error ? err.message : "AI 配置加载失败"); });
    return () => { active = false; };
  }, [org.id]);

  const ready = !!settings?.configured;
  const chooseProvider = (value: string) => {
    const preset = presets[value];
    setProvider(value);
    setProtocol(preset.protocol);
    setBaseUrl(preset.base);
  };

  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(""); setNotice("");
    const organizationId = org.id;
    try {
      const saved = await request(`/api/ai/settings?organization_id=${encodeURIComponent(organizationId)}`, {
        method: "POST",
        body: JSON.stringify({ provider, protocol, base_url: baseUrl, model, api_key: apiKey }),
      }) as AISettings;
      if (activeOrganizationId.current === organizationId) { setSettings(saved); setApiKey(""); setNotice("AI 服务配置已安全保存。"); }
    } catch (err) { if (activeOrganizationId.current === organizationId) setError(err instanceof Error ? err.message : "保存配置失败"); }
    finally { if (activeOrganizationId.current === organizationId) setBusy(false); }
  };

  const testConnection = async () => {
    setTesting(true); setError(""); setNotice("");
    const organizationId = org.id;
    try {
      const result = await request(`/api/ai/settings/test?organization_id=${encodeURIComponent(organizationId)}`, { method: "POST" });
      if (activeOrganizationId.current === organizationId) setNotice(result.message || "连接测试成功。");
    } catch (err) { if (activeOrganizationId.current === organizationId) setError(err instanceof Error ? err.message : "连接测试失败"); }
    finally { if (activeOrganizationId.current === organizationId) setTesting(false); }
  };

  const remove = async () => {
    if (!window.confirm("删除当前公司的 AI 配置？已保存的 Token 密文会从数据库删除。")) return;
    setBusy(true); setError(""); setNotice("");
    const organizationId = org.id;
    try {
      await request(`/api/ai/settings?organization_id=${encodeURIComponent(organizationId)}`, { method: "DELETE" });
      if (activeOrganizationId.current === organizationId) {
        setSettings({ configured: false }); setApiKey(""); setModel(""); setProvider("openai"); setProtocol(presets.openai.protocol); setBaseUrl(presets.openai.base);
        setNotice("AI 服务配置已删除。");
      }
    } catch (err) { if (activeOrganizationId.current === organizationId) setError(err instanceof Error ? err.message : "删除配置失败"); }
    finally { if (activeOrganizationId.current === organizationId) setBusy(false); }
  };

  const selectedPreset = presets[provider] || presets.custom;

  return <section className="card ai-config-card settings-ai-card">
    <div className="ai-section-heading">
      <div className="table-title-icon"><Settings2 size={18}/></div>
      <div><h2>AI 服务商与 Token</h2><p>接入公司自行采购的模型 Token，用于 AI 内控助手。</p></div>
      {ready && <span className="ai-key-state"><LockKeyhole size={13}/>已加密配置</span>}
    </div>
    <div className="settings-ai-security"><LockKeyhole size={15}/><span>Token 由本地 API 使用 AI_ENCRYPTION_KEY 加密后保存在 PostgreSQL；不会返回浏览器。支持 OpenAI Responses、OpenAI 兼容 Chat Completions、Anthropic Messages 和 Gemini generateContent。</span></div>
    {!settings ? <div className="ai-manager-note"><LoaderCircle size={15} className="spin"/>{error ? "未能读取 AI 配置，请检查连接后刷新页面。" : "正在读取当前公司的模型配置…"}</div> : canManage ? <form className="ai-config-form" onSubmit={save}>
      <div className="ai-form-grid">
        <label className="field-label">模型服务商<select value={provider} onChange={event => chooseProvider(event.target.value)}>{presetGroups.map(group => <optgroup key={group} label={group}>{Object.entries(presets).filter(([, value]) => value.group === group).map(([key, value]) => <option key={key} value={key}>{value.label}</option>)}</optgroup>)}</select></label>
        <label className="field-label">接口协议{provider === "custom" ? <select value={protocol} onChange={event => setProtocol(event.target.value)}><option value="openai-compatible">OpenAI 兼容 · Chat Completions</option><option value="openai-responses">OpenAI Responses</option><option value="anthropic">Anthropic Messages</option><option value="google-gemini">Google Gemini · generateContent</option></select> : <span className="ai-interface-value"><Globe2 size={13}/>{protocolLabels[protocol] || protocol}</span>}<span className="field-hint">{selectedPreset.note}</span></label>
        <label className="field-label">API Base URL<input type="url" value={baseUrl} onChange={event => setBaseUrl(event.target.value)} placeholder="https://api.example.com/v1" required/><span className="field-hint">远程服务必须使用 HTTPS；支持自定义兼容网关。</span></label>
        <label className="field-label">模型 ID<input value={model} onChange={event => setModel(event.target.value)} placeholder={presets[provider]?.hint || "填写服务商模型 ID"} required/></label>
        <label className="field-label ai-token-field">API Token<input type="password" autoComplete="new-password" value={apiKey} onChange={event => setApiKey(event.target.value)} placeholder={ready ? "留空以保留已保存的 Token" : "粘贴服务商 API Token"} required={!ready}/><span className="field-hint">Token 仅随保存请求发送给本地 API；留空会保留现有 Token。</span></label>
      </div>
      <div className="ai-provider-help"><div><b>{selectedPreset.label}</b><span>{selectedPreset.note}</span></div>{selectedPreset.docs && <a href={selectedPreset.docs} target="_blank" rel="noreferrer"><ExternalLink size={13}/>官方接口说明</a>}</div>
      <div className="ai-config-actions"><button className="primary-btn" disabled={busy || !settings}>{busy ? <><LoaderCircle size={15} className="spin"/>保存中</> : <><Check size={15}/>{ready ? "保存配置" : "保存并加密 Token"}</>}</button>{ready && <><button className="outline-btn" type="button" onClick={testConnection} disabled={testing || busy}>{testing ? <LoaderCircle size={14} className="spin"/> : <Wifi size={14}/>}测试连接</button><button className="ai-remove-btn" type="button" onClick={remove} disabled={busy}><Trash2 size={14}/>删除配置</button></>}</div>
    </form> : <div className="ai-manager-note"><LockKeyhole size={16}/>只有公司经理可以新增、修改或删除服务商 Token。当前只显示配置状态，不会显示密钥。</div>}
    {error && <div className="form-error ai-error"><AlertTriangle size={15}/>{error}</div>}
    {notice && <div className="settings-note settings-ai-notice"><Check size={15}/><span>{notice}</span></div>}
    {ready && <div className="settings-ai-model"><CircleAlert size={14}/><span>当前连接：{settings?.provider} · {protocolLabels[settings?.protocol || ""] || settings?.protocol} · {settings?.model} {settings?.api_key_masked || ""}</span></div>}
  </section>;
}
