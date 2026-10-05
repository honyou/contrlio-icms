"use client";

import { useEffect, useMemo, useState } from "react";
import { ArrowUpRight, Building2, CircleAlert, ExternalLink, GitBranch, LoaderCircle, RotateCcw, Scale, Search, ShieldCheck } from "lucide-react";
import "./compliance-library.css";

type Organization = { id: string; name: string; industry?: string };
type Industry = { key: string; name: string; description: string };
type Jurisdiction = { code: string; name: string; group: string };
type Regulation = {
  id: string; title: string; authority: string; category: string; country_code: string; country_name: string; jurisdiction: string;
  status: string; source_kind?: string; effective_date?: string | null; summary: string; obligations: string[];
  process_tags: string[]; industry_keys: string[]; source_url: string; scope_note: string; checked_on: string;
};
type CompanyProcess = { id: string; code: string; name: string; department_id?: string | null; description?: string | null };
type JurisdictionGuide = { legal_focus: string; risk_prompt: string; compliance_checkpoints: string[]; regulations: string[] };
type ProcessGuide = {
  code: string; name: string; department: string; description: string; risk: string; objective: string;
  control_design: string; test: string; population: string; sample_guidance: string; evidence: string;
  legal_focus: string; risk_prompt: string; compliance_checkpoints: string[]; regulations: string[];
  jurisdiction_guidance?: Record<string, JurisdictionGuide>;
};
type Payload = {
  checked_on: string; current_industry_key: string; industries: Industry[]; regulations: Regulation[];
  process_guidance: Record<string, ProcessGuide[]>; company_processes: CompanyProcess[]; disclaimer: string;
  jurisdiction_options?: Jurisdiction[];
};
type GuideBlock = { jurisdiction: Jurisdiction; guidance: JurisdictionGuide | null; laws: Regulation[]; missingIds: string[] };

const DEFAULT_JURISDICTIONS: Jurisdiction[] = [
  { code: "CN", name: "中国大陆", group: "CHINA" },
  { code: "HK", name: "香港特别行政区", group: "INTERNATIONAL_REGIONAL" },
  { code: "MO", name: "澳门特别行政区", group: "INTERNATIONAL_REGIONAL" },
  { code: "TW", name: "台湾地区", group: "INTERNATIONAL_REGIONAL" },
  { code: "US", name: "美国", group: "INTERNATIONAL_REGIONAL" },
  { code: "EU", name: "欧盟", group: "INTERNATIONAL_REGIONAL" },
  { code: "GB", name: "英国", group: "INTERNATIONAL_REGIONAL" },
  { code: "JP", name: "日本", group: "INTERNATIONAL_REGIONAL" },
  { code: "SG", name: "新加坡", group: "INTERNATIONAL_REGIONAL" },
  { code: "AU", name: "澳大利亚", group: "INTERNATIONAL_REGIONAL" },
];
const JURISDICTION_DISPLAY_NAMES: Record<string, string> = {
  HK: "中国香港",
  MO: "中国澳门",
  TW: "中国台湾",
};
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const searchable = (values: unknown[]) => values.filter(Boolean).join(" ").toLocaleLowerCase();
const lawText = (law: Regulation) => searchable([law.title, law.authority, law.category, law.country_name, law.jurisdiction, law.summary, law.scope_note, ...(law.obligations || []), ...(law.process_tags || [])]);
const processText = (guide: ProcessGuide) => searchable([guide.name, guide.code, guide.department, guide.description, guide.risk, guide.objective, guide.control_design, guide.test, guide.population, guide.sample_guidance, guide.evidence]);
const jurisdictionText = (guide: JurisdictionGuide) => searchable([guide.legal_focus, guide.risk_prompt, ...(guide.compliance_checkpoints || [])]);
function scopedGuidance(guide: ProcessGuide, code: string): JurisdictionGuide | null {
  if (guide.jurisdiction_guidance) return guide.jurisdiction_guidance[code] || null;
  // Compatibility applies only to the original mainland China records.
  return code === "CN" ? { legal_focus: guide.legal_focus, risk_prompt: guide.risk_prompt, compliance_checkpoints: guide.compliance_checkpoints || [], regulations: guide.regulations || [] } : null;
}
async function api(path: string) {
  const response = await fetch(`${API}${path}`, { credentials: "include", cache: "no-store" });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.detail || `请求失败 (${response.status})`);
  return data;
}

export default function ComplianceLibraryPage({ org, onNavigate }: { org: Organization; onNavigate: (page: string) => void }) {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [industryKey, setIndustryKey] = useState("");
  const [tab, setTab] = useState<"laws" | "processes">("laws");
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState("全部类别");
  const [countryCode, setCountryCode] = useState("CN");
  const [companyLinks, setCompanyLinks] = useState<Record<string, string>>({});
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [guidanceLoading, setGuidanceLoading] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let active = true;
    setPayload(null); setIndustryKey(""); setCompanyLinks({}); setQuery(""); setCategory("全部类别");
    setCountryCode("CN"); setLoading(true); setError("");
    api(`/api/compliance-library?organization_id=${encodeURIComponent(org.id)}`).then((data: Payload) => {
      if (!active) return;
      setPayload(data); setIndustryKey(data.current_industry_key || data.industries[0]?.key || "");
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "法规与流程合规资料加载失败");
    }).finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [org.id, reloadKey]);

  const loadedGuidance = payload?.process_guidance;
  useEffect(() => {
    if (!loadedGuidance || !industryKey || loadedGuidance[industryKey]) {
      setGuidanceLoading(false);
      return;
    }
    let active = true;
    setGuidanceLoading(true);
    api(`/api/compliance-library?organization_id=${encodeURIComponent(org.id)}&industry_key=${encodeURIComponent(industryKey)}`).then((data: Payload) => {
      if (!active) return;
      setPayload(current => current ? { ...current, process_guidance: { ...current.process_guidance, ...data.process_guidance } } : data);
    }).catch((err: unknown) => {
      if (active) setError(err instanceof Error ? err.message : "当前行业流程指引加载失败");
    }).finally(() => { if (active) setGuidanceLoading(false); });
    return () => { active = false; };
  }, [org.id, industryKey, loadedGuidance]);

  const normalizedQuery = query.trim().toLocaleLowerCase();
  const industry = payload?.industries.find(item => item.key === industryKey);
  const jurisdictionOptions = useMemo(() => {
    const options = new Map(DEFAULT_JURISDICTIONS.map(item => [item.code, item]));
    (payload?.jurisdiction_options || []).forEach(item => options.set(item.code, { ...item, group: item.code === "CN" ? "CHINA" : "INTERNATIONAL_REGIONAL" }));
    (payload?.regulations || []).forEach(item => {
      if (!options.has(item.country_code)) options.set(item.country_code, { code: item.country_code, name: item.country_name, group: item.country_code === "CN" ? "CHINA" : "INTERNATIONAL_REGIONAL" });
    });
    const orderedCodes = ["CN", "HK", "MO", "TW"];
    const ordered = [
      ...orderedCodes.map(code => options.get(code)).filter((item): item is Jurisdiction => Boolean(item)),
      ...Array.from(options.values()).filter(item => !orderedCodes.includes(item.code)),
    ];
    return ordered.map(item => ({ ...item, name: JURISDICTION_DISPLAY_NAMES[item.code] || item.name }));
  }, [payload]);
  const countryOptions = jurisdictionOptions;
  const selectedCodes = useMemo(() => [countryCode], [countryCode]);
  const scopeOptions = jurisdictionOptions.filter(item => selectedCodes.includes(item.code));
  const selectedCountryName = countryOptions.find(item => item.code === countryCode)?.name || countryCode;
  const countryNames = new Map(jurisdictionOptions.map(item => [item.code, item.name]));
  const industryGuides = payload?.process_guidance[industryKey] || [];
  const scopeLaws = useMemo(() => {
    const codes = new Set(selectedCodes);
    return (payload?.regulations || []).filter(item => (item.industry_keys || []).includes(industryKey) && codes.has(item.country_code));
  }, [payload, industryKey, selectedCodes]);
  const categories = useMemo(() => ["全部类别", ...Array.from(new Set(scopeLaws.map(item => item.category))).sort((a, b) => a.localeCompare(b, "zh-CN"))], [scopeLaws]);
  useEffect(() => { if (!categories.includes(category)) setCategory("全部类别"); }, [categories, category]);
  const regulations = scopeLaws.filter(item => {
    if (category !== "全部类别" && item.category !== category) return false;
    if (!normalizedQuery || lawText(item).includes(normalizedQuery)) return true;
    return industryGuides.some(guide => {
      const guidance = scopedGuidance(guide, item.country_code);
      return guidance?.regulations.includes(item.id) && searchable([processText(guide), jurisdictionText(guidance)]).includes(normalizedQuery);
    });
  });
  const guides = industryGuides.map(guide => {
    const baseMatch = !normalizedQuery || processText(guide).includes(normalizedQuery);
    const blocks: GuideBlock[] = scopeOptions.flatMap(jurisdiction => {
      const guidance = scopedGuidance(guide, jurisdiction.code);
      const mappedLaws = (payload?.regulations || []).filter(law => law.country_code === jurisdiction.code && (guidance?.regulations || []).includes(law.id));
      const laws = mappedLaws.filter(law => category === "全部类别" || law.category === category);
      if (category !== "全部类别" && !laws.length) return [];
      if (!baseMatch && !searchable([jurisdiction.name, guidance ? jurisdictionText(guidance) : "", ...laws.map(lawText)]).includes(normalizedQuery)) return [];
      const missingIds = (guidance?.regulations || []).filter(id => !mappedLaws.some(law => law.id === id));
      return [{ jurisdiction, guidance, laws, missingIds }];
    });
    return { guide, blocks };
  }).filter(item => item.blocks.length);
  const scopeLabel = `${selectedCountryName}法规`;
  const resetFilters = () => { setQuery(""); setCategory("全部类别"); };

  return <div className="module-page compliance-page">
    <div className="module-header compliance-header"><div><div className="section-kicker">INDUSTRY LAW INDEX · PROCESS CONTROLS</div><h1>行业法规与流程合规</h1><p>按业务所在国家或地区检索官方法规与指引，查看对应流程的适用条件、风险提示、控制检查和留存证据。</p></div><div className="compliance-header-meta"><span><Building2 size={14}/>{org.name}</span><span><ShieldCheck size={14}/>索引核对至 {payload?.checked_on || "—"}</span></div></div>
    {error && <div className="compliance-error" role="alert"><CircleAlert size={16}/><span>{error}</span><button className="outline-btn" onClick={() => setReloadKey(current => current + 1)}><RotateCcw size={14}/>重新加载</button></div>}
    {loading ? <div className="card compliance-loading"><LoaderCircle size={18} className="spin"/>正在载入官方法规索引和公司流程…</div> : payload && <>
      <div className="compliance-layout">
        <aside className="card compliance-industries"><div className="section-kicker">行业目录</div><p>默认显示当前公司行业。切换行业时保留国家和关键词，便于比较不同业务。</p>{payload.industries.map(item => <button key={item.key} className={`compliance-industry ${industryKey === item.key ? "selected" : ""}`} onClick={() => { setIndustryKey(item.key); setError(""); }} aria-pressed={industryKey === item.key}><span className="compliance-industry-icon"><Building2 size={15}/></span><span><b>{item.name}</b><small>{item.key === payload.current_industry_key ? "当前公司行业" : item.description}</small></span><ArrowUpRight size={13}/></button>)}</aside>
        <section className="compliance-main">
          <section className="card compliance-hero"><div><div className="section-kicker">{industry?.key.toUpperCase()}</div><h2>{industry?.name || "选择行业"}</h2><p>{industry?.description}</p></div><div className="compliance-hero-stats"><span><b>{regulations.length}</b> 项匹配法规/指引</span><span><b>{guides.length}</b> 条匹配流程</span><span><b>{payload.company_processes.length}</b> 条公司实际流程</span></div></section>
          <section className="card compliance-filter-panel" aria-label="法规与流程筛选">
            <div className="compliance-filter-row"><label>国家及地区<select className="country-select" value={countryCode} onChange={e => { setCountryCode(e.target.value); setCategory("全部类别"); }}>{countryOptions.map(item => <option key={item.code} value={item.code}>{item.name}</option>)}</select></label><label>法规类别<select value={category} onChange={e => setCategory(e.target.value)}>{categories.map(item => <option key={item}>{item}</option>)}</select></label><label className="compliance-search"><Search size={16}/><input value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索法规名称、流程、风险或控制点" aria-label="搜索法规与流程"/></label></div>
            <div className="compliance-filter-summary"><span>{scopeLabel} · {category}{query.trim() ? ` · 关键词：${query.trim()}` : ""}</span>{(query || category !== "全部类别") && <button onClick={resetFilters}>清除关键词和类别</button>}<small>筛选同时作用于法规索引和流程指引</small></div>
          </section>
          <div className="compliance-toolbar"><div className="compliance-tabs" role="tablist" aria-label="查看方式"><button id="compliance-laws-tab" role="tab" aria-selected={tab === "laws"} aria-controls="compliance-laws-panel" className={tab === "laws" ? "active" : ""} onClick={() => setTab("laws")}><Scale size={16}/>法规索引</button><button id="compliance-processes-tab" role="tab" aria-selected={tab === "processes"} aria-controls="compliance-processes-panel" className={tab === "processes" ? "active" : ""} onClick={() => setTab("processes")}><GitBranch size={16}/>流程风险与内控要点</button></div></div>
          {tab === "laws" ? <div id="compliance-laws-panel" role="tabpanel" aria-labelledby="compliance-laws-tab">
            <div className="law-grid">{regulations.map(item => <article className="card law-card" key={item.id}><div className="law-card-top"><span className="law-card-badges"><span className="law-country">{countryNames.get(item.country_code) || item.country_name}</span><span className="law-category">{item.category}</span><span className="law-source-kind">{item.source_kind || "来源类型未标注"}</span></span><span className="law-jurisdiction">{item.jurisdiction}</span></div><h3>{item.title}</h3><div className="law-authority">发布/主管：{item.authority}</div><p className="law-summary">{item.summary}</p><div className="law-detail"><b>流程义务提示</b><ul>{item.obligations.map((obligation, index) => <li key={index}>{obligation}</li>)}</ul></div><div className="law-tags">{item.process_tags.map(tag => <span key={tag}>{tag}</span>)}</div><div className="law-scope"><b>适用边界</b><p>{item.scope_note}</p></div><div className="law-card-footer"><span>{item.status}<br/>施行日期：{item.effective_date || "未单列（请查阅官方原文）"}<br/>来源核对：{item.checked_on || payload.checked_on}</span><a href={item.source_url} target="_blank" rel="noreferrer">查看官方原文 <ExternalLink size={14}/></a></div></article>)}</div>
            {!regulations.length && <div className="card compliance-empty"><Scale size={24}/><b>当前范围没有匹配的法规或指引</b><p>{selectedCountryName} · {industry?.name}；可以清除关键词、调整类别或选择其他国家/地区。未收录不代表该业务没有法定义务。</p>{(query || category !== "全部类别") && <button className="outline-btn" onClick={resetFilters}>清除关键词和类别</button>}</div>}
          </div> : guidanceLoading ? <div className="card compliance-loading"><LoaderCircle size={18} className="spin"/>正在载入当前行业的流程合规指引…</div> : <div id="compliance-processes-panel" role="tabpanel" aria-labelledby="compliance-processes-tab">
            <section className="card process-link-banner"><div><div className="section-kicker">YOUR COMPANY PROCESS REGISTER</div><h3>和当前公司实际流程对照</h3><p>按业务所在法域核对流程模板，再关联公司实际流程维护风险与控制。当前仅显示{selectedCountryName}的合规要点。</p></div><button className="outline-btn" onClick={() => onNavigate("processes")}><GitBranch size={15}/>管理公司流程</button></section>
            <div className="process-guide-list">{guides.map(({ guide, blocks }, index) => {
              const matched = payload.company_processes.find(item => item.name === guide.name);
              const selectedId = companyLinks[`${industryKey}:${guide.code}`] ?? matched?.id ?? "";
              const selectedProcess = payload.company_processes.find(item => item.id === selectedId);
              return <article className="card process-guide-card" key={guide.code}>
                <div className="process-guide-top"><span className="guide-number">{String(index + 1).padStart(2, "0")}</span><span className="department-tag">{guide.department}</span><span className="guide-code">{guide.code}</span></div><h3>{guide.name}</h3><p className="guide-description">{guide.description}</p>
                <div className="guide-company-link"><label>关联公司流程<select value={selectedId} onChange={e => setCompanyLinks(current => ({ ...current, [`${industryKey}:${guide.code}`]: e.target.value }))}><option value="">未关联到公司流程</option>{payload.company_processes.map(process => <option key={process.id} value={process.id} data-no-translate>{process.code} · {process.name}</option>)}</select></label><span>{selectedProcess ? <span data-no-translate>{`当前关联：${selectedProcess.code} · ${selectedProcess.name}`}</span> : payload.company_processes.length ? "可选择最接近的实际流程" : "公司暂无流程记录"}</span></div>
                <div className="guide-jurisdiction-list">{blocks.map((block, blockIndex) => <details className="guide-jurisdiction" key={block.jurisdiction.code} open={countryCode !== "ALL" || blockIndex === 0}>
                  <summary><span className="law-country">{block.jurisdiction.name}</span><b>合规关注点与核查建议</b><span>{block.guidance ? `${block.laws.length} 项已映射法规/指引` : "法域指引尚未收录"}</span></summary>
                  {block.guidance ? <><div className="compliance-focus"><b>合规关注点</b><p>{block.guidance.legal_focus}</p>{block.guidance.risk_prompt && <p className="risk-prompt"><CircleAlert size={15}/>{block.guidance.risk_prompt}</p>}</div><div className="compliance-checks"><b>建议核查</b><ol>{block.guidance.compliance_checkpoints.map((point, i) => <li key={i}>{point}</li>)}</ol></div></> : <div className="guide-law-missing"><CircleAlert size={16}/><p>该流程尚未收录{block.jurisdiction.name}的专属合规指引。下方业务风险与控制设计仅供流程设计参考，需结合当地适用法规进一步核对。</p></div>}
                  <div className="guide-law-links"><b>{block.jurisdiction.name}关联法规</b>{block.laws.length ? block.laws.map(law => <a href={law.source_url} target="_blank" rel="noreferrer" key={law.id}>{law.title}<ExternalLink size={14}/></a>) : <span className="guide-law-empty">尚未收录该法域与本流程的法规映射。</span>}{block.missingIds.length > 0 && <span className="guide-law-empty">有 {block.missingIds.length} 项法规映射暂未收录到索引，请核对原始来源。</span>}</div>
                </details>)}</div>
                <div className="guide-general-label">通用业务风险与控制设计参考</div><div className="guide-risk-control"><div><b>业务风险</b><p>{guide.risk}</p></div><div><b>控制设计参考</b><p>{guide.control_design}</p></div></div><div className="guide-sample-grid"><div><b>检查总体</b><span>{guide.population}</span></div><div><b>样本建议</b><span>{guide.sample_guidance}</span></div><div><b>测试程序</b><span>{guide.test}</span></div><div><b>建议证据</b><span>{guide.evidence}</span></div></div>
              </article>;
            })}</div>
            {!guides.length && <div className="card compliance-empty"><GitBranch size={24}/><b>当前范围没有匹配的流程指引</b><p>{selectedCountryName} · {industry?.name}；可以调整关键词、类别或国家/地区。此处仅展示已收录的法域指引及法规映射。</p>{(query || category !== "全部类别") && <button className="outline-btn" onClick={resetFilters}>清除关键词和类别</button>}</div>}
          </div>}
        </section>
      </div>
      <div className="compliance-disclaimer"><CircleAlert size={16}/><span>{payload.disclaimer}</span></div>
    </>}
  </div>;
}
