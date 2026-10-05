"use client";

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import ComplianceLibraryPage from "./ComplianceLibraryPage";
import IndustryLibraryPage from "./IndustryLibraryPage";
import AIAssistantPage from "./AIAssistantPage";
import PolicyReviewPage from "./PolicyReviewPage";
import ProcessConfiguration from "./ProcessConfiguration";
import RiskManagementPage from "./RiskManagementPage";
import RiskControlMatrixPage, { type IntegrityTarget } from "./RiskControlMatrixPage";
import AIProviderSettings from "./AIProviderSettings";
import AIQuotaSettings from "./AIQuotaSettings";
import InspectionDetail, { type InspectionRoute, type InspectionTab } from "./InspectionDetail";
import InternalControlReportPage from "./InternalControlReportPage";
import OperationGuideButton from "./OperationGuide";
import { LocaleProvider, useI18n } from "./I18n";
import { ThemeProvider, useThemeColor } from "./Theme";
import "./control-library.css";
import "./inspection-dashboard.css";
import "./user-management.css";
import "./billing.css";
import {
  Activity, AlertTriangle, ArrowDownToLine, ArrowUpRight, BadgeCheck, BookOpen, Building2, CalendarClock, CreditCard,
  Check, ChevronDown, CircleHelp, ClipboardCheck, ClipboardList, Copy, FileCheck2, FilePlus2,
  Eye, EyeOff, Files, Gauge, GitBranch, LayoutDashboard, LoaderCircle, LogOut, Menu, Network,
  FileText, KeyRound, Palette, Pencil, Plus, RotateCcw, Scale, Search, Settings, Shield, ShieldCheck, Sparkles, Trash2, Users, X,
} from "lucide-react";

// Keep authentication on the frontend origin so the session cookie is sent
// consistently; Next.js rewrites /api/* to the local API over IPv4.
const API = process.env.NEXT_PUBLIC_API_URL || "";

type User = { id: string; email: string; full_name: string; is_system_admin?: boolean };
type BillingStatus = { policy_active:boolean; allowed:boolean; status:"admin"|"permanent"|"setup"|"trial"|"paid"|"expired"; trial_started_at:string|null; expires_at:string|null; days_remaining:number|null; price_fen:number; term_days:number; payment_provider:string; payment_configured:boolean; receiver_account:string };
type Organization = { id: string; name: string; code: string; industry?: string; is_active?: boolean };
type Membership = { id: string; role: string; organization: Organization };
type RecordRow = Record<string, unknown> & { id: string; code?: string; name?: string; title?: string; status?: string; created_at?: string };
type IndustryTemplateOption = { id:string; industry:string; maturity_label:string };
type FieldDef = { key: string; label: string; type?: string; options?: [string, string][]; source?: string; required?: boolean; hint?: string };
type ResourceDef = { key: string; endpoint: string; title: string; singular: string; subtitle: string; icon: typeof Building2; columns: [string,string][]; fields: FieldDef[] };

const resources: ResourceDef[] = [
  {key:"departments",endpoint:"departments",title:"部门",singular:"部门",subtitle:"维护公司的组织架构与负责人",icon:Building2,columns:[["code","部门编号"],["name","部门名称"],["parent_id","上级部门"],["manager_user_id","负责人"],["created_at","创建时间"]],fields:[{key:"code",label:"部门编号",required:true},{key:"name",label:"部门名称",required:true},{key:"parent_id",label:"上级部门",source:"departments"},{key:"manager_user_id",label:"部门负责人",source:"members"},{key:"description",label:"部门说明",type:"textarea"}]},
  {key:"processes",endpoint:"processes",title:"业务流程",singular:"流程",subtitle:"配置业务步骤、办理表单、审批规则和内控要求",icon:GitBranch,columns:[["code","流程编号"],["name","流程名称"],["department_id","所属部门"],["owner_user_id","流程负责人"],["configuration_step_count","步骤数"],["configuration_status","配置状态"]],fields:[{key:"code",label:"流程编号",required:true},{key:"name",label:"流程名称",required:true},{key:"department_id",label:"所属部门",source:"departments",required:true},{key:"owner_user_id",label:"流程负责人",source:"members"},{key:"description",label:"流程说明",type:"textarea"}]},
  {key:"risks",endpoint:"risks",title:"风险库",singular:"风险",subtitle:"全局管理企业内控风险及其流程、目标与控制措施关系",icon:AlertTriangle,columns:[["code","风险编号"],["name","风险名称"],["process_id","所属流程"],["likelihood","可能性"],["impact","影响"],["status","状态"]],fields:[{key:"code",label:"风险编号",required:true},{key:"name",label:"风险名称",required:true},{key:"process_id",label:"所属流程",source:"processes",required:true},{key:"description",label:"风险描述",type:"textarea",required:true},{key:"likelihood",label:"固有风险可能性（1–5）",type:"number"},{key:"impact",label:"固有风险影响（1–5）",type:"number"},{key:"residual_likelihood",label:"剩余风险可能性（1–5）",type:"number"},{key:"residual_impact",label:"剩余风险影响（1–5）",type:"number"},{key:"owner_user_id",label:"风险负责人",source:"members"},{key:"status",label:"风险状态",type:"select",options:[["active","进行中"],["accepted","已接受"],["mitigating","应对中"],["closed","已关闭"]]}]},
  {key:"control-objectives",endpoint:"control-objectives",title:"控制目标",singular:"控制目标",subtitle:"描述关键流程需要达到的控制目标",icon:Shield,columns:[["code","目标编号"],["name","控制目标"],["process_id","所属流程"]],fields:[{key:"code",label:"目标编号",required:true},{key:"name",label:"目标名称",required:true},{key:"process_id",label:"所属流程",source:"processes",required:true},{key:"description",label:"目标说明",type:"textarea",required:true}]},
  {key:"controls",endpoint:"controls",title:"控制库",singular:"控制措施",subtitle:"按风险查看控制措施与实际整改进度",icon:ShieldCheck,columns:[["code","控制编号"],["name","控制措施"],["objective_id","对应目标"],["frequency","执行频率"],["control_type","控制类型"]],fields:[{key:"code",label:"控制编号",required:true},{key:"name",label:"控制名称",required:true},{key:"process_id",label:"所属流程",source:"processes",required:true},{key:"objective_id",label:"控制目标",source:"control-objectives",required:true},{key:"description",label:"控制说明",type:"textarea",required:true},{key:"control_type",label:"控制类型",type:"select",options:[["preventive","预防性"],["detective","检查性"],["corrective","纠正性"]]},{key:"frequency",label:"执行频率",type:"select",options:[["continuous","持续"],["daily","每日"],["weekly","每周"],["monthly","每月"],["quarterly","每季度"],["annual","每年"],["ad_hoc","按需"]]},{key:"execution_mode",label:"执行方式",type:"select",options:[["manual","人工"],["automated","自动"],["hybrid","人工与自动"]]},{key:"owner_user_id",label:"控制负责人",source:"members"},{key:"is_key_control",label:"是否关键控制",type:"checkbox"},{key:"is_active",label:"控制状态（启用）",type:"checkbox"}]},
  {key:"rcms",endpoint:"rcms",title:"风险控制矩阵 RCM",singular:"RCM 映射",subtitle:"把业务流程、风险和控制措施连接起来",icon:Network,columns:[["process_id","业务流程"],["risk_id","关联风险"],["control_id","对应控制"],["assertion","控制目标"],["created_at","建立时间"]],fields:[{key:"process_id",label:"业务流程",source:"processes",required:true},{key:"risk_id",label:"关联风险",source:"risks",required:true},{key:"control_id",label:"对应控制措施",source:"controls",required:true},{key:"assertion",label:"控制目标",type:"textarea"},{key:"test_procedure",label:"检查程序",type:"textarea"}]},
  {key:"inspections",endpoint:"inspections",title:"内控检查",singular:"内控检查",subtitle:"围绕 RCM 制定检查并记录测试结果",icon:ClipboardCheck,columns:[["code","检查编号"],["name","检查名称"],["process_id","业务流程"],["period_start","检查期间"],["status","状态"]],fields:[{key:"code",label:"检查编号",required:true},{key:"name",label:"检查名称",required:true},{key:"process_id",label:"业务流程",source:"processes",required:true},{key:"period_start",label:"开始日期",type:"date",required:true},{key:"period_end",label:"结束日期",type:"date",required:true},{key:"lead_user_id",label:"检查负责人",source:"members",required:true},{key:"status",label:"检查状态",type:"select",options:[["planned","计划中"],["in_progress","进行中"],["completed","已完成"]]}]},
  {key:"inspection-tests",endpoint:"inspection-tests",title:"检查执行项",singular:"检查项",subtitle:"执行 RCM 检查，记录样本、步骤与检查结论",icon:FileCheck2,columns:[["inspection_id","检查任务"],["rcm_id","检查 RCM"],["result","检查结果"],["sample_description","样本说明"],["notes","检查备注"]],fields:[{key:"inspection_id",label:"检查任务",source:"inspections",required:true},{key:"rcm_id",label:"关联 RCM",source:"rcms",required:true},{key:"tester_user_id",label:"执行人员",source:"members",required:true},{key:"procedure",label:"检查程序",type:"textarea",required:true},{key:"result",label:"检查结果",type:"select",options:[["not_tested","未测试"],["pass","通过"],["fail","未通过"],["needs_improvement","需改进"],["not_applicable","不适用"]]},{key:"sample_description",label:"样本说明",type:"textarea"},{key:"notes",label:"检查记录",type:"textarea"}]},
  {key:"findings",endpoint:"findings",title:"检查发现",singular:"检查发现",subtitle:"对未通过的控制测试记录事实和改进建议",icon:CircleHelp,columns:[["title","发现事项"],["severity","严重程度"],["inspection_test_id","检查项"],["status","状态"]],fields:[{key:"inspection_test_id",label:"关联检查项",source:"inspection-tests",required:true},{key:"title",label:"发现事项",required:true},{key:"condition",label:"实际情况",type:"textarea",required:true},{key:"criteria",label:"控制要求",type:"textarea"},{key:"root_cause",label:"原因分析",type:"textarea"},{key:"impact",label:"影响",type:"textarea"},{key:"recommendation",label:"改进建议",type:"textarea"},{key:"severity",label:"严重程度",type:"select",options:[["low","低"],["medium","中"],["high","高"],["critical","严重"]]}]},
];

const nav = [
  {id:"dashboard",label:"工作台",icon:LayoutDashboard},
  {id:"organizations",label:"公司与成员",icon:Building2},
  {id:"departments",label:"部门",icon:Users},
  {id:"industry-library",label:"行业参考库",icon:BookOpen},
  {id:"compliance-library",label:"法规与流程合规",icon:Scale},
  {id:"policy-review",label:"制度合规分析",icon:FileText},
  {id:"ai-assistant",label:"AI 内控助手",icon:Sparkles},
];

const internalControlSections = [
  {title:"体系建设",items:[
    {id:"processes",label:"业务流程",icon:GitBranch},
    {id:"risks",label:"风险库",icon:AlertTriangle},
    {id:"controls",label:"控制库",icon:ShieldCheck},
    {id:"rcms",label:"风险控制矩阵",icon:Network},
  ]},
  {title:"监督整改",items:[
    {id:"inspections",label:"内控检查",icon:ClipboardCheck},
    {id:"evidence",label:"证据库",icon:Files},
    {id:"issues",label:"整改闭环",icon:ClipboardList},
  ]},
  {title:"分析管理",items:[
    {id:"internal-reports",label:"内控报告",icon:FileText},
  ]},
  {title:"系统",items:[
    {id:"user-management",label:"用户管理",icon:Users},
  {id:"settings",label:"账号设置",icon:Settings},
  ]},
];
const internalControlNav = internalControlSections.flatMap(section => section.items);
const legacyRouteLabels: Record<string,string> = {"inspection-tests":"检查执行项",evidence:"证据库",findings:"检查发现"};
const inspectionTabLabels: Record<InspectionTab,string> = {overview:"检查概览",tests:"检查执行项",evidence:"证据",findings:"检查发现"};
const parseInspectionRoute = (hash:string):InspectionRoute|null => {
  const match = hash.replace(/^#/u,"").match(/^inspection\/([^/]+)\/(overview|tests|evidence|findings)$/u);
  if(!match)return null;
  try{return {inspectionId:decodeURIComponent(match[1]),tab:match[2] as InspectionTab};}catch{return null;}
};
const normalizePage = (value: string) => value === "control-objectives" ? "processes" : value;
const hasPage = (value: string) => nav.some(item => item.id === value) || internalControlNav.some(item => item.id === value) || Object.hasOwn(legacyRouteLabels,value) || resources.some(item => item.key === value) || value === "evidence";

const roleLabels: Record<string,string> = {manager:"公司经理",auditor:"内控审计员",owner:"整改责任人",viewer:"只读查看者"};
const stateLabels: Record<string,string> = {open:"待分配",in_progress:"整改中",in_review:"等待复核",verified:"待重测",retested:"待关闭",closed:"已关闭",planned:"计划中",completed:"已完成",active:"进行中",accepted:"已接受",mitigating:"应对中",pass:"通过",fail:"未通过",needs_improvement:"需改进",not_tested:"未测试",converted:"已转整改",low:"低",medium:"中",high:"高",critical:"严重",preventive:"预防性",detective:"检查性",corrective:"纠正性",manual:"人工",automated:"自动",hybrid:"人工与自动",per_transaction:"每笔",daily:"每日",weekly:"每周",monthly:"每月",quarterly:"每季度",annual:"每年",continuous:"持续",ad_hoc:"按需",not_applicable:"不适用"};
const inspectionStatusLabels: Record<string,string> = {planned:"计划中",in_progress:"执行中",completed:"已完成"};
const findingStatusLabels: Record<string,string> = {open:"待转整改",converted:"已转整改",accepted:"已接受"};
const dateShort = (v: unknown) => { if (!v) return "—"; const d = new Date(String(v)); return Number.isNaN(d.valueOf()) ? String(v) : d.toLocaleDateString("zh-CN"); };
const displayValue = (key: string, value: unknown) => key.includes("date") || key.endsWith("_at") || key.startsWith("period_") ? dateShort(value) : stateLabels[String(value)] || String(value ?? "—");

async function api(path: string, options: RequestInit = {}) {
  const headers = new Headers(options.headers);
  if (options.body && !(options.body instanceof FormData)) headers.set("Content-Type", "application/json");
  try {
    const response = await fetch(`${API}${path}`, {...options,headers,credentials:"include",cache:options.cache??"no-store"});
    if (response.status === 204) return null;
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data.detail || `请求失败 (${response.status})`);
    return data;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("无法连接本地 API。请确认基础服务和 FastAPI 已启动。 ");
    throw error;
  }
}

async function loadIndustryTemplateOptions(): Promise<IndustryTemplateOption[]> {
  try {
    return await api("/api/industry-template-catalog", { cache: "default" });
  } catch {
    const templates: { id:string; industry:string; maturity_label:string }[] = await api("/api/industry-templates", { cache: "default" });
    return templates.map(({ id, industry, maturity_label }) => ({ id, industry, maturity_label }));
  }
}

function queryWithOrg(endpoint: string, organizationId: string) {
  return `/api/${endpoint}?organization_id=${encodeURIComponent(organizationId)}`;
}

export default function Home() {
  return <LocaleProvider><ThemeProvider><HomeContent /></ThemeProvider></LocaleProvider>;
}

function HomeContent() {
  const [user,setUser] = useState<User|null>(null);
  const [billing,setBilling] = useState<BillingStatus|null>(null);
  const [memberships,setMemberships] = useState<Membership[]>([]);
  const [org,setOrg] = useState<Organization|null>(null);
  const [inspectionRoute,setInspectionRoute] = useState<InspectionRoute|null>(() => typeof window === "undefined" ? null : parseInspectionRoute(window.location.hash));
  const [page,setPage] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    if (parseInspectionRoute(window.location.hash)) return "inspection-detail";
    const requested = normalizePage(window.location.hash.slice(1));
    return requested === "members" || hasPage(requested) ? requested : "dashboard";
  });
  const [records,setRecords] = useState<RecordRow[]>([]);
  const [dashboard,setDashboard] = useState<Record<string,unknown>|null>(null);
  const [busy,setBusy] = useState(true);
  const [saving,setSaving] = useState(false);
  const [error,setError] = useState("");
  const [notice,setNotice] = useState("");
  const [showModal,setShowModal] = useState(false);
  const [activeIssue,setActiveIssue] = useState<string|null>(null);
  const [integrityTarget,setIntegrityTarget] = useState<IntegrityTarget|null>(null);
  const [search,setSearch] = useState("");
  const [refreshKey,setRefreshKey] = useState(0);
  const [currentRole,setCurrentRole] = useState("");
  const loadSequence = useRef(0);
  const [apiHealthy,setApiHealthy] = useState<boolean|null>(null);
  const [showBilling,setShowBilling] = useState(false);
  const currentResource = resources.find(item => item.key === page);

  const refreshIdentity = useCallback(async (required = false) => {
    try {
      const payload = await api("/api/auth/me");
      setUser({...payload.user,is_system_admin:payload.is_system_admin});
      setBilling(payload.billing || null);
      setMemberships(payload.memberships || []);
      const wanted = localStorage.getItem("icms-org-id");
      const available = (payload.memberships || []) as Membership[];
      const selected = available.find(m => m.organization.id === wanted && m.organization.is_active !== false)
        || available.find(m => m.organization.is_active !== false)
        || available.find(m => m.organization.id === wanted)
        || available[0];
      setOrg(selected?.organization || null);
      setCurrentRole(selected?.role || (payload.is_system_admin ? "manager" : ""));
      if (selected?.organization) {
        localStorage.setItem("icms-org-id", selected.organization.id);
        if (selected.organization.is_active === false) setPage("organizations");
      }
    } catch {
      setUser(null); setBilling(null); setMemberships([]); setOrg(null); setCurrentRole("");
      if (required) throw new Error("登录成功，但会话校验未通过。请刷新页面后重试。 ");
    } finally { setBusy(false); }
  },[]);

  useEffect(() => { refreshIdentity(); },[refreshIdentity]);
  useEffect(() => { if (!notice) return; const timer = setTimeout(() => setNotice(""),3600); return () => clearTimeout(timer); },[notice]);
  useEffect(() => {
    const syncFromHistory = () => {
      const route = parseInspectionRoute(window.location.hash);
      if(route){setInspectionRoute(route);setPage("inspection-detail");return;}
      setInspectionRoute(null);
      const requested = normalizePage(window.location.hash.slice(1));
      if (requested === "members" || hasPage(requested)) setPage(requested);
    };
    window.addEventListener("popstate", syncFromHistory);
    return () => window.removeEventListener("popstate", syncFromHistory);
  },[]);
  useEffect(() => {
    const route = page === "inspection-detail" && inspectionRoute ? `inspection/${encodeURIComponent(inspectionRoute.inspectionId)}/${inspectionRoute.tab}` : page;
    if (window.location.hash.slice(1) !== route) window.history.pushState(null, "", `#${route}`);
  },[page,inspectionRoute]);
  useEffect(() => {
    let active = true;
    const check = async () => {
      try {
        const response = await fetch(`${API}/health`, { cache: "no-store" });
        const payload = await response.json().catch(() => ({}));
        if (active) setApiHealthy(response.ok && payload.status === "ok");
      } catch { if (active) setApiHealthy(false); }
    };
    check();
    const timer = window.setInterval(check, 30000);
    return () => { active = false; window.clearInterval(timer); };
  },[]);

  const loadPage = useCallback(async () => {
    const sequence = ++loadSequence.current;
    if (!user || !org) { setRecords([]); setDashboard(null); return; }
    setBusy(true); setError("");
    try {
      if (page === "dashboard") { const data = await api(`/api/dashboard?organization_id=${org.id}`); if (sequence === loadSequence.current) { setDashboard(data); setRecords([]); } }
      else if (page === "organizations") { const rows = await api("/api/organizations"); if (sequence === loadSequence.current) setRecords(rows); }
      else if (page === "members") { const rows = await api(`/api/organizations/${org.id}/members`); if (sequence === loadSequence.current) setRecords(rows); }
      else if (page === "issues") { const rows = await api(queryWithOrg("issues",org.id)); if (sequence === loadSequence.current) setRecords(rows); }
      else if (page === "evidence") { const rows = await api(queryWithOrg("evidence",org.id)); if (sequence === loadSequence.current) setRecords(rows); }
      else if (page === "risks") { if (sequence === loadSequence.current) setRecords([]); }
      else if (currentResource) { const rows = await api(queryWithOrg(currentResource.endpoint,org.id)); if (sequence === loadSequence.current) setRecords(rows); }
    } catch (err) { if (sequence === loadSequence.current) setError(err instanceof Error ? err.message : "加载失败"); }
    finally { if (sequence === loadSequence.current) setBusy(false); }
  },[user,org,page,currentResource,refreshKey]);
  useEffect(() => { loadPage(); },[loadPage]);

  const selectOrg = (id: string) => {
    const membership = memberships.find(item => item.organization.id === id);
    const next = membership?.organization;
    if (!next) return;
    setOrg(next); setCurrentRole(membership.role); setRecords([]); setDashboard(null); setActiveIssue(null); setIntegrityTarget(null); localStorage.setItem("icms-org-id",id); setPage(next.is_active === false ? "organizations" : "dashboard");
  };

  const signOut = async () => { try { await api("/api/auth/logout",{method:"POST"}); } catch {} setUser(null); setOrg(null); setRecords([]); setDashboard(null); setActiveIssue(null); };
  const handleBillingActivated = useCallback(async () => {
    await refreshIdentity(true);
    setShowBilling(false);
    setNotice("支付成功，一年使用权限已开通");
  },[refreshIdentity]);
  const showToast = (message:string) => { setNotice(message); setRefreshKey(key => key + 1); };
  const navigateFromDashboard = (destination:string) => { setPage(destination); setSearch(""); setError(""); setActiveIssue(null); setIntegrityTarget(null); };
  const navigateFromIntegrity = (target:IntegrityTarget) => { setPage(target.page); setSearch(""); setError(""); setActiveIssue(null); setIntegrityTarget(target); };

  if (busy && !user) return <div className="boot"><LoaderCircle className="spin" size={26}/><span>正在连接本地内控系统</span></div>;
  if (!user) return <Login onSuccess={async()=>{ await refreshIdentity(true); }} />;
  if (billing?.policy_active && !billing.allowed && !user.is_system_admin) return <BillingCheckout billing={billing} expired onActivated={handleBillingActivated} onSignOut={signOut}/>;

  const activeNav = page === "members" ? "organizations" : page === "inspection-detail" || ["inspection-tests","findings"].includes(page) ? "inspections" : page;
  const readonly = currentRole === "viewer";
  const canManage = ["manager","auditor"].includes(currentRole) || !!user.is_system_admin;
  const resourceCanWrite = !!user.is_system_admin || (currentResource
    ? ["inspections","inspection-tests","findings"].includes(currentResource.key)
      ? ["manager","auditor"].includes(currentRole)
      : currentRole === "manager"
    : false);
  const rows = records.filter(row => JSON.stringify(row).toLowerCase().includes(search.toLowerCase()));
  const navItem = [...nav, ...internalControlNav].find(item => item.id === activeNav);
  const PageIcon = navItem?.icon || LayoutDashboard;
  const guidePageId = page === "user-management" ? page : !org ? "organization-setup" : page;
  const pageTitle = page === "members" ? "公司成员" : page === "inspection-detail" && inspectionRoute ? inspectionTabLabels[inspectionRoute.tab] : legacyRouteLabels[page] || navItem?.label || "工作台";
  const guidePageTitle = page === "user-management" ? pageTitle : !org ? "创建公司" : pageTitle;
  const renderNavItem = (item: (typeof nav)[number] | (typeof internalControlNav)[number]) => { const Icon = item.icon; const chosen = activeNav === item.id; const groupStart = ["organizations","industry-library"].includes(item.id); return <button key={item.id} className={`nav-item ${chosen?"active":""} ${groupStart?"nav-group-start":""}`} onClick={() => {setInspectionRoute(null);setPage(item.id);setError("");setSearch("");setActiveIssue(null);setIntegrityTarget(null);}}><Icon size={17} strokeWidth={1.8}/><span>{item.label}</span>{item.id==="issues" && <span className="nav-count">{dashboard?.open_issues as number || 0}</span>}</button>; };

  const openInspection = (inspectionId:string) => { setInspectionRoute({inspectionId,tab:"overview"});setPage("inspection-detail");setError("");setSearch(""); };
  const openInspectionTab = (tab:InspectionTab) => { if(inspectionRoute)setInspectionRoute({...inspectionRoute,tab}); };
  const openLegacyPage = (legacyPage:string) => { setInspectionRoute(null);setPage(legacyPage);setSearch("");setError(""); };

  return <main className="app-shell">
    <aside className="sidebar">
      <div className="brand"><div className="brand-mark"><ShieldCheck size={21}/></div><div><b>contrlio Enterprise</b><span>企业内控管理系统</span></div></div>
      <div className="org-switch"><div className="org-symbol"><Building2 size={18}/></div><label><small>当前公司</small><select aria-label="切换公司" data-no-translate value={org?.id || ""} onChange={e => selectOrg(e.target.value)}>{memberships.map(item => <option key={item.organization.id} value={item.organization.id}>{item.organization.name}</option>)}{user.is_system_admin && !org && <option value="">请选择公司</option>}</select></label><ChevronDown size={14}/></div>
      <div className="nav-caption">工作空间</div>
      <nav className="nav-list">{nav.map(renderNavItem)}<div className="nav-subsection-label">内控管理</div>{internalControlSections.map(section=>{const items=section.items.filter(item=>item.id!=="user-management"||user.is_system_admin);return <div className="nav-section" key={section.title}><div className="nav-section-title">{section.title}</div>{items.map(renderNavItem)}</div>;})}</nav>
      <div className="sidebar-bottom"><div className="local-badge"><span className="live-dot"/> 本地工作空间 <span className="local-en">LOCAL</span></div><button className="profile" onClick={signOut}><div className="avatar">{user.full_name?.slice(0,1)||"管"}</div><div className="profile-info"><b data-no-translate>{user.full_name}</b><span>{roleLabels[currentRole] || "系统管理员"}</span></div><LogOut size={16} className="profile-out"/></button></div>
    </aside>

    <section className="main-area">
      <header className="topbar"><div className="breadcrumbs"><span>内控工作台</span><span className="crumb-sep">/</span><b>{pageTitle}</b></div><div className="top-actions">{billing?.policy_active&&billing.status==="trial"&&<button className="trial-pill" onClick={()=>setShowBilling(true)}><CalendarClock size={14}/> 试用剩余 {billing.days_remaining} 天 <span>开通一年 ¥5,000</span></button>}{billing?.policy_active&&billing.status==="paid"&&<span className="paid-pill"><CreditCard size={13}/> 已开通至 {dateShort(billing.expires_at)}</span>}{billing?.policy_active&&billing.status==="permanent"&&<span className="paid-pill"><BadgeCheck size={13}/> 永久授权</span>}<OperationGuideButton pageId={guidePageId} pageTitle={guidePageTitle} fields={currentResource?.fields||[]}/><div className={`connection ${apiHealthy===false?"offline":""}`}><i/>{apiHealthy===null?"连接检查中":apiHealthy?"API 服务正常":"API 连接异常"}</div><div className="top-avatar">{user.full_name?.slice(0,1)||"管"}</div></div></header>
      <div className="page-content">
        {page === "user-management" && user.is_system_admin ? <UserManagementPage currentUserId={user.id} onNotice={showToast}/> : !org ? <OrganizationSetup user={user} onCreated={async()=>{await refreshIdentity();setPage("dashboard");showToast("公司与行业参考数据已创建");}}/> : page === "inspection-detail" && inspectionRoute ? <InspectionDetail key={`${org.id}:${inspectionRoute.inspectionId}`} organizationId={org.id} inspectionId={inspectionRoute.inspectionId} tab={inspectionRoute.tab} onTabChange={openInspectionTab} onOpenLegacyPage={openLegacyPage}/> : page === "internal-reports" ? <InternalControlReportPage organizationId={org.id} organizationName={org.name}/> : page === "settings" ? <SettingsPage org={org} canManage={currentRole==="manager"||!!user.is_system_admin} billing={billing} isSystemAdmin={!!user.is_system_admin} onOpenBilling={()=>setShowBilling(true)}/> : page === "dashboard" ? <Dashboard org={org} data={dashboard} onNavigate={navigateFromDashboard} loading={busy} onCreate={()=>setPage("organizations")}/> : page === "risks" ? <RiskManagementPage key={`risks:${org.id}`} organizationId={org.id} canManage={currentRole==="manager"||!!user.is_system_admin} onNotice={showToast} onError={setError}/> : page === "rcms" ? <RiskControlMatrixPage key={`rcm:${org.id}`} organizationId={org.id} onError={setError} onNavigate={destination=>{setInspectionRoute(null);setPage(destination);setSearch("");setError("");setIntegrityTarget(null);}} onOpenTarget={navigateFromIntegrity}/> : page === "industry-library" ? <IndustryLibraryPage org={org} canApply={currentRole==="manager"||!!user.is_system_admin} onApplied={showToast}/> : page === "compliance-library" ? <ComplianceLibraryPage org={org} onNavigate={setPage}/> : page === "policy-review" ? <PolicyReviewPage org={org} canUse={currentRole==="manager"||currentRole==="auditor"||!!user.is_system_admin} onOpenSettings={()=>setPage("settings")}/> : page === "ai-assistant" ? <AIAssistantPage org={org} canUse={currentRole==="manager"||currentRole==="auditor"||!!user.is_system_admin} onOpenSettings={()=>setPage("settings")}/> : page === "organizations" ? <OrganizationsPage org={org} organizations={records} memberships={memberships} isSystemAdmin={!!user.is_system_admin} onSelectOrg={selectOrg} onOpenMembers={()=>setPage("members")} canManage={memberships.some(item=>item.role==="manager"&&item.organization.is_active!==false)||!!user.is_system_admin} onCreated={async message=>{await refreshIdentity();showToast(message);}}/> : page === "members" ? <MembersPage org={org} members={records} currentUserId={user.id} canManage={currentRole==="manager"||!!user.is_system_admin} onCreated={showToast}/> : page === "issues" ? <IssuesPage org={org} rows={rows} role={currentRole} user={user} loading={busy} search={search} setSearch={setSearch} activeIssue={activeIssue} setActiveIssue={setActiveIssue} onChanged={showToast}/> : page === "evidence" ? <EvidencePage org={org} canManage={canManage} rows={rows} loading={busy} onChanged={showToast}/> : currentResource ? <ResourcePage key={`${page}:${org.id}`} integrityTarget={integrityTarget?.page === page ? integrityTarget : null} definition={currentResource} org={org} rows={rows} loading={busy} readonly={!resourceCanWrite} canManage={resourceCanWrite} search={search} setSearch={setSearch} showModal={showModal} setShowModal={setShowModal} onCreated={showToast} onError={setError} onOpenIssue={issueId=>{setInspectionRoute(null);setPage("issues");setSearch("");setError("");setActiveIssue(issueId);}} onOpenInspection={openInspection} onOpenLegacyPage={openLegacyPage}/> : <div className="empty-panel"><Sparkles/><h2>此模块即将开放</h2><p>后续阶段会继续完善相关内控流程。</p></div>}
        {error && <div className="error-toast"><AlertTriangle size={16}/>{error}<button onClick={()=>setError("")}><X size={15}/></button></div>}
        {notice && <div className="success-toast"><Check size={16}/>{notice}</div>}
      </div>
      <footer className="footer"><span>contrlio企业内控管理系统</span><span>本地开发环境 <i/> {apiHealthy===true?"API 与基础服务已连接":apiHealthy===false?"API 暂不可用":"正在检查本地服务"}</span></footer>
    </section>
    {showBilling&&billing?.policy_active&&<div className="billing-modal-backdrop"><BillingCheckout billing={billing} onClose={()=>setShowBilling(false)} onActivated={handleBillingActivated}/></div>}
  </main>;
}

function BillingCheckout({billing,expired=false,onActivated,onClose,onSignOut}:{billing:BillingStatus;expired?:boolean;onActivated:()=>Promise<void>;onClose?:()=>void;onSignOut?:()=>void}) {
  const [creating,setCreating]=useState(false);const [orderId,setOrderId]=useState("");const [error,setError]=useState("");const [checking,setChecking]=useState(false);const [qrUnavailable,setQrUnavailable]=useState(false);
  const checkOrder=useCallback(async()=>{
    if(!orderId)return;setChecking(true);
    try{const order=await api(`/api/billing/orders/${encodeURIComponent(orderId)}`);if(order.status==="paid"){setOrderId("");await onActivated();}else if(order.status==="closed"){setError("订单已过期，请重新发起支付");setOrderId("");}}
    catch(err){setError(err instanceof Error?err.message:"支付状态查询失败");}
    finally{setChecking(false);}
  },[orderId,onActivated]);
  useEffect(()=>{if(!orderId)return;const timer=window.setInterval(()=>void checkOrder(),3500);return()=>window.clearInterval(timer);},[orderId,checkOrder]);
  const startPayment=async()=>{
    setCreating(true);setError("");
    try{const order=await api("/api/billing/orders",{method:"POST"});setOrderId(String(order.id));}
    catch(err){setError(err instanceof Error?err.message:"创建支付订单失败");}
    finally{setCreating(false);}
  };
  const panel = <section className={`billing-card ${expired?"billing-card-expired":""}`}>
    {!expired&&onClose&&<button type="button" className="billing-close" aria-label="关闭" onClick={onClose}><X size={17}/></button>}
    <div className="billing-icon"><CreditCard size={23}/></div>
    <div className="billing-kicker">ACCOUNT ACCESS</div>
    <h1>{expired?"免费试用已结束":"开通完整使用权限"}</h1>
    <p className="billing-copy">{expired?"你的 3 天试用期已结束。支付后立即恢复全部内控工作空间和历史数据。":"试用期内可随时开通；权限从试用期结束后开始计算。"}</p>
    <div className="billing-offer"><div><span>一次支付</span><b>¥5,000</b></div><i/><div><span>使用期限</span><b>一年</b></div></div>
    {orderId?<div className="billing-qr-panel">{qrUnavailable?<p>收款码尚未配置，请联系系统管理员确认收款方式。</p>:<Image src="/alipay-collection.jpg" alt="支付宝收款码，金额 5,000 元" width={1708} height={2560} onError={()=>setQrUnavailable(true)}/>}<b>支付宝账号：{billing.receiver_account||"请联系系统管理员确认"}</b><span>扫码支付 ¥5,000，备注填写注册邮箱</span><small>订单号：{orderId}</small><p>付款后请联系管理员 admin@contrlio.com 核对到账；确认后本账号开通一年。</p></div>:null}
    {error&&<div className="billing-error"><AlertTriangle size={15}/>{error}</div>}
    {!orderId&&<button className="primary-btn billing-pay" disabled={creating} onClick={()=>void startPayment()}>{creating?<><LoaderCircle className="spin" size={17}/> 正在准备收款码</>:<><CreditCard size={16}/> 查看支付宝收款码 ¥5,000</>}</button>}
    {orderId&&<button type="button" className="billing-check" disabled={checking} onClick={()=>void checkOrder()}>{checking?<LoaderCircle className="spin" size={14}/>:<RotateCcw size={14}/>} 我已支付，刷新状态</button>}
    <div className="billing-secure"><ShieldCheck size={14}/> 管理员核实支付宝到账后开通；页面操作不会直接解锁账号。</div>
    {onSignOut&&<button className="billing-signout" onClick={onSignOut}>退出登录</button>}
  </section>;
  return expired?<main className="billing-page">{panel}</main>:panel;
}

function AccountMembershipSettings({ billing, isSystemAdmin, onOpenBilling }: { billing: BillingStatus; isSystemAdmin: boolean; onOpenBilling: () => void }) {
  const isAdmin = isSystemAdmin || billing.status === "admin";
  const isPermanent = billing.status === "permanent";
  const isPaid = billing.status === "paid";
  const isTrial = billing.status === "trial";
  const currentStatus = isAdmin ? "管理员账号 · 免费使用" : isPermanent ? "永久授权 · 免费使用" : isPaid ? `年费会员 · 有效至 ${dateShort(billing.expires_at)}` : isTrial ? `免费试用中 · 剩余 ${billing.days_remaining ?? 0} 天` : "试用期已结束";
  const paymentLabel = isPaid ? "续费一年" : "立即开通一年";
  const freeAccess = isAdmin || isPermanent;
  return <section className="card settings-card settings-membership-card">
    <div className="settings-icon settings-membership-icon"><CreditCard size={19}/></div>
    <div className="settings-copy settings-membership-copy">
      <div className="settings-membership-heading"><div><div className="section-kicker">ACCOUNT MEMBERSHIP</div><h2>账号与会员</h2></div><span className={`membership-status ${isAdmin?"admin":isPermanent?"permanent":isPaid?"paid":isTrial?"trial":"expired"}`}><i/>{currentStatus}</span></div>
      <p>{isPermanent?"该演示账号已获永久免试用授权，不受试用期限制，也无需支付年费。":"普通账号注册后可免费试用 3 天。试用期内可以提前支付年费；提前开通的会员期从试用结束后开始，已有会员续费则从当前到期日顺延一年。"}</p>
      {!freeAccess&&<div className="membership-plan-row"><div className="membership-plan-price"><span>年费方案</span><b>¥{Math.round(billing.price_fen / 100)}<small> / 年</small></b></div><div className="membership-plan-method"><CreditCard size={16}/><div><b>支付宝扫码支付</b><span>{billing.payment_configured ? `收款账号：${billing.receiver_account}` : "收款账号暂未配置，请联系管理员"}</span></div></div></div>}
      <div className="membership-actions">{freeAccess ? <div className="settings-note"><Check size={15}/><span>{isPermanent?"此账号仅免除费用，仍按公司经理角色管理本公司数据。":"管理员账号免年费，可使用全部系统功能。"}</span></div> : <><button type="button" className="primary-btn membership-pay-btn" disabled={!billing.payment_configured} onClick={onOpenBilling}><CreditCard size={15}/>{billing.payment_configured ? `${paymentLabel} · ¥${Math.round(billing.price_fen / 100)}` : "请联系管理员配置收款方式"}</button><span className="membership-payment-note">付款后请备注注册邮箱；管理员核对到账后为账号开通。</span></>}</div>
    </div>
  </section>;
}

function SettingsPage({ org, canManage, billing, isSystemAdmin, onOpenBilling }: { org: Organization; canManage: boolean; billing: BillingStatus|null; isSystemAdmin: boolean; onOpenBilling: () => void }) {
  const { locale, setLocale } = useI18n();
  const { color, setColor } = useThemeColor();
  const themeColors = [{ name: "青绿", value: "#3da98d" }, { name: "海蓝", value: "#3478c8" }, { name: "紫藤", value: "#7956b8" }, { name: "莓红", value: "#c45072" }, { name: "琥珀", value: "#bc781e" }];
  return <div className="module-page settings-page">
    <ModuleHeader eyebrow="ACCOUNT SETTINGS" title="账号设置" subtitle="查看账号试用与会员方案，并管理界面偏好。" />
    {billing?.policy_active && <AccountMembershipSettings billing={billing} isSystemAdmin={isSystemAdmin} onOpenBilling={onOpenBilling}/>}
    <section className="card settings-card">
      <div className="settings-icon"><Settings size={19}/></div>
      <div className="settings-copy"><h2>语言与地区</h2><p>选择 contrlio企业内控管理系统显示语言。公司名称、法规原文和业务记录会保留原始语言。</p>
        <label className="field-label settings-language-label">界面语言
          <select value={locale} onChange={event => setLocale(event.target.value as "zh-CN" | "en-US")}>
            <option value="zh-CN">简体中文</option><option value="en-US">English</option>
          </select>
        </label>
        <div className="settings-note"><Check size={15}/><span>语言选择保存在此浏览器中，刷新页面后仍会生效。</span></div>
      </div>
      <span className="settings-locale-pill">{locale === "zh-CN" ? "中文界面" : "English interface"}</span>
    </section>
    <section className="card settings-card theme-settings-card">
      <div className="settings-icon theme-settings-icon"><Palette size={19}/></div>
      <div className="settings-copy"><h2>主题颜色</h2><p>选择系统的整体主题色，页面背景、卡片、侧边栏和强调元素都会随之变化。也可以自定义颜色。</p>
        <div className="theme-palette" role="group" aria-label="主题颜色预设">{themeColors.map(option => <button type="button" key={option.value} className={`theme-swatch${color === option.value ? " selected" : ""}`} style={{ backgroundColor: option.value }} aria-label={option.name} aria-pressed={color === option.value} title={option.name} onClick={() => setColor(option.value)}>{color === option.value && <Check size={14}/>}</button>)}</div>
        <label className="theme-custom-control"><span>自定义颜色</span><input type="color" value={color} aria-label="选择自定义主题颜色" onChange={event => setColor(event.target.value)}/><code>{color.toUpperCase()}</code></label>
        <div className="settings-note"><Check size={15}/><span>主题颜色保存在此浏览器中，刷新后仍会生效。</span></div>
      </div>
      <span className="settings-theme-pill"><i style={{ backgroundColor: color }}/>{color.toUpperCase()}</span>
    </section>
    <div className="settings-section-title"><div><div className="section-kicker">OPTIONAL AI PROVIDER</div><h2>AI 内控助手</h2><p>管理当前公司的模型服务商连接；模型调用仍由 AI 内控助手菜单发起。</p></div></div>
    {canManage && <AIQuotaSettings org={org}/>}
    <AIProviderSettings org={org} canManage={canManage}/>
  </div>;
}

function UserManagementPage({currentUserId,onNotice}:{currentUserId:string;onNotice:(message:string)=>void}) {
  const [items,setItems]=useState<Record<string,unknown>[]>([]);
  const [invitations,setInvitations]=useState<Record<string,unknown>[]>([]);
  const [newInvitation,setNewInvitation]=useState<{id:string;code:string}|null>(null);
  const [revealedInvitations,setRevealedInvitations]=useState<Record<string,string>>({});
  const [inviteError,setInviteError]=useState("");const [inviteLoading,setInviteLoading]=useState(true);const [creatingInvite,setCreatingInvite]=useState(false);const [revokingInviteId,setRevokingInviteId]=useState("");const [inviteCopied,setInviteCopied]=useState(false);
  const [revealingInviteId,setRevealingInviteId]=useState("");const [copiedInviteId,setCopiedInviteId]=useState("");
  const [summary,setSummary]=useState({total:0,active:0,inactive:0,system_admins:0});
  const [query,setQuery]=useState("");const [appliedQuery,setAppliedQuery]=useState("");
  const [status,setStatus]=useState("");const [offset,setOffset]=useState(0);
  const [total,setTotal]=useState(0);const [loading,setLoading]=useState(true);const [error,setError]=useState("");const [updatingId,setUpdatingId]=useState("");
  const limit=50;
  const load=useCallback(async()=>{
    setLoading(true);setError("");
    const params=new URLSearchParams({offset:String(offset),limit:String(limit)});
    if(appliedQuery.trim())params.set("q",appliedQuery.trim());
    if(status)params.set("is_active",String(status==="active"));
    try{const data=await api(`/api/admin/users?${params.toString()}`);setItems(data.items||[]);setTotal(Number(data.total||0));setSummary(data.summary||{total:0,active:0,inactive:0,system_admins:0});}
    catch(err){setError(err instanceof Error?err.message:"用户列表读取失败");}
    finally{setLoading(false);}
  },[appliedQuery,offset,status]);
  useEffect(()=>{void load();},[load]);
  const loadInvitations=useCallback(async()=>{
    setInviteLoading(true);setInviteError("");
    try{
      const data=await api("/api/admin/registration-invitations");const rows=(data.items||[]) as Record<string,unknown>[];setInvitations(rows);
      setNewInvitation(current=>current&&rows.some(row=>String(row.id)===current.id&&(row.used_at||row.revoked_at))?null:current);
    }catch(err){setInviteError(err instanceof Error?err.message:"邀请码列表读取失败");}
    finally{setInviteLoading(false);}
  },[]);
  useEffect(()=>{void loadInvitations();},[loadInvitations]);
  const createInvitation=async()=>{
    setCreatingInvite(true);setInviteError("");setInviteCopied(false);
    try{
      const data=await api("/api/admin/registration-invitations",{method:"POST",body:JSON.stringify({})});
      setNewInvitation({id:String(data.id),code:String(data.code)});await loadInvitations();
    }catch(err){setInviteError(err instanceof Error?err.message:"邀请码生成失败");}
    finally{setCreatingInvite(false);}
  };
  const copyInvitation=async()=>{
    if(!newInvitation)return;
    try{await navigator.clipboard.writeText(newInvitation.code);setInviteCopied(true);}
    catch{setInviteError("复制失败，请手动选择并复制邀请码");}
  };
  const toggleInvitationCode=async(id:string)=>{
    if(revealedInvitations[id]){setRevealedInvitations(current=>{const next={...current};delete next[id];return next;});return;}
    setRevealingInviteId(id);setInviteError("");
    try{const data=await api(`/api/admin/registration-invitations/${id}/code`);setRevealedInvitations(current=>({...current,[id]:String(data.code)}));}
    catch(err){setInviteError(err instanceof Error?err.message:"邀请码读取失败");}
    finally{setRevealingInviteId("");}
  };
  const copyInvitationCode=async(id:string)=>{
    const code=revealedInvitations[id];if(!code)return;
    try{await navigator.clipboard.writeText(code);setCopiedInviteId(id);}
    catch{setInviteError("复制失败，请手动选择并复制邀请码");}
  };
  const revokeInvitation=async(row:Record<string,unknown>)=>{
    const id=String(row.id||"");
    if(!window.confirm("撤销此邀请码后，尚未使用的人将无法注册。继续吗？"))return;
    setRevokingInviteId(id);setInviteError("");
    try{
      await api(`/api/admin/registration-invitations/${id}/revoke`,{method:"POST",body:JSON.stringify({})});
      if(newInvitation?.id===id)setNewInvitation(null);
      onNotice("邀请码已撤销");await loadInvitations();
    }catch(err){setInviteError(err instanceof Error?err.message:"邀请码撤销失败");}
    finally{setRevokingInviteId("");}
  };
  const changeStatus=async(row:Record<string,unknown>)=>{
    const id=String(row.id||"");const active=Boolean(row.is_active);const name=String(row.full_name||row.email||"此用户");
    if(active&&!window.confirm(`确定停用 ${name}（${String(row.email)}）？停用后将立即撤销其登录会话，公司成员关系和业务记录会保留。`))return;
    setUpdatingId(id);setError("");
    try{await api(`/api/admin/users/${id}/status`,{method:"PATCH",body:JSON.stringify({is_active:!active})});onNotice(active?"用户已停用，现有会话已撤销":"用户已重新启用");await load();}
    catch(err){setError(err instanceof Error?err.message:"账号状态更新失败");}
    finally{setUpdatingId("");}
  };
  const confirmPayment=async(row:Record<string,unknown>)=>{
    const id=String(row.id||"");const name=String(row.full_name||row.email||"此用户");
    const pendingPayment=row.pending_payment as {amount_fen?:number}|null;const amountYuan=Math.round((pendingPayment?.amount_fen??500_000)/100).toLocaleString("zh-CN");
    if(!window.confirm(`请先在支付宝收款账户核实 ¥${amountYuan} 已到账。确认后将为 ${name} 开通一年，并记录本次人工核账。继续吗？`))return;
    setUpdatingId(`billing:${id}`);setError("");
    try{await api(`/api/admin/users/${id}/billing/activate`,{method:"POST",body:JSON.stringify({})});onNotice(`${name} 已开通一年`);await load();}
    catch(err){setError(err instanceof Error?err.message:"开通失败");}
    finally{setUpdatingId("");}
  };
  const setPermanentAccess=async(row:Record<string,unknown>)=>{
    const id=String(row.id||"");const name=String(row.full_name||row.email||"此用户");const enabled=Boolean(row.is_billing_exempt);
    const action=enabled?"取消该账号的永久免试用授权，让账号恢复常规试用/年费规则":"为该账号设置永久免试用授权。账号仍保留普通公司角色，不会获得系统管理员权限";
    if(!window.confirm(`确定${action}吗？`))return;
    setUpdatingId(`permanent:${id}`);setError("");
    try{await api(`/api/admin/users/${id}/billing/permanent`,{method:"PATCH",body:JSON.stringify({permanent_access:!enabled})});onNotice(enabled?`${name} 已恢复常规权益规则`:`${name} 已获永久免试用授权`);await load();}
    catch(err){setError(err instanceof Error?err.message:"永久授权更新失败");}
    finally{setUpdatingId("");}
  };
  const pageCount=Math.max(1,Math.ceil(total/limit));const currentPage=Math.floor(offset/limit)+1;
  return <div className="module-page user-admin-page">
    <ModuleHeader eyebrow="SYSTEM ADMINISTRATION" title="用户管理" subtitle="查看全局注册账号、公司归属和试用/付费状态，并管理账号访问。"/>
    <div className="user-admin-summary">{[{label:"全部用户",value:summary.total},{label:"已启用",value:summary.active},{label:"已停用",value:summary.inactive},{label:"系统管理员",value:summary.system_admins}].map(card=><div className="user-summary-card" key={card.label}><span>{card.label}</span><b>{card.value}</b></div>)}</div>
    <section className="card registration-invitations-card">
      <div className="registration-invitations-heading"><div className="table-title-icon"><KeyRound size={17}/></div><div><h3>注册邀请码</h3><p>系统管理员生成后转交给新用户；每个邀请码只能注册一个新账号。</p></div><button className="primary-btn registration-invite-create" type="button" disabled={creatingInvite} onClick={()=>void createInvitation()}>{creatingInvite?<LoaderCircle className="spin" size={15}/>:<Plus size={15}/>}生成邀请码</button></div>
      <p className="registration-invitations-note">系统管理员可随时查看仍有效的邀请码；数据库仅保存加密副本和校验摘要。未使用的邀请码可以撤销，现有账号登录不需要邀请码。</p>
      {inviteError&&<div className="form-error registration-invite-error"><AlertTriangle size={15}/>{inviteError}</div>}
      {newInvitation&&<div className="registration-invite-secret"><div><b>新邀请码</b><span>复制并安全转交；之后仍可在列表中查看或复制。</span></div><code>{newInvitation.code}</code><button className="outline-btn" type="button" onClick={()=>void copyInvitation()}><Copy size={14}/>{inviteCopied?"已复制":"复制邀请码"}</button></div>}
      <div className="registration-invitation-list">
        <div className="registration-invitation-list-head"><b>邀请码记录</b><span>{invitations.length} 个</span></div>
        {inviteLoading?<div className="registration-invitation-empty"><LoaderCircle className="spin" size={16}/>正在读取邀请码…</div>:!invitations.length?<div className="registration-invitation-empty">尚未生成邀请码</div>:invitations.map(row=>{
          const id=String(row.id);const used=Boolean(row.used_at);const revoked=Boolean(row.revoked_at);const state=used?"已使用":revoked?"已撤销":"待使用";
          const codeAvailable=Boolean(row.code_available);const revealed=!used&&!revoked&&Boolean(revealedInvitations[id]);
          return <div className="registration-invitation-item" key={id}><div className="registration-invitation-row"><span className={`registration-invite-state ${used?"used":revoked?"revoked":"available"}`}>{state}</span><span>{dateShort(row.created_at)}</span><span className="registration-invite-recipient">{used?`注册账号：${String(row.used_by_email||"未知")}`:revoked?"不可再使用":codeAvailable?"尚未使用":"历史邀请码 · 未保存加密副本"}</span><span className="registration-invite-actions">{!used&&!revoked&&<><button className="text-btn registration-invite-view" type="button" disabled={!codeAvailable||revealingInviteId===id} title={codeAvailable?"查看邀请码":"历史邀请码未保存密文，无法找回"} onClick={()=>void toggleInvitationCode(id)}>{revealingInviteId===id?<LoaderCircle className="spin" size={13}/>:revealed?<EyeOff size={13}/>:<Eye size={13}/>}<span>{revealingInviteId===id?"读取中":revealed?"隐藏":codeAvailable?"查看":"不可查看"}</span></button><button className="text-btn registration-invite-revoke" type="button" disabled={revokingInviteId===id} onClick={()=>void revokeInvitation(row)}>{revokingInviteId===id?<LoaderCircle className="spin" size={13}/>:<X size={13}/>}撤销</button></>}</span></div>{revealed&&<div className="registration-invitation-reveal"><code>{revealedInvitations[id]}</code><button className="outline-btn" type="button" onClick={()=>void copyInvitationCode(id)}><Copy size={13}/>{copiedInviteId===id?"已复制":"复制邀请码"}</button></div>}</div>;
        })}
      </div>
    </section>
    <section className="card table-card user-admin-table-card">
      <div className="table-headline"><div className="table-title-icon"><Users size={17}/></div><div><h3>注册账号</h3><p>按姓名或邮箱搜索；停用不会删除用户的公司关系和历史记录。</p></div><div className="user-admin-controls"><form className="search-box" onSubmit={e=>{e.preventDefault();setOffset(0);setAppliedQuery(query);}}><Search size={14}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder="搜索姓名或邮箱"/><button className="user-search-submit" type="submit">搜索</button></form><select className="user-status-filter" aria-label="按账号状态筛选" value={status} onChange={e=>{setOffset(0);setStatus(e.target.value);}}><option value="">全部状态</option><option value="active">已启用</option><option value="inactive">已停用</option></select><span className="rows-count">{total} 个账号</span></div></div>
      {error&&<div className="form-error user-admin-error"><AlertTriangle size={15}/>{error}</div>}
      <div className="data-table-wrap"><table><thead><tr><th>账号</th><th>公司与角色</th><th>系统权限</th><th>注册时间</th><th>使用权益</th><th>账号状态</th><th>操作</th></tr></thead><tbody>
        {loading?<tr><td colSpan={7} className="loading-cell"><LoaderCircle className="spin" size={19}/>正在读取用户…</td></tr>:items.map(row=>{
          const organizations=(row.organizations as {id:string;name:string;role:string}[]|undefined)||[];
          const active=Boolean(row.is_active);const isCurrent=String(row.id)===currentUserId;const id=String(row.id);
          const paidThrough=row.paid_through?new Date(String(row.paid_through)):null;
          const trialStart=row.trial_started_at?new Date(String(row.trial_started_at)):null;
          const trialEnd=trialStart?new Date(trialStart.getTime()+3*86400000):null;
          const permanent=Boolean(row.is_billing_exempt);
          const pendingPayment=row.pending_payment as {amount_fen?:number}|null;
          const pendingAmountYuan=pendingPayment?.amount_fen?Math.round(pendingPayment.amount_fen/100).toLocaleString("zh-CN"):"";
          const entitlement=row.is_system_admin?"永久":permanent?"永久授权":paidThrough&&paidThrough.getTime()>Date.now()?`已开通至 ${dateShort(paidThrough)}`:!trialStart?"试用待启用":trialEnd&&trialEnd.getTime()>Date.now()?`试用中 · 剩余 ${Math.ceil((trialEnd.getTime()-Date.now())/86400000)} 天`:"试用已结束";
          return <tr key={id}>
            <td><b className="user-name">{String(row.full_name||"未填写姓名")}</b><span className="user-email">{String(row.email)}</span></td>
            <td><div className="user-org-list">{organizations.length?organizations.map(org=><span key={org.id} title={`${org.name} · ${roleLabels[org.role]||org.role}`}>{org.name}<small>{roleLabels[org.role]||org.role}</small></span>):<span className="user-no-org">尚未加入公司</span>}</div></td>
            <td>{row.is_system_admin?<span className="user-admin-badge">系统管理员</span>:<span className="user-normal-role">普通用户</span>}</td>
            <td>{dateShort(row.created_at)}</td>
            <td><span className={`entitlement-pill ${entitlement.includes("已开通")||entitlement==="永久"||entitlement==="永久授权"?"entitlement-paid":entitlement.includes("试用中")?"entitlement-trial":"entitlement-expired"}`}>{entitlement}</span>{Boolean(row.pending_payment)&&<small className="pending-payment-hint">有待核实的 ¥{pendingAmountYuan} 支付申请</small>}</td>
            <td><span className={`state-pill user-status ${active?"user-status-on":"user-status-off"}`}>{active?"已启用":"已停用"}</span></td>
            <td><div className="user-admin-row-actions">
              <button className={`text-btn user-status-action ${active?"danger":""}`} disabled={updatingId===id||isCurrent&&active} title={isCurrent&&active?"不能停用当前登录账号":active?"停用账号":"重新启用账号"} onClick={()=>void changeStatus(row)}>{updatingId===id?<LoaderCircle className="spin" size={14}/>:active?<X size={14}/>:<Check size={14}/>}{active?"停用":"启用"}</button>
              {!row.is_system_admin&&<button className="text-btn user-grant-action" disabled={updatingId===`billing:${id}`} onClick={()=>void confirmPayment(row)}>{updatingId===`billing:${id}`?<LoaderCircle className="spin" size={14}/>:<CreditCard size={14}/>}确认到账开通一年</button>}
              {!row.is_system_admin&&<button className="text-btn user-grant-action" disabled={updatingId===`permanent:${id}`} onClick={()=>void setPermanentAccess(row)}>{updatingId===`permanent:${id}`?<LoaderCircle className="spin" size={14}/>:<BadgeCheck size={14} />}{permanent?"取消永久授权":"设为永久免费"}</button>}
            </div></td>
          </tr>;
        })}
        {!loading&&!items.length&&<tr><td colSpan={7} className="user-admin-empty">{error?"用户列表暂不可用":"没有匹配的用户账号"}</td></tr>}
      </tbody></table></div>
      <div className="user-admin-pagination"><span>第 {currentPage} / {pageCount} 页</span><div><button className="outline-btn" disabled={offset===0||loading} onClick={()=>setOffset(Math.max(0,offset-limit))}>上一页</button><button className="outline-btn" disabled={currentPage>=pageCount||loading} onClick={()=>setOffset(offset+limit)}>下一页</button></div></div>
    </section>
  </div>;
}

function Login({onSuccess}:{onSuccess:()=>Promise<void>}) {
  const [register,setRegister]=useState(false);
  const [email,setEmail]=useState("");const [password,setPassword]=useState("");const [fullName,setFullName]=useState("");const [registrationCode,setRegistrationCode]=useState("");
  const [organizationName,setOrganizationName]=useState("");const [organizationCode,setOrganizationCode]=useState("");const [industry,setIndustry]=useState("");
  const [templates,setTemplates]=useState<IndustryTemplateOption[]>([]);const [templateId,setTemplateId]=useState("");
  const [error,setError]=useState("");const [loading,setLoading]=useState(false);
  useEffect(()=>{if(register)loadIndustryTemplateOptions().then(setTemplates).catch(()=>setTemplates([]));},[register]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setLoading(true);setError("");try{await api("/api/auth/login",{method:"POST",body:JSON.stringify({email,password})});await onSuccess();}catch(err){setError(err instanceof Error?err.message:"登录失败");}finally{setLoading(false);}};
  const createAccount=async(e:FormEvent)=>{e.preventDefault();setLoading(true);setError("");try{await api("/api/auth/register-company",{method:"POST",body:JSON.stringify({registration_code:registrationCode,email,password,full_name:fullName,organization_name:organizationName,organization_code:organizationCode,industry,template_id:templateId||null})});await onSuccess();}catch(err){setError(err instanceof Error?err.message:"注册失败");}finally{setLoading(false);}};
  return <main className="login-screen"><div className="login-orb orb-one"/><div className="login-orb orb-two"/><section className="login-left"><div className="brand login-brand"><div className="brand-mark"><ShieldCheck size={22}/></div><div><b>contrlio Enterprise</b><span>企业内控管理系统</span></div></div><div className="login-pitch"><div className="eyebrow"><span/> LOCAL FIRST · 内控工作空间</div><h1>让每一项控制，<br/>都有迹可循。</h1><p>从风险识别、控制执行到问题整改，<br/>把内控工作连接成完整闭环。</p><div className="login-flow"><div><span>01</span><i/>风险与控制</div><div><span>02</span><i/>检查与证据</div><div><span>03</span><i/>整改与复核</div></div></div><div className="login-bottom"><span>数据留在你的电脑上</span><span>·</span><span>安全的本地工作环境</span></div></section><section className="login-right">{register?<form className="login-card register-card" onSubmit={createAccount}><div className="login-card-icon"><Building2 size={22}/></div><div className="login-card-eyebrow">建立本地工作空间</div><h2>邀请码注册账号</h2><p>请先向系统管理员获取邀请码。已有账号可直接返回登录。</p><label className="field-label">管理员注册邀请码<input autoComplete="off" value={registrationCode} onChange={e=>setRegistrationCode(e.target.value.toUpperCase())} required/><span className="field-hint">每个邀请码仅能注册一个新账号。</span></label><label className="field-label">姓名<input autoComplete="name" value={fullName} onChange={e=>setFullName(e.target.value)} required/></label><label className="field-label">工作邮箱<input autoComplete="email" type="email" value={email} onChange={e=>setEmail(e.target.value)} required/></label><label className="field-label">登录密码<input autoComplete="new-password" type="password" minLength={12} value={password} onChange={e=>setPassword(e.target.value)} required/><span className="field-hint">至少 12 位。</span></label><label className="field-label">公司名称<input value={organizationName} onChange={e=>setOrganizationName(e.target.value)} required/></label><label className="field-label">公司编号<input value={organizationCode} onChange={e=>setOrganizationCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,""))} required/></label><label className="field-label">行业参考样例 <span className="optional">可稍后选择</span><TemplateSelect templates={templates} value={templateId} onChange={id=>{setTemplateId(id);const selected=templates.find(item=>item.id===id);if(selected)setIndustry(selected.industry);}}/></label>{templateId&&<p className="register-template-note">将按所选阶段建立可编辑的组织架构、流程、风险、控制、RCM 和待执行抽样计划。</p>}<label className="field-label">行业<input value={industry} onChange={e=>setIndustry(e.target.value)} placeholder="例如：软件与信息技术"/></label>{error&&<div className="form-error"><AlertTriangle size={15}/>{error}</div>}<button className="primary-btn login-submit" disabled={loading}>{loading?<><LoaderCircle className="spin" size={17}/> 正在创建</>:<>注册并创建工作空间 <ArrowUpRight size={17}/></>}</button><div className="login-foot"><span>已有账号？</span><button type="button" className="link-btn" onClick={()=>{setRegister(false);setError("");}}>返回登录</button></div></form>:<form className="login-card" onSubmit={submit}><div className="login-card-icon"><ShieldCheck size={22}/></div><div className="login-card-eyebrow">欢迎回来</div><h2>登录你的工作空间</h2><p>输入账号，继续管理企业内控。</p><label className="field-label">工作邮箱<input autoComplete="username" type="email" value={email} onChange={e=>setEmail(e.target.value)} placeholder="name@company.com" required/></label><label className="field-label">登录密码<input autoComplete="current-password" type="password" value={password} onChange={e=>setPassword(e.target.value)} placeholder="请输入登录密码" required/></label>{error&&<div className="form-error"><AlertTriangle size={15}/>{error}</div>}<button className="primary-btn login-submit" disabled={loading}>{loading?<><LoaderCircle className="spin" size={17}/> 正在登录</>:<>登录工作空间 <ArrowUpRight size={17}/></>}</button><div className="login-foot"><button type="button" className="link-btn" onClick={()=>{setRegister(true);setError("");}}>邮箱注册账号并创建工作空间</button><span>忘记密码？请联系管理员</span></div></form>}</section></main>;
}

function TemplateSelect({templates,value,onChange}:{templates:IndustryTemplateOption[];value:string;onChange:(id:string)=>void}) {
  return <select value={value} onChange={e=>onChange(e.target.value)}><option value="">先不导入，稍后在参考库选择</option>{templates.map(item=><option key={item.id} value={item.id}>{item.industry} · {item.maturity_label}</option>)}</select>;
}

function OrganizationSetup({user,onCreated}:{user:User;onCreated:()=>void|Promise<void>}) {
  const [name,setName]=useState("");const [code,setCode]=useState("");const [industry,setIndustry]=useState("");const [templates,setTemplates]=useState<IndustryTemplateOption[]>([]);const [templateId,setTemplateId]=useState("");const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  useEffect(()=>{loadIndustryTemplateOptions().then(setTemplates).catch(()=>setTemplates([]));},[]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await api("/api/organizations",{method:"POST",body:JSON.stringify({name,code,industry,template_id:templateId||null})});await onCreated();}catch(err){setError(err instanceof Error?err.message:"创建失败");}finally{setBusy(false);}};
  return <div className="setup-grid"><div className="setup-copy"><div className="section-kicker">GETTING STARTED</div><h1>先创建你的公司，<br/>然后开始建立内控体系。</h1><p>所有业务数据都会保存在本机数据库中。可按行业和发展阶段导入一套可编辑的参考架构。</p><div className="setup-points"><span><Check size={15}/> 公司数据独立隔离</span><span><Check size={15}/> 结构可随业务持续完善</span><span><Check size={15}/> 样例检查保持待执行状态</span></div></div><form className="card create-org-card" onSubmit={submit}><div className="card-icon mint"><Building2 size={20}/></div><h2>创建公司</h2><p>你将自动成为该公司的经理。</p><label className="field-label">公司名称<input value={name} onChange={e=>setName(e.target.value)} placeholder="例如：远山科技有限公司" required/></label><label className="field-label">公司编号<input value={code} onChange={e=>setCode(e.target.value.toUpperCase().replace(/[^A-Z0-9_-]/g,""))} placeholder="例如：YUANSHAN" required/></label><label className="field-label">行业与发展阶段 <TemplateSelect templates={templates} value={templateId} onChange={id=>{setTemplateId(id);const selected=templates.find(item=>item.id===id);if(selected)setIndustry(selected.industry);}}/></label><label className="field-label">行业名称 <span className="optional">可修改</span><input value={industry} onChange={e=>setIndustry(e.target.value)} placeholder="例如：软件与信息技术"/></label>{error&&<div className="form-error">{error}</div>}<button className="primary-btn" disabled={busy}>{busy?<><LoaderCircle className="spin" size={16}/> 保存中</>:<>创建公司 <ArrowUpRight size={17}/></>}</button></form></div>;
}

function Dashboard({org,data,onNavigate,loading,onCreate}:{org:Organization;data:({processes?:number;controls?:number;findings?:number;open_issues?:number;closed_issues?:number;updated_at?:string;[key:string]:unknown})|null;onNavigate:(page:string)=>void;loading:boolean;onCreate:()=>void}) {
  const { locale } = useI18n();
  const stats: {id:string;label:string;value:unknown;sub:string;icon:typeof GitBranch;tone:string}[]=[{id:"processes",label:"业务流程",value:data?.processes,sub:"已纳入管理的流程",icon:GitBranch,tone:"blue"},{id:"controls",label:"控制库",value:data?.controls,sub:"设计并执行的控制",icon:ShieldCheck,tone:"mint"},{id:"findings",label:"检查发现",value:data?.findings,sub:"检查识别的问题",icon:FileCheck2,tone:"amber"},{id:"issues",label:"未关闭问题",value:data?.open_issues,sub:`${data?.closed_issues??0} 项已完成整改`,icon:AlertTriangle,tone:"rose"}];
  const total=Number(data?.open_issues||0)+Number(data?.closed_issues||0);const ratio=total?Math.round(Number(data?.closed_issues||0)*100/total):0;
  return <div className="dashboard-page"><section className="welcome-band"><div className="welcome-decoration dec-a"/><div className="welcome-decoration dec-b"/><div className="welcome-copy"><div className="welcome-tag"><span className="welcome-tag-dot" aria-hidden="true"/> 内控管理 · <span className="welcome-industry" data-no-translate>{org.industry||"企业经营"}</span></div><h1>早上好，今天的内控工作也要有序推进。</h1><p><span className="welcome-org-name" data-no-translate>{org.name}</span> 的控制体系与风险整改情况，已经为你整理好了。</p><div className="welcome-meta"><span><i/> 数据实时聚合</span><span>公司代码 · <b data-no-translate>{org.code}</b></span></div></div><div className="welcome-illustration"><div className="illus-ring ring-one"/><div className="illus-ring ring-two"/><div className="illus-center"><ShieldCheck size={39}/></div><div className="illus-chip chip-top"><Check size={14}/> 持续改进</div><div className="illus-chip chip-bottom"><Activity size={14}/> 闭环推进中</div></div></section>
    <div className="section-heading dashboard-heading"><div><div className="section-kicker">OVERVIEW</div><h2>公司内控概览</h2><p>所有数字直接汇总自当前公司的业务记录。</p></div><button className="outline-btn" onClick={onCreate}><Plus size={16}/> 管理公司</button></div>
    <div className="stat-grid">{stats.map(item=>{const Icon=item.icon;return <button type="button" key={item.label} className="stat-card dashboard-click-card" aria-label={`${item.label}：${Number(item.value||0)}，打开对应内容`} onClick={()=>onNavigate(item.id)}><div className={`stat-icon ${item.tone}`}><Icon size={19}/></div><div className="stat-label">{item.label}</div><div className="stat-value">{loading?<span className="skeleton"/>:<CountUp value={Number(item.value||0)}/>}</div><div className="stat-foot"><span>{String(item.sub)}</span><span className="stat-arrow"><ArrowUpRight size={13}/></span></div></button>;})}</div>
    <div className="dashboard-lower"><section className="card quick-card"><div className="card-head"><div><div className="section-kicker">GET STARTED</div><h3>继续完善你的内控体系</h3></div><Sparkles size={19} className="sparkle"/></div><p>逐步补齐基础档案，为后续的控制检查和整改跟踪做好准备。</p><div className="quick-links">{[{label:"建立业务流程",id:"processes",icon:GitBranch},{label:"配置风险",id:"risks",icon:AlertTriangle},{label:"查看控制库",id:"controls",icon:ShieldCheck},{label:"创建内控检查",id:"inspections",icon:ClipboardCheck}].map(item=>{const Icon=item.icon;return <button key={item.id} onClick={()=>onNavigate(item.id)}><span className="quick-icon"><Icon size={17}/></span><span>{item.label}</span><ArrowUpRight size={15}/></button>;})}</div></section><button type="button" className="card close-card dashboard-click-card dashboard-close-card" aria-label={`整改进度：已关闭 ${Number(data?.closed_issues||0)} 项，共 ${total} 项；打开 Issue 整改列表`} onClick={()=>onNavigate("issues")}><div className="card-head"><div><div className="section-kicker">REMEDIATION</div><h3>问题整改进度</h3></div><div className="progress-chip"><BadgeCheck size={14}/> {ratio}%</div></div><p>按已关闭问题占全部问题的比例统计。</p><div className="progress-number">{Number(data?.closed_issues||0)}<span>{locale === "en-US" ? ` / ${total} items` : ` / ${total} 项`}</span></div><div className="progress-track"><div style={{width:`${ratio}%`}}/></div><div className="progress-bottom"><span>{locale === "en-US" ? `Closed ${data?.closed_issues||0} items` : `已关闭 ${data?.closed_issues||0} 项`}</span><span className="progress-link">查看问题 <ArrowUpRight size={14}/></span></div></button></div>
    <div className="dashboard-footer-row"><div><span className="tiny-live"/> 数据更新时间 · {data?.updated_at?new Date(String(data.updated_at)).toLocaleTimeString(locale,{hour:"2-digit",minute:"2-digit"}):"—"}</div><button onClick={()=>onNavigate("rcms")}><Network size={14}/> 查看风险控制矩阵</button></div>
  </div>;
}
function CountUp({value}:{value:number}) { return <>{value.toLocaleString("zh-CN")}</>; }

function OrganizationsPage({org,organizations,memberships,isSystemAdmin,onSelectOrg,onOpenMembers,canManage,onCreated}:{org:Organization;organizations:RecordRow[];memberships:Membership[];isSystemAdmin:boolean;onSelectOrg:(id:string)=>void;onOpenMembers:()=>void;canManage:boolean;onCreated:(msg:string)=>void|Promise<void>}) {
  const [show,setShow]=useState(false);const [name,setName]=useState("");const [code,setCode]=useState("");const [industry,setIndustry]=useState("");const [templates,setTemplates]=useState<IndustryTemplateOption[]>([]);const [templateId,setTemplateId]=useState("");const [busy,setBusy]=useState(false);const [changingId,setChangingId]=useState("");const [error,setError]=useState("");
  useEffect(()=>{if(show)loadIndustryTemplateOptions().then(setTemplates).catch(()=>setTemplates([]));},[show]);
  const create=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await api("/api/organizations",{method:"POST",body:JSON.stringify({name,code,industry,template_id:templateId||null})});setShow(false);setName("");setCode("");setIndustry("");setTemplateId("");await onCreated(templateId?"公司及行业样例已建立":"公司已建立");}catch(err){setError(err instanceof Error?err.message:"创建失败");}finally{setBusy(false);}};
  const changeStatus=async(item:RecordRow)=>{
    const active=item.is_active!==false;
    const label=String(item.name||"该公司");
    if(active&&!window.confirm(`确定删除公司“${label}”吗？公司将被停用，所有成员会暂时失去访问权限；业务记录与文件会保留，之后可恢复。`))return;
    setChangingId(item.id);setError("");
    try{await api(`/api/organizations/${item.id}${active?"":"/restore"}`,{method:active?"DELETE":"POST"});await onCreated(active?`公司“${label}”已停用，数据仍保留`:`公司“${label}”已恢复`);}
    catch(err){setError(err instanceof Error?err.message:active?"删除公司失败":"恢复公司失败");}
    finally{setChangingId("");}
  };
  const mayManage=(item:RecordRow)=>isSystemAdmin||memberships.some(member=>member.organization.id===item.id&&member.role==="manager");
  return <div className="module-page"><ModuleHeader eyebrow="ORGANIZATION" title="公司与成员" subtitle="创建公司、切换工作空间，或停用并恢复公司。" action={canManage?<button className="primary-btn compact" onClick={()=>setShow(true)}><Plus size={16}/> 新建公司</button>:undefined}/><div className="org-card-grid">{organizations.map(item=>{const active=item.is_active!==false;const canOperate=mayManage(item);return <article className={`org-card ${item.id===org.id&&active?"selected":""} ${!active?"archived":""}`} key={item.id}><div className="org-card-top"><div className="org-card-icon"><Building2 size={20}/></div><span className={active?"selected-tag":"org-inactive-tag"}>{active?(item.id===org.id?"当前公司":"启用中"):"已停用"}</span></div><h3 data-no-translate>{String(item.name)}</h3><p data-no-translate>{String(item.industry||"未设置行业")}</p><div className="org-card-code">公司代码 <b data-no-translate>{String(item.code)}</b></div>{!active&&<p className="org-archive-note">公司资料和审计记录已保留，恢复后成员可继续访问。</p>}<div className="org-card-actions">{active?<><button className="text-btn" onClick={()=>{onSelectOrg(item.id);onOpenMembers();}}>查看成员 <Users size={14}/></button>{canOperate&&<button className="danger-text-btn" disabled={changingId===item.id} onClick={()=>changeStatus(item)}>删除公司 <Trash2 size={13}/></button>}</>:canOperate?<button className="text-btn" disabled={changingId===item.id} onClick={()=>changeStatus(item)}><RotateCcw size={14}/> 恢复公司</button>:<span className="member-self-label">仅公司经理可恢复</span>}{active&&item.id!==org.id&&<button className="text-btn" onClick={()=>onSelectOrg(item.id)}>切换公司 <ArrowUpRight size={14}/></button>}</div></article>;})}{organizations.length===0&&<div className="card org-empty">暂无公司。公司经理可以新建公司。</div>}</div>{error&&<div className="form-error org-error">{error}</div>}{show&&<Modal title="新建公司" subtitle="你将自动成为新公司的公司经理。" onClose={()=>setShow(false)}><form onSubmit={create}><label className="field-label">公司名称<input value={name} onChange={e=>setName(e.target.value)} required/></label><label className="field-label">公司编号<input value={code} onChange={e=>setCode(e.target.value.toUpperCase())} required/></label><label className="field-label">行业参考样例 <TemplateSelect templates={templates} value={templateId} onChange={id=>{setTemplateId(id);const selected=templates.find(item=>item.id===id);if(selected)setIndustry(selected.industry);}}/></label><label className="field-label">行业名称<input value={industry} onChange={e=>setIndustry(e.target.value)}/></label>{error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button className="outline-btn" type="button" onClick={()=>setShow(false)}>取消</button><button className="primary-btn" disabled={busy}>创建公司 <ArrowUpRight size={16}/></button></div></form></Modal>}</div>;
}

function MembersPage({org,members,currentUserId,canManage,onCreated}:{org:Organization;members:RecordRow[];currentUserId:string;canManage:boolean;onCreated:(msg:string)=>void}) {
  const [show,setShow]=useState(false);
  const [resetMember,setResetMember]=useState<Record<string,unknown>|null>(null);
  const [busy,setBusy]=useState(false);
  const [removingId,setRemovingId]=useState("");
  const [changingRole,setChangingRole]=useState("");
  const [error,setError]=useState("");
  const [resetPassword,setResetPassword]=useState("");
  const [form,setForm]=useState({email:"",full_name:"",password:"",role:"viewer"});
  const closeMemberForm=()=>{setShow(false);setForm({email:"",full_name:"",password:"",role:"viewer"});setError("");};
  const closeReset=()=>{setResetMember(null);setResetPassword("");setError("");};
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");try{await api("/api/organizations/"+org.id+"/members",{method:"POST",body:JSON.stringify(form)});setShow(false);setForm({email:"",full_name:"",password:"",role:"viewer"});onCreated("成员已添加");}catch(err){setError(err instanceof Error?err.message:"添加失败");}finally{setBusy(false);}};
  const removeMember=async(row:RecordRow)=>{const person=row.user as Record<string,unknown>|undefined;const userId=String(person?.id||"");const name=String(person?.full_name||person?.email||"该成员");if(!userId||!window.confirm("确定将“"+name+"”移出"+org.name+"吗？这会立即撤销其公司访问权限，历史业务记录和个人登录账号会保留。"))return;setRemovingId(userId);setError("");try{await api("/api/organizations/"+org.id+"/members/"+userId,{method:"DELETE"});onCreated("已将"+name+"移出公司");}catch(err){setError(err instanceof Error?err.message:"移除成员失败");}finally{setRemovingId("");}};
  const changeRole=async(memberId:string,role:string)=>{setChangingRole(memberId);setError("");try{await api("/api/organizations/"+org.id+"/members/"+memberId+"/role",{method:"PATCH",body:JSON.stringify({role})});onCreated("成员角色已更新");}catch(err){setError(err instanceof Error?err.message:"角色更新失败");}finally{setChangingRole("");}};
  const submitReset=async(e:FormEvent)=>{e.preventDefault();if(!resetMember)return;const person=resetMember.user as Record<string,unknown>|undefined;const userId=String(person?.id||"");setBusy(true);setError("");try{await api("/api/organizations/"+org.id+"/members/"+userId+"/reset-password",{method:"POST",body:JSON.stringify({password:resetPassword})});setResetMember(null);setResetPassword("");onCreated("成员密码已重置，其现有登录会话已失效");}catch(err){setError(err instanceof Error?err.message:"密码重置失败");}finally{setBusy(false);}};
  return <div className="module-page">
    <ModuleHeader eyebrow="TEAM ACCESS" title="公司成员" subtitle={org.name+" · 管理成员账号及其可执行的工作。"} action={canManage?<button className="primary-btn compact" onClick={()=>setShow(true)}><Plus size={16}/> 添加成员</button>:undefined}/>
    <div className="card table-card"><div className="table-headline"><div><h3>成员与权限</h3><p>{members.length} 位成员</p></div></div><div className="data-table-wrap"><table>
      <thead><tr><th>成员</th><th>工作邮箱</th><th>公司角色</th><th>加入时间</th>{canManage&&<th>操作</th>}</tr></thead>
      <tbody>{members.map(row=>{const person=row.user as Record<string,unknown>|undefined;const memberId=String(person?.id||"");const isSelf=memberId===currentUserId;return <tr key={row.id}>
        <td><span className="person-cell"><span className="avatar small">{String(person?.full_name||"员").slice(0,1)}</span><b data-no-translate>{String(person?.full_name||"—")}</b></span></td>
        <td data-no-translate>{String(person?.email||"—")}</td>
        <td>{canManage?<select aria-label="成员角色" value={String(row.role)} disabled={changingRole===memberId} onChange={e=>changeRole(memberId,e.target.value)}>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select>:<span className="role-pill">{roleLabels[String(row.role)]||String(row.role)}</span>}</td>
        <td>{dateShort(row.created_at)}</td>
        {canManage&&<td className="row-actions">{isSelf?<span className="member-self-label">当前账号</span>:<><button className="text-btn" disabled={!!changingRole} onClick={()=>{setResetMember(row);setError("");}}>重置密码</button><button className="danger-icon-btn" aria-label={"移出成员 "+String(person?.full_name||person?.email||"")} title="移出公司" disabled={removingId===memberId} onClick={()=>removeMember(row)}><Trash2 size={14}/>{removingId===memberId&&<span>处理中</span>}</button></>}</td>}
      </tr>;})}{members.length===0&&<EmptyRow text="还没有公司成员。添加成员后即可分配流程和整改任务。" cols={canManage?5:4}/>}</tbody>
    </table></div></div>
    {error&&<div className="form-error member-error">{error}</div>}
    {show&&<Modal title="添加公司成员" subtitle="为成员创建本地登录账号并设置公司角色。" onClose={closeMemberForm}><form onSubmit={submit}>
      <label className="field-label">姓名<input value={form.full_name} onChange={e=>setForm({...form,full_name:e.target.value})} required/></label>
      <label className="field-label">邮箱<input type="email" value={form.email} onChange={e=>setForm({...form,email:e.target.value})} required/></label>
      <label className="field-label">初始密码<input type="password" minLength={12} value={form.password} onChange={e=>setForm({...form,password:e.target.value})} required/><span className="field-hint">至少 12 位，成员首次登录后联系管理员修改。</span></label>
      <label className="field-label">公司角色<select value={form.role} onChange={e=>setForm({...form,role:e.target.value})}>{Object.entries(roleLabels).map(([key,label])=><option key={key} value={key}>{label}</option>)}</select></label>
      {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button className="outline-btn" type="button" onClick={closeMemberForm}>取消</button><button className="primary-btn" disabled={busy}>创建成员 <ArrowUpRight size={16}/></button></div>
    </form></Modal>}
    {resetMember&&<Modal title="重置成员密码" subtitle={"为 "+String((resetMember.user as Record<string,unknown>|undefined)?.full_name||"成员")+" 设置新的本地登录密码。旧会话会立即失效。"} onClose={closeReset}><form onSubmit={submitReset}>
      <label className="field-label">新密码<input type="password" minLength={12} maxLength={128} autoComplete="new-password" value={resetPassword} onChange={e=>setResetPassword(e.target.value)} required/><span className="field-hint">至少 12 位，最多 128 位。</span></label>
      {error&&<div className="form-error">{error}</div>}<div className="modal-actions"><button className="outline-btn" type="button" onClick={closeReset}>取消</button><button className="primary-btn" disabled={busy||resetPassword.length<12}>重置密码 <Check size={16}/></button></div>
    </form></Modal>}
  </div>;
}
function ResourcePage({definition,org,rows,loading,readonly,canManage,search,setSearch,showModal,setShowModal,onCreated,onError,onOpenIssue,onOpenInspection,onOpenLegacyPage,integrityTarget}:{definition:ResourceDef;org:Organization;rows:RecordRow[];loading:boolean;readonly:boolean;canManage:boolean;search:string;setSearch:(v:string)=>void;showModal:boolean;setShowModal:(v:boolean)=>void;onCreated:(msg:string)=>void;onError:(msg:string)=>void;onOpenIssue:(issueId:string)=>void;onOpenInspection:(inspectionId:string)=>void;onOpenLegacyPage:(page:string)=>void;integrityTarget:IntegrityTarget|null}) {
  const Icon=definition.icon;
  const wantsEvidence=definition.key==="rcms";
  const isProcess=definition.key==="processes";
  const isInspection=definition.key==="inspections";
  const isControlDesign=definition.key==="control-objectives"||definition.key==="controls";
  const [configurationProcessId,setConfigurationProcessId]=useState<string|null>(null);
  const [editRow,setEditRow]=useState<RecordRow|null>(null);
  const [relatedRows,setRelatedRows]=useState<RecordRow[]>([]);
  const [processFilter,setProcessFilter]=useState<"all"|"unconfigured"|"draft"|"changed"|"published">("all");
  const [inspectionFilter,setInspectionFilter]=useState<"all"|"planned"|"in_progress"|"completed"|"attention">("all");
  const sources=useMemo(()=>{const values=definition.fields.map(field=>field.source).filter(Boolean) as string[];if(definition.key==="controls")values.push("risks","rcms","issues","findings","inspection-tests");if(definition.key==="inspections")values.push("inspection-tests","findings");return Array.from(new Set(values));},[definition]);
  useEffect(()=>{let active=true;Promise.all(sources.map(async source=>{
    if(source==="members"){
      const people=await api(`/api/organizations/${org.id}/members`);
      return (people as RecordRow[]).map(row=>{const person=row.user as Record<string,unknown>|undefined;return {id:String(person?.id||""),name:String(person?.full_name||"成员"),code:String(person?.email||""),is_member:true};});
    }
    return await api(queryWithOrg(source,org.id)) as RecordRow[];
  })).then(groups=>{if(active)setRelatedRows(groups.flat());}).catch(err=>{if(active)onError(err instanceof Error?err.message:"读取关联数据失败");});return()=>{active=false;};},[org.id,sources,onError]);
  useEffect(()=>{
    if(!integrityTarget||loading)return;
    if(definition.key==="processes"&&integrityTarget.processId){setConfigurationProcessId(integrityTarget.processId);return;}
    if(definition.key==="controls"&&integrityTarget.recordId){
      const record=rows.find(row=>row.id===integrityTarget.recordId);
      if(record&&canManage)setEditRow(record);
    }
  },[canManage,definition.key,integrityTarget?.id,integrityTarget?.processId,integrityTarget?.recordId,loading,rows]);
  const actionCol=canManage||isProcess||isInspection?1:0;
  const processFilterCards:[typeof processFilter,string,string][]=[["all","全部流程","纳入管理的业务流程"],["unconfigured","未配置","尚未开始配置"],["draft","配置草稿","尚未发布"],["changed","修改待发布","发布后有新修改"],["published","已发布","当前配置已发布"]];
  const processFilterCounts:Record<typeof processFilter,number>={
    all:rows.length,
    unconfigured:rows.filter(row=>String(row.configuration_status||"unconfigured")==="unconfigured").length,
    draft:rows.filter(row=>String(row.configuration_status)==="draft").length,
    changed:rows.filter(row=>String(row.configuration_status)==="changed").length,
    published:rows.filter(row=>String(row.configuration_status)==="published").length,
  };
  const inspectionTests=relatedRows.filter(item=>item.inspection_id!==undefined&&item.result!==undefined);
  const inspectionFindings=relatedRows.filter(item=>item.inspection_test_id!==undefined&&item.title!==undefined);
  const testsByInspection=new Map<string,RecordRow[]>();
  inspectionTests.forEach(test=>{const inspectionId=String(test.inspection_id||"");if(!testsByInspection.has(inspectionId))testsByInspection.set(inspectionId,[]);testsByInspection.get(inspectionId)?.push(test);});
  const findingsByInspection=new Map<string,RecordRow[]>();
  inspectionFindings.forEach(finding=>{const test=inspectionTests.find(item=>item.id===finding.inspection_test_id);const inspectionId=String(test?.inspection_id||"");if(!inspectionId)return;if(!findingsByInspection.has(inspectionId))findingsByInspection.set(inspectionId,[]);findingsByInspection.get(inspectionId)?.push(finding);});
  const inspectionTestsFor=(inspectionId:string)=>testsByInspection.get(inspectionId)||[];
  const inspectionHasAttention=(row:RecordRow)=>inspectionTestsFor(row.id).some(test=>["fail","needs_improvement"].includes(String(test.result)))||(findingsByInspection.get(row.id)?.length||0)>0;
  const inspectionProgress=(row:RecordRow)=>{const tests=inspectionTestsFor(row.id);const done=tests.filter(test=>Boolean(test.result)&&test.result!=="not_tested").length;return {done,total:tests.length,percent:tests.length?Math.round(done/tests.length*100):0};};
  const inspectionFilterCounts:Record<typeof inspectionFilter,number>={all:rows.length,planned:rows.filter(row=>row.status==="planned").length,in_progress:rows.filter(row=>row.status==="in_progress").length,completed:rows.filter(row=>row.status==="completed").length,attention:rows.filter(inspectionHasAttention).length};
  const visibleRows=isProcess&&processFilter!=="all"?rows.filter(row=>String(row.configuration_status||"unconfigured")===processFilter):isInspection&&inspectionFilter!=="all"?rows.filter(row=>inspectionFilter==="attention"?inspectionHasAttention(row):row.status===inspectionFilter):rows;
  const matchingInspectionIds=new Set(rows.map(row=>row.id));
  const matchingTests=inspectionTests.filter(test=>matchingInspectionIds.has(String(test.inspection_id||"")));
  const resultCounts={pass:matchingTests.filter(test=>test.result==="pass").length,fail:matchingTests.filter(test=>test.result==="fail").length,needs_improvement:matchingTests.filter(test=>test.result==="needs_improvement").length,not_tested:matchingTests.filter(test=>!test.result||test.result==="not_tested").length,not_applicable:matchingTests.filter(test=>test.result==="not_applicable").length};
  const resultSeries:[keyof typeof resultCounts,string,string][]=[["pass","通过","pass"],["fail","未通过","fail"],["needs_improvement","需改进","improvement"],["not_tested","未测试","untested"],["not_applicable","不适用","na"]];
  const recordedTestCount=resultCounts.pass+resultCounts.fail+resultCounts.needs_improvement+resultCounts.not_applicable;
  const inspectionFilterCards:[typeof inspectionFilter,string,string,string][]=[["all","检查计划","全部检查任务","blue"],["in_progress","执行中","正在开展测试","mint"],["planned","待执行","等待启动","amber"],["completed","已完成","已完成检查","slate"],["attention","需关注","存在未通过或需改进项","rose"]];
  const inspectionProcessById=new Map(relatedRows.filter(item=>item.department_id!==undefined&&item.code!==undefined).map(item=>[item.id,item]));
  const inspectionPeopleById=new Map(relatedRows.filter(item=>item.is_member===true).map(item=>[item.id,item]));
  const recentInspections=[...rows].sort((a,b)=>String(b.created_at||"").localeCompare(String(a.created_at||""))).slice(0,4);
  const createRiskPlan=async(riskId:string,payload:Record<string,unknown>)=>{const result=await api(`/api/risks/${riskId}/remediation?organization_id=${org.id}`,{method:"POST",body:JSON.stringify(payload)}) as {issue?:RecordRow};const issueId=String(result.issue?.id||"");if(!issueId)throw new Error("整改计划已保存，但未返回整改事项编号");onCreated("整改计划已创建，并进入整改闭环");return issueId;};
  const inspectionDashboard=isInspection&&<>
    <section className="inspection-dashboard-overview card" aria-label="内控检查仪表盘">
      <div className="inspection-dashboard-heading"><div><span className="section-kicker">INSPECTION OVERVIEW</span><h2>检查执行总览</h2><p>从检查计划、测试结论到待跟进事项，查看当前公司的执行情况。</p></div><span className="inspection-dashboard-live"><i/>{loading?<LoaderCircle className="spin" size={13}/>:`${rows.length} 项检查`}</span></div>
      <div className="inspection-dashboard-metrics">{inspectionFilterCards.map(([key,label,description,tone])=><button type="button" key={key} className={`inspection-metric-card ${tone} ${inspectionFilter===key?"active":""}`} aria-pressed={inspectionFilter===key} aria-label={`${label}：${inspectionFilterCounts[key]}项；筛选检查任务`} onClick={()=>setInspectionFilter(key)}><span>{label}</span><b>{loading?<span className="skeleton"/>:inspectionFilterCounts[key]}</b><small>{description}</small></button>)}</div>
    </section>
    <div className="inspection-dashboard-lower">
      <section className="card inspection-results-card"><div className="inspection-panel-heading"><div><span className="section-kicker">TEST RESULTS</span><h3>检查执行结果</h3></div><span>{matchingTests.length} 项执行项</span></div><p className="inspection-panel-caption">按当前搜索范围内的检查任务汇总检查项结论。</p><div className="inspection-result-bars">{resultSeries.map(([key,label,tone])=>{const value=resultCounts[key];const percent=matchingTests.length?Math.round(value/matchingTests.length*100):0;return <div className="inspection-result-row" key={key}><div><span className={`inspection-result-dot ${tone}`}/><span>{label}</span><b>{value}</b></div><div className="inspection-result-track"><i className={tone} style={{width:`${percent}%`}}/></div></div>;})}</div><div className="inspection-result-foot"><span><BadgeCheck size={14}/>已记录结论 {recordedTestCount} / {matchingTests.length} 项</span><button type="button" onClick={()=>onOpenLegacyPage("inspection-tests")}>查看执行项 <ArrowUpRight size={13}/></button></div></section>
      <section className="card inspection-recent-card"><div className="inspection-panel-heading"><div><span className="section-kicker">RECENT INSPECTIONS</span><h3>检查任务</h3></div><button type="button" className="text-btn" onClick={()=>setInspectionFilter("all")}>全部 <ArrowUpRight size={13}/></button></div><p className="inspection-panel-caption">打开任务查看检查概览、执行记录、证据和发现。</p>{recentInspections.length?<div className="inspection-task-list">{recentInspections.map(row=>{const progress=inspectionProgress(row);const process=inspectionProcessById.get(String(row.process_id||""));const lead=inspectionPeopleById.get(String(row.lead_user_id||""));return <button type="button" className="inspection-task-item" key={row.id} onClick={()=>onOpenInspection(row.id)}><span className={`inspection-task-icon ${String(row.status||"")}`}><ClipboardCheck size={16}/></span><span className="inspection-task-main"><b>{String(row.name||row.code||"未命名检查")}</b><small>{String(process?.name||"未关联流程")} · {String(lead?.name||"未指定负责人")}</small><span className="inspection-task-progress"><i><em style={{width:`${progress.percent}%`}}/></i><small>{progress.done}/{progress.total} 项已记录</small></span></span><span className="inspection-task-state"><span className={`state-pill ${String(row.status||"")}`}>{inspectionStatusLabels[String(row.status||"")]||"未设置"}</span><ArrowUpRight size={14}/></span></button>;})}</div>:<div className="inspection-task-empty"><ClipboardCheck size={20}/><b>还没有检查计划</b><span>新建检查后，执行进度会显示在这里。</span></div>}</section>
    </div>
  </>;
  const body=isControlDesign
    ? <ControlDesignView definition={definition} rows={rows} relatedRows={relatedRows} loading={loading} canManage={canManage} readonly={readonly} search={search} setSearch={setSearch} onEdit={setEditRow} onOpenIssue={onOpenIssue} onCreateRiskPlan={createRiskPlan}/>
    : <div className="card table-card"><div className="table-headline"><div className="table-title-icon"><Icon size={18}/></div><div><h3>{definition.title}清单</h3><p>{isProcess?`当前筛选显示 ${visibleRows.length} 条流程，搜索或仪表盘筛选会同步更新。`:isInspection?`当前显示 ${visibleRows.length} 项检查任务；仪表盘卡片可按状态和关注项筛选。`:`当前公司共有 ${rows.length} 条记录，变更实时保存到 PostgreSQL。`}</p></div><div className="table-controls"><label className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索记录"/></label><span className="rows-count">{visibleRows.length} 条</span></div></div><div className="data-table-wrap"><table><thead><tr>{definition.columns.map(([key,label])=><th key={key}>{label}</th>)}{isInspection&&<th>执行进度</th>}{wantsEvidence&&<th>证据</th>}{(canManage||isProcess||isInspection)&&<th>操作</th>}</tr></thead><tbody>{loading?<tr><td colSpan={definition.columns.length+(isInspection?1:0)+(wantsEvidence?1:0)+actionCol} className="loading-cell"><LoaderCircle className="spin" size={19}/>读取公司数据…</td></tr>:visibleRows.map(row=><tr key={row.id}>{definition.columns.map(([key])=><td key={key}>{renderCell(row,key,relatedRows)}</td>)}{isInspection&&<td><div className="inspection-row-progress"><span>{inspectionProgress(row).percent}%</span><i><em style={{width:`${inspectionProgress(row).percent}%`}}/></i><small>{inspectionProgress(row).done}/{inspectionProgress(row).total} 项</small></div></td>}{wantsEvidence&&<td>{canManage?<EvidenceUpload org={org} parentId={row.id} parentType="rcm_id" onDone={onCreated}/> : "—"}</td>}{(canManage||isProcess||isInspection)&&<td className="row-actions">{isInspection&&<button className="text-btn" aria-label={`查看检查详情 ${String(row.name||row.code||"")}`} onClick={()=>onOpenInspection(row.id)}><ClipboardCheck size={14}/>检查详情</button>}{isProcess&&<button className="text-btn process-configure-btn" aria-label={`${canManage?"查看详情":"查看"}流程 ${String(row.name||row.code||"")}`} onClick={()=>setConfigurationProcessId(row.id)}><GitBranch size={14}/>{canManage?"流程详情":"查看详情"}</button>}{canManage&&<button className="icon-btn" aria-label="编辑记录" title="编辑记录" onClick={()=>setEditRow(row)}><Pencil size={14}/></button>}{definition.key==="findings"&&<button className="text-btn convert-btn" disabled={row.status==="converted"} onClick={async()=>{try{await api(`/api/findings/${row.id}/issue?organization_id=${org.id}`,{method:"POST"});onCreated("检查发现已转为整改事项");}catch(err){onError(err instanceof Error?err.message:"转换失败");}}}>{row.status==="converted"?"已转整改":"转为整改"} <ArrowUpRight size={13}/></button>}</td>}</tr>)}{!loading&&!visibleRows.length&&<EmptyRow text={isProcess&&processFilter!=="all"?"当前仪表盘筛选下没有匹配的业务流程。":isInspection&&inspectionFilter!=="all"?"当前仪表盘筛选下没有匹配的检查任务。":"当前筛选下没有匹配记录。"} cols={definition.columns.length+(isInspection?1:0)+(wantsEvidence?1:0)+actionCol}/>}</tbody></table></div><div className="table-footnote"><span><i/> 仅显示你在 {org.name} 中有权限查看的记录</span><span>最近创建的记录排在前面</span></div></div>;
  return <div className="module-page"><ModuleHeader eyebrow="CONTROL ENVIRONMENT" title={definition.title} subtitle={definition.subtitle} action={!readonly?<button className="primary-btn compact" onClick={()=>setShowModal(true)}><Plus size={16}/> 新建{definition.singular}</button>:undefined}/>{isProcess&&<section className="process-dashboard card" aria-label="业务流程仪表盘"><div className="process-dashboard-heading"><div><div className="section-kicker">PROCESS OVERVIEW</div><h2>流程配置仪表盘</h2><p>点击数字，按配置状态筛选下方流程清单；统计会随搜索条件同步更新。</p></div><span>{loading?<LoaderCircle className="spin" size={16}/>:`${processFilterCounts.all} 条流程`}</span></div><div className="process-dashboard-grid">{processFilterCards.map(([key,label,description])=><button type="button" key={key} className={`process-dashboard-card ${processFilter===key?"active":""} process-dashboard-${key}`} aria-pressed={processFilter===key} aria-label={`${label}：${processFilterCounts[key]} 条；筛选业务流程`} onClick={()=>setProcessFilter(key)}><span className="process-dashboard-label">{label}</span><b>{loading?<span className="skeleton"/>:processFilterCounts[key]}</b><small>{description}</small></button>)}</div></section>}{inspectionDashboard}{body}
    {configurationProcessId&&<ProcessConfiguration key={`${org.id}:${configurationProcessId}`} org={org} processId={configurationProcessId} canManage={canManage} onClose={()=>setConfigurationProcessId(null)} onChanged={onCreated} initialTab={integrityTarget?.processId===configurationProcessId?integrityTarget.tab:undefined} focusRiskId={integrityTarget?.processId===configurationProcessId?integrityTarget.focusRiskId:undefined} focusObjectiveId={integrityTarget?.processId===configurationProcessId?integrityTarget.focusObjectiveId:undefined}/>}
    {showModal&&<ResourceModal definition={definition} org={org} onClose={()=>setShowModal(false)} onCreated={onCreated} onError={onError}/>} {editRow&&<ResourceModal definition={definition} org={org} initial={editRow} onClose={()=>setEditRow(null)} onCreated={onCreated} onError={onError}/>}
  </div>;
}

function ControlDesignView({definition,rows,relatedRows,loading,canManage,readonly,search,setSearch,onEdit,onOpenIssue,onCreateRiskPlan}:{definition:ResourceDef;rows:RecordRow[];relatedRows:RecordRow[];loading:boolean;canManage:boolean;readonly:boolean;search:string;setSearch:(v:string)=>void;onEdit:(row:RecordRow)=>void;onOpenIssue:(issueId:string)=>void;onCreateRiskPlan:(riskId:string,payload:Record<string,unknown>)=>Promise<string>}) {
  const isObjective=definition.key==="control-objectives";
  const [riskFilter,setRiskFilter]=useState("all");
  const [selectedRiskId,setSelectedRiskId]=useState<string|null>(null);
  const [riskPlanFormOpen,setRiskPlanFormOpen]=useState(false);
  const [planOwner,setPlanOwner]=useState("");
  const [planControl,setPlanControl]=useState("");
  const [planRootCause,setPlanRootCause]=useState("");
  const [planAction,setPlanAction]=useState("");
  const [planDueDate,setPlanDueDate]=useState("");
  const [planSaving,setPlanSaving]=useState(false);
  const [planError,setPlanError]=useState("");
  useEffect(()=>{
    setRiskPlanFormOpen(false);
    setPlanOwner("");
    setPlanControl("");
    setPlanRootCause("");
    setPlanAction("");
    setPlanDueDate("");
    setPlanError("");
  },[selectedRiskId]);
  const relatedName=(id:unknown,fallback:string)=>String(relatedRows.find(item=>item.id===id)?.name||relatedRows.find(item=>item.id===id)?.title||fallback);
  const uniqueProcesses=new Set(rows.map(row=>String(row.process_id||"")).filter(Boolean)).size;
  const processes=relatedRows.filter(item=>item.department_id!==undefined&&item.code!==undefined);
  const risks=relatedRows.filter(item=>item.likelihood!==undefined&&item.impact!==undefined&&item.process_id!==undefined);
  const rcms=relatedRows.filter(item=>item.risk_id!==undefined&&item.control_id!==undefined&&item.process_id!==undefined);
  const issues=relatedRows.filter(item=>item.finding_id!==undefined&&item.status!==undefined);
  const findings=relatedRows.filter(item=>item.inspection_test_id!==undefined&&item.title!==undefined);
  const inspectionTests=relatedRows.filter(item=>item.rcm_id!==undefined&&item.procedure!==undefined);
  const members=relatedRows.filter(item=>item.is_member===true);
  const risksById=new Map(risks.map(item=>[item.id,item]));
  const controlsById=new Map(rows.map(item=>[item.id,item]));
  const rcmsById=new Map(rcms.map(item=>[item.id,item]));
  const findingsById=new Map(findings.map(item=>[item.id,item]));
  const testsById=new Map(inspectionTests.map(item=>[item.id,item]));
  const parseDate=(value:unknown)=>{if(!value)return null;const date=new Date(String(value).slice(0,10)+"T00:00:00");return Number.isNaN(date.valueOf())?null:date;};
  const timelineTasks=issues.flatMap(issue=>{
    const finding=findingsById.get(String(issue.finding_id||""));
    const inspectionTest=finding?testsById.get(String(finding.inspection_test_id||"")):undefined;
    const rcm=inspectionTest?rcmsById.get(String(inspectionTest.rcm_id||"")):undefined;
    const risk=issue.risk_id?risksById.get(String(issue.risk_id)):rcm?risksById.get(String(rcm.risk_id||"")):undefined;
    const control=issue.control_id?controlsById.get(String(issue.control_id)):rcm?controlsById.get(String(rcm.control_id||"")):undefined;
    if(!risk)return [];
    const title=String(finding?.title||issue.finding_title||issue.title||"整改事项");
    const remediation=issue.remediation&&typeof issue.remediation==="object"?issue.remediation as Record<string,unknown>:undefined;
    const start=parseDate(remediation?.created_at||issue.created_at);
    const due=parseDate(remediation?.due_date);
    return [{issue,finding,risk,control,remediation,start,due,title}];
  });
  const riskGroups=risks.map(risk=>{
    const relatedRcms=rcms.filter(item=>String(item.risk_id)===risk.id);
    const controls=Array.from(new Map(relatedRcms.map(item=>controlsById.get(String(item.control_id||""))).filter((item):item is RecordRow=>Boolean(item)).map(item=>[item.id,item])).values());
    const tasks=timelineTasks.filter(task=>task.risk.id===risk.id);
    const process=processes.find(item=>item.id===risk.process_id);
    return {risk,controls,tasks,processName:String(process?.name||"未关联流程"),score:Number(risk.likelihood||0)*Number(risk.impact||0)};
  });
  const filterCounts:Record<string,number>={
    all:riskGroups.length,
    uncontrolled:riskGroups.filter(group=>group.controls.length===0).length,
    no_issue:riskGroups.filter(group=>group.tasks.length===0).length,
    unresolved:riskGroups.filter(group=>group.tasks.length>0&&group.tasks.some(task=>String(task.issue.status||"")!=="closed")).length,
    closed:riskGroups.filter(group=>group.tasks.length>0&&group.tasks.every(task=>String(task.issue.status||"")==="closed")).length,
  };
  const filterOptions:[string,string,string][]=[["all","全部风险","风险总数"],["uncontrolled","无关联控制","缺少控制措施"],["no_issue","无整改事项","尚未转为 Issue"],["unresolved","未闭环","需要继续跟进"],["closed","已闭环","整改事项已关闭"]];
  const matchesRiskFilter=(group:typeof riskGroups[number])=>riskFilter==="all"||(riskFilter==="uncontrolled"&&group.controls.length===0)||(riskFilter==="no_issue"&&group.tasks.length===0)||(riskFilter==="unresolved"&&group.tasks.length>0&&group.tasks.some(task=>String(task.issue.status||"")!=="closed"))||(riskFilter==="closed"&&group.tasks.length>0&&group.tasks.every(task=>String(task.issue.status||"")==="closed"));
  const filteredRiskGroups=riskGroups.filter(group=>matchesRiskFilter(group)&&(!search.trim()||[group.risk.code,group.risk.name,group.processName,...group.controls.map(control=>control.code),...group.controls.map(control=>control.name),...group.tasks.map(task=>task.title)].some(value=>String(value||"").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()))))
    .sort((a,b)=>b.score-a.score||String(a.risk.name||"").localeCompare(String(b.risk.name||""),"zh-CN"));
  const unlinkedControls=rows.filter(control=>!rcms.some(item=>String(item.control_id)===control.id));
  const filteredUnlinkedControls=unlinkedControls.filter(control=>!search.trim()||[control.code,control.name,relatedName(control.process_id,"未关联流程")].some(value=>String(value||"").toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())));
  const selectedRiskGroup=riskGroups.find(group=>group.risk.id===selectedRiskId);
  const submitRiskPlan=async(event:FormEvent<HTMLFormElement>)=>{
    event.preventDefault();
    if(!selectedRiskGroup||!planOwner)return;
    setPlanSaving(true);
    setPlanError("");
    try{
      const issueId=await onCreateRiskPlan(String(selectedRiskGroup.risk.id),{
        owner_user_id:planOwner,
        ...(planControl?{control_id:planControl}:{}),
        root_cause:planRootCause.trim(),
        action_plan:planAction.trim(),
        due_date:planDueDate,
      });
      onOpenIssue(issueId);
    }catch(error){
      setPlanError(error instanceof Error?error.message:"整改计划创建失败");
    }finally{
      setPlanSaving(false);
    }
  };
  const visibleTasks=filteredRiskGroups.flatMap(group=>group.tasks.filter(task=>task.start&&task.due));
  const timelineStart=visibleTasks.length?Math.min(...visibleTasks.map(task=>task.start!.valueOf())):0;
  const timelineEnd=visibleTasks.length?Math.max(...visibleTasks.map(task=>task.due!.valueOf())):0;
  const timelineSpan=Math.max(86400000,timelineEnd-timelineStart);
  const dateLabel=(value:number)=>new Date(value).toLocaleDateString("zh-CN",{month:"2-digit",day:"2-digit"});
  const timelineTicks=[0,1/3,2/3,1].map(position=>({position,label:visibleTasks.length?dateLabel(timelineStart+timelineSpan*position):""}));
  return <>
    {isObjective?<section className="control-summary-grid">
      <div className="control-summary-card"><span className="control-summary-label">控制目标总数</span><b>{rows.length}</b><small>当前公司已维护记录</small></div>
      <div className="control-summary-card"><span className="control-summary-label">覆盖业务流程</span><b>{uniqueProcesses}</b><small>已建立流程关联</small></div>
      <div className="control-summary-card"><span className="control-summary-label">待完善说明</span><b>{rows.filter(row=>!String(row.description||"").trim()).length}</b><small>建议补充目标边界</small></div>
      <div className="control-summary-card accent"><span className="control-summary-label">维护提示</span><b>目标先行</b><small>一个目标可对应多项控制</small></div>
    </section>:<div className="control-risk-dashboard" aria-label="风险整改筛选仪表盘">{filterOptions.map(([key,label,detail])=><button type="button" key={key} className={`risk-summary-card ${key==="uncontrolled"?"summary-uncontrolled":key==="unresolved"?"summary-high":key==="closed"?"summary-low":""} ${riskFilter===key?"active":""}`} aria-pressed={riskFilter===key} aria-label={`筛选${label}，${filterCounts[key]}项`} onClick={()=>setRiskFilter(key)}><b>{filterCounts[key]}</b><span>{label}</span><small>{detail}</small></button>)}<span className="control-risk-dashboard-hint">点击圆盘筛选下方风险</span><span className="control-risk-dashboard-state">整改状态来自 Issue</span></div>}
    <section className="card control-design-panel">
      <div className="control-design-toolbar"><div><div className="section-kicker">{isObjective?"CONTROL OBJECTIVES":"RISK REMEDIATION TIMELINE"}</div><h3>{isObjective?"控制目标清单":"按风险查看控制整改进度"}</h3><p>{isObjective?"目标在对应业务流程中维护，并由控制措施引用。":"每行对应一项风险；点击风险行查看整改详情和填写入口。"}</p></div><div className="control-design-tools"><label className="search-box"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder={isObjective?"搜索目标或流程":"搜索风险、流程、控制或整改事项"}/></label><span className="rows-count">{isObjective?`${rows.length} 条目标`:`${filteredRiskGroups.length} 项风险`}</span></div></div>
      {loading?<div className="control-design-loading"><LoaderCircle className="spin" size={19}/>读取公司数据…</div>:isObjective?rows.length===0?<div className="control-design-empty"><Shield size={24}/><b>还没有{definition.singular}记录</b><span>{readonly?"当前公司尚未配置记录。":"点击右上角新建，或先从业务流程开始建立控制体系。"}</span></div>:<div className="control-design-grid objective-grid">{rows.map((row,index)=><article className="control-design-card objective-card" key={row.id}><div className="control-card-top"><span className="control-index">{String(index+1).padStart(2,"0")}</span><code>{String(row.code||"—")}</code>{canManage&&<button className="icon-btn" aria-label={`编辑控制目标 ${String(row.name||"")}`} title="编辑控制目标" onClick={()=>onEdit(row)}><Pencil size={14}/></button>}</div><h4>{String(row.name||"未命名控制目标")}</h4><p className="control-card-description">{String(row.description||"尚未填写目标说明")}</p><div className="control-card-footer"><span><GitBranch size={13}/>{relatedName(row.process_id,"未关联流程")}</span><span className="control-card-link">目标</span></div></article>)}</div>:filteredRiskGroups.length===0&&filteredUnlinkedControls.length===0?<div className="control-design-empty"><Shield size={24}/><b>{search.trim()||riskFilter!=="all"?"当前筛选没有匹配的风险或控制措施":"还没有风险或控制措施"}</b><span>{search.trim()||riskFilter!=="all"?"调整圆盘筛选或搜索条件。":readonly?"当前公司尚未配置记录。":"先在风险库建立风险，再关联对应控制措施。"}</span></div>:<div className="control-gantt-wrap">
        {visibleTasks.length>0&&<div className="control-gantt-axis"><div className="control-gantt-axis-label">风险 / 控制措施</div><div className="control-gantt-axis-track">{timelineTicks.map(tick=><span key={tick.position} style={{left:`${tick.position*100}%`}}>{tick.label}</span>)}</div><div className="control-gantt-axis-summary">整改进度</div></div>}
        {filteredRiskGroups.map(group=>{
          const plannedTasks=group.tasks.filter(task=>task.start&&task.due);
          const unscheduledTasks=group.tasks.filter(task=>!task.start||!task.due);
          const laneCount=Math.max(1,plannedTasks.length);
          const riskLevel=group.score>16?"重大":group.score>9?"高":group.score>4?"中":"低";
          return <article className="control-gantt-row" key={group.risk.id} role="button" tabIndex={0} aria-label={`查看风险整改详情：${String(group.risk.name||"")}`} onClick={()=>setSelectedRiskId(group.risk.id)} onKeyDown={event=>{if(event.target===event.currentTarget&&(event.key==="Enter"||event.key===" ")){event.preventDefault();setSelectedRiskId(group.risk.id);}}}>
            <div className="control-gantt-risk"><div className="control-gantt-risk-title"><span className={`control-gantt-level ${riskLevel}`}>{riskLevel}</span><b>{String(group.risk.name||"未命名风险")}</b></div><code>{String(group.risk.code||"—")}</code><span><GitBranch size={12}/>{group.processName}</span><small>{group.controls.length} 项控制 · {group.tasks.length} 项整改事项</small></div>
            <div className="control-gantt-main"><div className="control-gantt-lane" style={{minHeight:`${Math.max(50,laneCount*27)}px`}}>{plannedTasks.length?plannedTasks.map((task,index)=>{
              const start=task.start!.valueOf(),due=task.due!.valueOf();
              const left=Math.max(0,Math.min(96,(start-timelineStart)/timelineSpan*100));
              const width=Math.max(4,Math.min(100-left,(due-start)/timelineSpan*100));
              const status=String(task.issue.status||"open");
              const statusClass=status==="closed"?"done":["in_progress","in_review","verified","retested"].includes(status)?"active":"waiting";
              const title=`${task.control?.name?`${String(task.control.name)} · `:""}${task.title}`;
              return <div className={`control-gantt-task ${statusClass}`} key={task.issue.id} style={{left:`${left}%`,width:`${width}%`,top:`${10+index*27}px`}} title={`${title} · ${stateLabels[status]||status} · 到期 ${dateShort(task.remediation?.due_date)}`}><i/><span>{title}</span></div>;
            }):<div className="control-gantt-no-plan">{group.tasks.length?"整改事项尚未设置计划日期":"暂无整改计划"}</div>}</div>
              <div className="control-gantt-control-line">{group.controls.length?group.controls.map(control=><span className={control.is_active===false?"disabled":""} key={control.id} title={`${String(control.name||"未命名控制")} · ${relatedName(control.owner_user_id,"未指定责任人")} · ${stateLabels[String(control.frequency||"")]||"未设置频率"}`}><i/><button className="control-gantt-control-edit" type="button" disabled={!canManage} aria-label={`编辑控制措施 ${String(control.name||"")}`} onClick={event=>{event.stopPropagation();onEdit(control);}}>{String(control.name||"未命名控制")}</button><small>{relatedName(control.owner_user_id,"未指定责任人")} · {stateLabels[String(control.frequency||"")]||"未设置频率"}</small>{Boolean(control.is_key_control)&&<b className="control-gantt-key">关键</b>}</span>):<span className="missing-control"><i/>该风险尚未关联控制措施</span>}</div>
              {unscheduledTasks.length>0&&<div className="control-gantt-unscheduled">待排期 {unscheduledTasks.length} 项：{unscheduledTasks.map(task=>`${String(task.control?.name||"控制措施")}：${task.title}`).join("、")}</div>}
            </div>
            <div className="control-gantt-progress"><b>{group.tasks.length?`${group.tasks.filter(task=>String(task.issue.status||"")==="closed").length}/${group.tasks.length}`:"—"}</b><small>{group.tasks.length?"已闭环":"暂无整改事项"}</small>{group.tasks.length>0&&<span className="control-gantt-status">{group.tasks.every(task=>String(task.issue.status||"")==="closed")?"已完成":"跟进中"}</span>}</div>
          </article>;
        })}
        {filteredUnlinkedControls.length>0&&<div className="control-gantt-unlinked"><div><b>未关联风险</b><span>{filteredUnlinkedControls.length} 项控制措施尚未通过 RCM 映射到风险</span></div><div className="control-gantt-control-line">{filteredUnlinkedControls.map(control=><span key={control.id}><i/><button className="control-gantt-control-edit" type="button" disabled={!canManage} aria-label={`编辑控制措施 ${String(control.name||"")}`} onClick={()=>onEdit(control)}>{String(control.name||"未命名控制")}</button></span>)}</div></div>}
        <footer className="control-gantt-legend"><span><i className="planned"/>待分配</span><span><i className="running"/>整改中</span><span><i className="complete"/>已闭环</span><span><i className="unplanned"/>未排期</span><small>控制措施状态为启用配置；实际整改进度以 Issue 为准。</small></footer>
      </div>}
    </section>
    {selectedRiskGroup&&<div className="risk-drawer-backdrop" onMouseDown={()=>setSelectedRiskId(null)}><aside className="risk-drawer control-risk-detail" role="dialog" aria-modal="true" aria-label={`风险整改详情：${String(selectedRiskGroup.risk.name||"")}`} onMouseDown={event=>event.stopPropagation()}><button className="drawer-close" aria-label="关闭详情" onClick={()=>setSelectedRiskId(null)}><X size={16}/></button><div className="section-kicker">RISK REMEDIATION DETAIL</div><div className="control-risk-detail-heading"><span className={`control-gantt-level ${selectedRiskGroup.score>16?"重大":selectedRiskGroup.score>9?"高":selectedRiskGroup.score>4?"中":"低"}`}>{selectedRiskGroup.score>16?"重大":selectedRiskGroup.score>9?"高":selectedRiskGroup.score>4?"中":"低"}风险</span><h2>{String(selectedRiskGroup.risk.name||"未命名风险")}</h2></div><code className="control-risk-detail-code">{String(selectedRiskGroup.risk.code||"—")}</code><p className="drawer-description">{String(selectedRiskGroup.risk.description||"暂无风险描述")}</p><div className="drawer-rating"><div><span>所属流程</span><b>{selectedRiskGroup.processName}</b></div><div><span>风险状态</span><b>{stateLabels[String(selectedRiskGroup.risk.status||"")]||String(selectedRiskGroup.risk.status||"—")}</b></div></div>
      <section className="drawer-block"><h3>关联控制措施 · {selectedRiskGroup.controls.length} 项</h3>{selectedRiskGroup.controls.length?selectedRiskGroup.controls.map(control=><div className="control-detail-control" key={control.id}><div><b>{String(control.name||"未命名控制")}</b><small>{String(control.code||"—")} · {relatedName(control.owner_user_id,"未指定责任人")} · {stateLabels[String(control.frequency||"")]||"未设置频率"}{control.is_key_control?" · 关键控制":""}</small></div>{canManage&&<button className="icon-btn" aria-label={`编辑控制措施 ${String(control.name||"")}`} onClick={()=>onEdit(control)}><Pencil size={13}/></button>}</div>):<p>该风险尚未关联控制措施。</p>}</section>
      <section className="drawer-block"><h3>整改事项 · {selectedRiskGroup.tasks.length} 项</h3>{selectedRiskGroup.tasks.length?selectedRiskGroup.tasks.map(task=>{const status=String(task.issue.status||"open");const plan=task.remediation;return <div className="control-detail-issue" key={task.issue.id}><div className="control-detail-issue-head"><div><b>{task.title}</b><small>{String(task.control?.name||"关联控制")} · {String(task.issue.code||"")}</small></div><span className={`state-pill ${status}`}>{stateLabels[status]||status}</span></div>{plan?<><div className="control-detail-plan-meta">责任人：{relatedName(plan.owner_user_id,"未指定")} · 截止：{dateShort(plan.due_date)}</div><div className="control-detail-plan-text"><small>根因分析</small><p>{String(plan.root_cause||"—")}</p><small>整改措施</small><p>{String(plan.action_plan||"—")}</p></div></>:<p className="control-detail-no-plan">该整改事项尚未填写计划；打开整改事项后可填写责任人、根因、整改措施和完成日期。</p>}<button className="text-btn control-detail-issue-action" onClick={()=>onOpenIssue(String(task.issue.id))}>{status==="open"&&!plan?"填写整改计划":plan?"查看 / 更新整改计划":"查看整改记录"}<ArrowUpRight size={13}/></button></div>;}) : <div className="control-detail-empty"><b>当前风险还没有整改计划</b><p>直接在本详情中为该风险建立整改事项，填写后会进入整改闭环。</p></div>}
        {canManage&&<div className="control-risk-plan-entry">{riskPlanFormOpen?<form className="control-risk-plan-form" onSubmit={submitRiskPlan}><div className="control-risk-plan-form-heading"><div><b>新建风险整改计划</b><small>保存后生成关联该风险的整改事项和正式整改计划。</small></div><button type="button" className="icon-btn" aria-label="关闭整改计划表单" onClick={()=>setRiskPlanFormOpen(false)}><X size={14}/></button></div><label className="field-label">整改责任人<span className="required">*</span><select required value={planOwner} onChange={event=>setPlanOwner(event.target.value)}><option value="">请选择公司成员</option>{members.map(member=><option key={member.id} value={member.id}>{String(member.name||"成员")} · {String(member.code||"")}</option>)}</select></label><label className="field-label">关联控制措施<select value={planControl} onChange={event=>setPlanControl(event.target.value)}><option value="">暂不关联（可后续补充）</option>{selectedRiskGroup.controls.map(control=><option key={control.id} value={control.id}>{String(control.code||"")} · {String(control.name||"控制措施")}</option>)}</select></label><label className="field-label">根因分析<span className="required">*</span><textarea required minLength={3} rows={3} value={planRootCause} onChange={event=>setPlanRootCause(event.target.value)} placeholder="描述风险发生或控制失效的原因"/></label><label className="field-label">整改措施<span className="required">*</span><textarea required minLength={3} rows={3} value={planAction} onChange={event=>setPlanAction(event.target.value)} placeholder="填写具体整改动作和预期结果"/></label><label className="field-label">计划完成日期<span className="required">*</span><input required type="date" value={planDueDate} onChange={event=>setPlanDueDate(event.target.value)}/></label>{planError&&<div className="form-error"><AlertTriangle size={14}/>{planError}</div>}<div className="modal-actions"><button type="button" className="outline-btn" onClick={()=>setRiskPlanFormOpen(false)}>取消</button><button className="primary-btn" disabled={planSaving}>{planSaving?<><LoaderCircle className="spin" size={15}/> 保存中</>:<>创建整改计划 <ArrowUpRight size={15}/></>}</button></div></form>:<button type="button" className="primary-btn full-btn" onClick={()=>setRiskPlanFormOpen(true)}><Plus size={15}/>新建风险整改计划</button>}</div>}
      </section>
      <div className="control-detail-entry-hint">整改计划在这里填写；保存后可在整改闭环继续提交整改、复核和重测。</div></aside></div>}
  </>;
}

function renderCell(row:RecordRow,key:string,all:RecordRow[]) { const value=row[key];if(key==="configuration_status"){const status=String(value||"unconfigured");const labels:Record<string,string>={unconfigured:"待配置",draft:"草稿",published:"已发布",changed:"有未发布修改"};return <span className={`state-pill process-config-status ${status}`}>{labels[status]||status}{row.published_revision?` · V${String(row.published_revision)}`:""}</span>;}if(key==="configuration_step_count")return <span>{Number(value||0)}</span>;if(key==="status"||key==="severity"||key==="result"){const status=String(value||"");const statusLabel=key==="status"&&row.period_start!==undefined?(inspectionStatusLabels[status]||status):key==="status"&&row.inspection_test_id!==undefined?(findingStatusLabels[status]||status):(stateLabels[status]||status||"—");return <span className={`state-pill ${status}`}>{statusLabel}</span>;}if(key.endsWith("_id")){const related=all.find(item=>item.id===value);return <span className="linked-cell" data-no-translate>{String(related?.name||related?.title||related?.code||related?.assertion||(typeof value==="string"?value.slice(0,8):"—"))}</span>;}if(key==="assertion"||key==="sample_description"||key==="notes")return <span className="truncate-cell" data-no-translate>{String(value||"—")}</span>;return <span data-no-translate>{String(displayValue(key,value))}</span>; }

function resourceFormDefaults(definition:ResourceDef, initial?:RecordRow) {
  const defaults:Record<string,string>={control_type:"preventive",frequency:"monthly",execution_mode:"manual",is_key_control:"false",is_active:"true",likelihood:"3",impact:"3",status:definition.key==="inspections"?"planned":"active",result:"not_tested",severity:"medium"};
  return Object.fromEntries(definition.fields.map(field=>{
    const value=initial?.[field.key];
    if(value!==undefined&&value!==null)return [field.key,field.type==="date"?String(value).slice(0,10):String(value)];
    if(defaults[field.key]!==undefined)return [field.key,defaults[field.key]];
    if(field.options?.length)return [field.key,field.options[0][0]];
    return [field.key,""];
  }));
}

function ResourceModal({definition,org,initial,onClose,onCreated,onError}:{definition:ResourceDef;org:Organization;initial?:RecordRow;onClose:()=>void;onCreated:(msg:string)=>void;onError:(msg:string)=>void}) {
  const [form,setForm]=useState<Record<string,string>>(()=>resourceFormDefaults(definition,initial));const [busy,setBusy]=useState(false);const [options,setOptions]=useState<Record<string,RecordRow[]>>({});const [members,setMembers]=useState<(RecordRow & {name:string;code?:string})[]>([]);const [error,setError]=useState("");
  useEffect(()=>{let alive=true;const sources=Array.from(new Set(definition.fields.map(field=>field.source).filter(Boolean) as string[]));Promise.all(sources.map(async source=>{try{const data=source==="members"?await api(`/api/organizations/${org.id}/members`):await api(queryWithOrg(source,org.id));if(source==="members"){const mapped=(data as RecordRow[]).map(row=>({id:String((row.user as Record<string,unknown>)?.id),name:String((row.user as Record<string,unknown>)?.full_name),code:String((row.user as Record<string,unknown>)?.email)}));if(alive)setMembers(mapped);}else if(alive)setOptions(previous=>({...previous,[source]:data}));}catch(err){if(alive)setError(err instanceof Error?err.message:"加载选择项失败");}}));return()=>{alive=false;};},[definition,org.id]);
  const submit=async(e:FormEvent)=>{e.preventDefault();setBusy(true);setError("");const data:Record<string,unknown>={};for(const field of definition.fields){const val=form[field.key];if(val!==undefined&&val!=="")data[field.key]=field.type==="number"?Number(val):field.type==="checkbox"?val==="true":val;else if(initial&&!field.required)data[field.key]=null;}try{const path=queryWithOrg(definition.endpoint,org.id);if(initial){const status=data.status;delete data.status;if(Object.keys(data).length)await api(`/api/${definition.endpoint}/${initial.id}?organization_id=${org.id}`,{method:"PATCH",body:JSON.stringify(data)});if(status!==undefined&&status!==initial.status){const resource=definition.key==="risks"?"risks":"inspections";await api(`/api/${resource}/${initial.id}/status?organization_id=${org.id}`,{method:"PATCH",body:JSON.stringify({status})});}}else await api(path,{method:"POST",body:JSON.stringify(data)});onClose();onCreated(`${definition.singular}已保存`);}catch(err){setError(err instanceof Error?err.message:"保存失败");}finally{setBusy(false);}};
  return <Modal title={initial?`编辑${definition.singular}`:`新建${definition.singular}`} subtitle="填写业务信息，保存后会写入当前公司的 PostgreSQL 数据库。" onClose={onClose}><form onSubmit={submit} className="resource-form">{definition.fields.map(field=><label className={`field-label ${field.type==="checkbox"?"resource-checkbox-field":""}`} key={field.key}>{field.label}{field.required&&<span className="required">*</span>}{field.source?<select required={field.required} value={form[field.key]||""} onChange={e=>setForm({...form,[field.key]:e.target.value,...(definition.key==="controls"&&field.key==="process_id"?{objective_id:""}:{})})}><option value="">请选择…</option>{(field.source==="members"?members:(options[field.source]||[]).filter(item=>definition.key!=="controls"||field.source!=="control-objectives"||item.process_id===form.process_id)).map(item=><option value={item.id} key={item.id} data-no-translate>{String(item.name||item.title||item.code||item.assertion||String(item.id).slice(0,8))}</option>)}</select>:field.options?<select required={field.required} value={form[field.key]||field.options[0]?.[0]} onChange={e=>setForm({...form,[field.key]:e.target.value})}>{field.options.map(([value,label])=><option key={value} value={value}>{label}</option>)}</select>:field.type==="checkbox"?<span className="resource-checkbox-control"><input type="checkbox" checked={form[field.key]==="true"} onChange={e=>setForm({...form,[field.key]:String(e.target.checked)})}/><span>{form[field.key]==="true"?"是":"否"}</span></span>:field.type==="textarea"?<textarea required={field.required} rows={3} value={form[field.key]||""} onChange={e=>setForm({...form,[field.key]:e.target.value})} placeholder="填写相关说明"/>:<input type={field.type||"text"} min={field.type==="number"?1:undefined} max={field.type==="number"?5:undefined} required={field.required} value={form[field.key]??""} onChange={e=>setForm({...form,[field.key]:e.target.value})}/>}</label>)}{error&&<div className="form-error"><AlertTriangle size={15}/>{error}</div>}<div className="modal-actions"><button className="outline-btn" type="button" onClick={onClose}>取消</button><button className="primary-btn" disabled={busy}>{busy?<><LoaderCircle className="spin" size={16}/> 保存中</>:<>保存记录 <ArrowUpRight size={16}/></>}</button></div></form></Modal>;
}

function EvidencePage({org,canManage,rows,loading,onChanged}:{org:Organization;canManage:boolean;rows:RecordRow[];loading:boolean;onChanged:(msg:string)=>void}) {
  const [rcms,setRcms]=useState<RecordRow[]>([]);const [selected,setSelected]=useState("");const [error,setError]=useState("");const [selectedEvidence,setSelectedEvidence]=useState<RecordRow|null>(null);
  useEffect(()=>{api(queryWithOrg("rcms",org.id)).then(setRcms).catch(err=>setError(err.message));},[org.id]);
  const downloadEvidence=async(row:RecordRow)=>{try{const response=await fetch(`${API}/api/evidence/${row.id}/download?organization_id=${org.id}`,{credentials:"include"});if(!response.ok)throw new Error("下载失败");const blob=await response.blob();const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=String(row.file_name);a.click();URL.revokeObjectURL(url);}catch(err){setError(err instanceof Error?err.message:"下载失败");}};
  const openEvidence=(row:RecordRow)=>setSelectedEvidence(row);
  return <div className="module-page"><ModuleHeader eyebrow="EVIDENCE LIBRARY" title="证据库" subtitle="文件实际存储在本机 MinIO，数据库保留文件摘要与业务关联。"/><div className="card upload-library"><div className="upload-intro"><div className="card-icon mint"><Files size={21}/></div><div><h3>上传 RCM 证据</h3><p>选择控制映射并上传真实文件。单个文件最大 20 MB。</p></div></div>{canManage&&<div className="upload-controls"><select value={selected} onChange={e=>setSelected(e.target.value)}><option value="">选择关联 RCM…</option>{rcms.map(item=><option value={item.id} key={item.id} data-no-translate>{item.code||String(item.id).slice(0,8)} · {String(item.assertion||"风险控制映射")}</option>)}</select>{selected&&<EvidenceUpload org={org} parentId={selected} parentType="rcm_id" onDone={onChanged}/>}</div>}{error&&<div className="form-error">{error}</div>}</div><div className="card table-card"><div className="table-headline"><div className="table-title-icon"><Files size={18}/></div><div><h3>已上传证据</h3><p>点击行查看详情；悬停业务关联可见完整名称。下载会重新校验公司访问权限。</p></div><div className="table-controls"><span className="rows-count">{rows.length} 份</span></div></div><div className="data-table-wrap"><table className="evidence-table"><colgroup><col className="evidence-file-column"/><col className="evidence-type-column"/><col className="evidence-size-column"/><col className="evidence-hash-column"/><col className="evidence-relation-column"/><col className="evidence-date-column"/><col className="evidence-action-column"/></colgroup><thead><tr><th>文件名称</th><th>文件类型</th><th>文件大小</th><th>SHA-256</th><th>业务关联</th><th>上传日期</th><th/></tr></thead><tbody>{loading?<tr><td colSpan={7} className="loading-cell"><LoaderCircle className="spin" size={19}/>读取文件记录…</td></tr>:rows.map(row=><tr key={row.id} className="evidence-row" onClick={()=>openEvidence(row)}><td><button type="button" className="evidence-open-button" aria-label={`查看证据详情：${String(row.file_name||"未命名文件")}`} title="查看证据详情"><span className="file-cell"><span><Files size={16}/></span><span className="file-name" title={String(row.file_name)} data-no-translate>{String(row.file_name)}</span></span></button></td><td data-no-translate>{String(row.content_type)}</td><td>{(Number(row.size_bytes)/1024).toFixed(1)} KB</td><td><code>{String(row.sha256).slice(0,14)}…</code></td><td data-no-translate><span className="evidence-relation" title={String(row.related_label||"业务记录")}>{String(row.related_label||"业务记录")}</span></td><td>{dateShort(row.created_at)}</td><td><button type="button" className="icon-btn" title="下载" aria-label={`下载 ${String(row.file_name||"证据文件")}`} onClick={event=>{event.stopPropagation();void downloadEvidence(row);}}><ArrowDownToLine size={16}/></button></td></tr>)}{!loading&&!rows.length&&<EmptyRow text="尚无证据文件。上传到 RCM 或整改计划的文件会显示在这里。" cols={7}/>}</tbody></table></div></div>{selectedEvidence&&<EvidenceDetailDrawer row={selectedEvidence} onClose={()=>setSelectedEvidence(null)} onDownload={()=>void downloadEvidence(selectedEvidence)}/>}</div>;
}

function EvidenceDetailDrawer({row,onClose,onDownload}:{row:RecordRow;onClose:()=>void;onDownload:()=>void}) {
  const fileName=String(row.file_name||"未命名文件");const relation=String(row.related_label||"业务记录");const sha256=String(row.sha256||"—");
  return <div className="drawer-backdrop" onMouseDown={onClose} onKeyDown={event=>{if(event.key==="Escape")onClose();}}><aside className="issue-drawer evidence-detail-drawer" role="dialog" aria-modal="true" aria-label={`证据详细信息：${fileName}`} onMouseDown={event=>event.stopPropagation()}><div className="drawer-top"><div><div className="section-kicker">EVIDENCE DETAIL</div><span className="drawer-issue-code">证据详细信息</span></div><button type="button" className="icon-btn" aria-label="关闭详情" title="关闭详情" autoFocus onClick={onClose}><X size={17}/></button></div><div className="evidence-detail-heading"><span className="table-title-icon"><Files size={18}/></span><h2 data-no-translate>{fileName}</h2></div><p className="drawer-description">文件原件保存在 MinIO；本详情展示当前公司下的文件摘要和业务关联。</p><dl className="evidence-detail-list"><div><dt>业务关联</dt><dd data-no-translate>{relation}</dd></div><div><dt>文件类型</dt><dd data-no-translate>{String(row.content_type||"—")}</dd></div><div><dt>文件大小</dt><dd>{(Number(row.size_bytes||0)/1024).toFixed(1)} KB</dd></div><div><dt>上传日期</dt><dd>{dateShort(row.created_at)}</dd></div><div className="evidence-detail-hash"><dt>SHA-256</dt><dd><code>{sha256}</code></dd></div></dl><div className="modal-actions evidence-detail-actions"><button type="button" className="primary-btn" onClick={onDownload}><ArrowDownToLine size={15}/> 下载原文件</button></div></aside></div>;
}

function EvidenceUpload({org,parentId,parentType,onDone}:{org:Organization;parentId:string;parentType:"rcm_id"|"remediation_plan_id";onDone:(msg:string)=>void}) {
  const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  return <div className="evidence-upload"><label className="file-pick"><input type="file" disabled={busy} onChange={async e=>{const input=e.currentTarget;const file=input.files?.[0];if(!file)return;setBusy(true);setError("");const body=new FormData();body.set("file",file);try{await api(`/api/evidence?organization_id=${org.id}&${parentType}=${parentId}`,{method:"POST",body});input.value="";onDone("证据已上传至 MinIO 并保存 SHA-256");}catch(err){setError(err instanceof Error?err.message:"上传失败");}finally{setBusy(false);}}}/>{busy?<LoaderCircle className="spin" size={15}/>:<Plus size={15}/>}<span>{busy?"上传中…":"上传证据"}</span></label>{error&&<span className="inline-error" title={error}>{error}</span>}</div>;
}

function IssuesPage({org,rows,role,user,loading,search,setSearch,activeIssue,setActiveIssue,onChanged}:{org:Organization;rows:RecordRow[];role:string;user:User;loading:boolean;search:string;setSearch:(v:string)=>void;activeIssue:string|null;setActiveIssue:(id:string|null)=>void;onChanged:(msg:string)=>void}) {
  const groups=[{label:"待处理",states:["open","in_progress"]},{label:"等待复核",states:["in_review"]},{label:"待重测 / 关闭",states:["verified","retested"]},{label:"已关闭",states:["closed"]}];
  return <div className="module-page"><ModuleHeader eyebrow="ISSUE & REMEDIATION" title="整改闭环" subtitle="为检查发现分派责任人，跟踪整改证据、复核、重测与关闭。"/><div className="issue-summary-row"><div><b>{rows.filter(item=>item.status!=="closed").length}</b><span>项未关闭</span></div><div><b>{rows.filter(item=>item.status==="in_review").length}</b><span>等待复核</span></div><div><b>{rows.filter(item=>item.status==="closed").length}</b><span>已关闭</span></div><label className="search-box issue-search"><Search size={15}/><input value={search} onChange={e=>setSearch(e.target.value)} placeholder="搜索整改事项"/></label></div>{loading?<div className="loading-cell"><LoaderCircle className="spin" size={19}/>加载整改事项…</div>:rows.length?<div className="issue-board">{groups.map(group=>{const groupRows=rows.filter(row=>group.states.includes(String(row.status)));return <section className="issue-column" key={group.label}><div className="issue-column-head"><span className="column-dot" data-status={group.states[0]}/><b>{group.label}</b><span>{groupRows.length}</span></div><div className="issue-stack">{groupRows.map(item=><button className="issue-card" key={item.id} onClick={()=>setActiveIssue(item.id)}><div className="issue-card-meta"><code>{String(item.code)}</code><span className={`severity-dot ${String(item.priority)}`}/></div><h3 data-no-translate>{String(item.title)}</h3><div className="issue-card-bottom"><span className={`state-pill ${String(item.status)}`}>{stateLabels[String(item.status)]}</span><ArrowUpRight size={14}/></div></button>)}{!groupRows.length&&<div className="column-empty">暂无记录</div>}</div></section>;})}</div>:<div className="card issue-empty"><div className="empty-illustration"><ClipboardList size={27}/></div><h3>还没有需要跟踪的整改事项</h3><p>请先建立内控检查，并从未通过的检查项创建检查发现，再转为整改事项。</p></div>}{activeIssue&&<IssueDrawer key={activeIssue} org={org} issueId={activeIssue} role={role} user={user} onClose={()=>setActiveIssue(null)} onChanged={onChanged}/>}</div>;
}

type RemediationMember = {id:string;name:string;email:string;role:string;is_active:boolean};
type WorkflowActor = {id:string;name:string;email:string;role:string};

const remediationRoleLabels:Record<string,string>={manager:"公司经理",auditor:"内控审计员",owner:"整改责任人",viewer:"只读成员",system_admin:"系统管理员"};

function remediationOperators(members:RemediationMember[],user:User):WorkflowActor[] {
  const operators:WorkflowActor[]=members.filter(member=>member.is_active&&["manager","auditor"].includes(member.role)).map(member=>({id:member.id,name:member.name,email:member.email,role:member.role}));
  if(user.is_system_admin){
    const existing=operators.find(actor=>actor.id===user.id);
    if(existing){existing.role="system_admin";existing.name=user.full_name||existing.name;existing.email=user.email||existing.email;}
    else operators.push({id:user.id,name:user.full_name||"当前系统管理员",email:user.email,role:"system_admin"});
  }
  return operators;
}

function WorkflowActors({actors,emptyText}:{actors:WorkflowActor[];emptyText:string}) {
  if(!actors.length)return <span className="workflow-actors-empty">{emptyText}</span>;
  return <div className="workflow-actors">{actors.map(actor=><span className="workflow-actor" key={actor.id}><b>{actor.name||actor.email||actor.id.slice(0,8)}</b><small>{remediationRoleLabels[actor.role]}</small>{actor.email&&<a href={`mailto:${actor.email}`}>{actor.email}</a>}</span>)}</div>;
}

function RemediationWorkflowPanel({status,members,user,plan,selectedOwnerId,history}:{status:string;members:RemediationMember[];user:User;plan?:RecordRow;selectedOwnerId?:string;history:Record<string,unknown>[]}) {
  const ownerId=String(plan?.owner_user_id||selectedOwnerId||"");
  const currentVersion=Number(plan?.current_version||0);
  const currentRound=history.find(round=>Number((round.submission as RecordRow|undefined)?.version||0)===currentVersion);
  const submission=currentRound?.submission as RecordRow|undefined;
  const retest=currentRound?.retest as RecordRow|undefined;
  const submitterId=String(submission?.submitted_by||ownerId);
  const testerId=String(retest?.tester_user_id||"");
  const managers=remediationOperators(members,user);
  const reviewers=managers.filter(actor=>actor.id!==ownerId&&actor.id!==submitterId);
  const closers=managers.filter(actor=>actor.id!==ownerId&&actor.id!==testerId);
  const assigners=managers.filter(actor=>actor.role==="manager"||actor.role==="system_admin");
  const owner=members.find(member=>member.id===ownerId&&member.is_active);
  const stageIndex:Record<string,number>={open:0,in_progress:1,in_review:2,verified:3,retested:4,closed:5};
  const currentIndex=stageIndex[status]??0;
  const actorAllowed=status==="open"?(user.is_system_admin||members.some(member=>member.id===user.id&&member.is_active&&member.role==="manager")):
    status==="in_progress"?(user.id===ownerId||user.is_system_admin||members.some(member=>member.id===user.id&&member.is_active&&member.role==="manager")):
    status==="in_review"||status==="verified"?reviewers.some(actor=>actor.id===user.id):
    status==="retested"?closers.some(actor=>actor.id===user.id):false;
  const canManage=status==="in_progress"&&(user.is_system_admin||members.some(member=>member.id===user.id&&member.is_active&&member.role==="manager"));
  let permissionMessage="此事项已关闭，仅可查看流程记录。";
  if(status==="open")permissionMessage=actorAllowed?"你可以建立整改计划并分派责任人。":"仅公司经理或系统管理员可以建立整改计划；请联系下方的分派处理人。";
  else if(status==="in_progress")permissionMessage=user.id===ownerId?"你是当前责任人，可以补充证据并提交复核。":canManage?"你可以修改整改计划或转派；证据上传和提交复核仅当前责任人可操作。":"仅当前责任人可以上传证据并提交；请联系下方所列责任人。";
  else if(status==="in_review")permissionMessage=actorAllowed?"你符合本轮独立复核条件。":"当前责任人和本轮提交人不能复核；只有公司经理、内控审计员或系统管理员中的合格人员可以处理。";
  else if(status==="verified")permissionMessage=actorAllowed?"你符合当前版本重测条件。":"当前责任人和本轮提交人不能重测；只有公司经理、内控审计员或系统管理员中的合格人员可以处理。";
  else if(status==="retested")permissionMessage=actorAllowed?"你可以关闭本整改事项。":"责任人和本轮重测人不能关闭；请联系其他合格经理、内控审计员或系统管理员。";
  const steps=[
    {title:"建立整改计划",detail:"分派责任人",people:assigners,empty:"当前公司没有已启用的公司经理或可列出的系统管理员。",hint:"公司经理或系统管理员可建立计划并分派。"},
    {title:"整改执行",detail:"上传证据并提交",people:owner?[{id:owner.id,name:owner.name,email:owner.email,role:owner.id===user.id&&user.is_system_admin?"system_admin":owner.role}]:[],empty:"尚未设置有效责任人。",hint:"只有当前整改责任人可以上传证据和提交；公司经理/系统管理员可修改计划或转派。"},
    {title:"独立复核",detail:"审查整改结果",people:reviewers,empty:"目前没有符合条件的复核人；需启用责任人/提交人以外的公司经理或内控审计员。",hint:"排除当前责任人和本轮提交人。"},
    {title:"执行重测",detail:"验证控制是否有效",people:reviewers,empty:"目前没有符合条件的重测人；请先启用符合条件的公司经理或内控审计员。",hint:"排除当前责任人和本轮提交人；当前规则允许复核人与重测人为同一人。"},
    {title:"关闭整改",detail:"完成闭环",people:closers,empty:"目前没有符合条件的关闭人；需安排不同于当前责任人和重测人的经理或内控审计员。",hint:"排除当前责任人和本轮重测人。"},
  ];
  return <section className="workflow-operator-panel" aria-label="整改各阶段处理人和权限"><div className="workflow-operator-head"><div><h3>各阶段处理人和权限</h3><p>名单按当前公司已启用成员及本轮独立性规则计算，联系卡片可直接发邮件。</p></div><span className="workflow-current-badge">当前：{stateLabels[status]||status||"读取中"}</span></div><div className={`workflow-permission-note ${actorAllowed?"allowed":"blocked"}`}><b>{actorAllowed?"当前账号可参与此阶段":"当前账号不能处理此阶段"}</b><span>{permissionMessage}</span></div><div className="workflow-operator-steps">{steps.map((step,index)=>{const done=status==="closed"||index<currentIndex;const current=index===currentIndex&&status!=="closed";return <article className={`workflow-operator-step ${current?"current":""} ${done?"complete":""}`} key={step.title}><div className="workflow-step-heading"><b><i>{String(index+1).padStart(2,"0")}</i>{step.title}</b><span>{current?"当前阶段":done?"已完成":"后续阶段"}</span></div><p>{step.detail} · {step.hint}</p><WorkflowActors actors={step.people} emptyText={step.empty}/>{index===1&&<div className="workflow-support-actors"><small>计划修改或责任人转派：</small><WorkflowActors actors={assigners} emptyText="当前没有可列出的公司经理或系统管理员。"/></div>}</article>;})}</div></section>;
}

function IssueDrawer({org,issueId,role,user,onClose,onChanged}:{org:Organization;issueId:string;role:string;user:User;onClose:()=>void;onChanged:(msg:string)=>void}) {
  const [detail,setDetail]=useState<Record<string,unknown>|null>(null);const [members,setMembers]=useState<RemediationMember[]>([]);const [owner,setOwner]=useState("");const [reassignOwner,setReassignOwner]=useState("");const [rootCause,setRootCause]=useState("");const [actionPlan,setActionPlan]=useState("");const [dueDate,setDueDate]=useState("");const [summary,setSummary]=useState("");const [notes,setNotes]=useState("");const [passed,setPassed]=useState(true);const [busy,setBusy]=useState(false);const [error,setError]=useState("");
  const load=useCallback(async()=>{try{const [data,people]=await Promise.all([api(`/api/issues/${issueId}?organization_id=${org.id}`),api(`/api/organizations/${org.id}/members`)]);setDetail(data);setMembers(people.map((row:RecordRow)=>{const person=row.user as Record<string,unknown>|undefined;return{id:String(person?.id||""),name:String(person?.full_name||""),email:String(person?.email||""),role:String(row.role||"viewer"),is_active:person?.is_active!==false};}));if(!owner)setOwner("");}catch(err){setError(err instanceof Error?err.message:"加载失败");}},[issueId,org.id,owner]);
  useEffect(()=>{load();},[load]);
  const issue=detail?.issue as RecordRow|undefined;const plan=detail?.remediation as RecordRow|undefined;const status=String(issue?.status||"");const history=(detail?.history as Record<string,unknown>[]|undefined)||[];const currentRound=history.find(round=>Number(((round.submission as RecordRow|undefined)?.version)||0)===Number(plan?.current_version||0));const currentSubmission=currentRound?.submission as RecordRow|undefined;const currentRetest=currentRound?.retest as RecordRow|undefined;const isOwner=plan?.owner_user_id===user.id;const canCreatePlan=role==="manager"||user.is_system_admin;const canReassign=status==="in_progress"&&canCreatePlan;const assignedOwner=members.find(member=>member.id===plan?.owner_user_id);const eligibleOperators=(ownerId:string)=>remediationOperators(members,user).filter(actor=>actor.id!==ownerId);const creationOperators=eligibleOperators(owner);const reassignmentTarget=reassignOwner||String(plan?.owner_user_id||"");const reassignmentOperators=eligibleOperators(reassignmentTarget);const canCreateRoute=creationOperators.length>=2;const canReassignRoute=reassignmentOperators.length>=2;const canReview=Boolean(currentSubmission)&&(["manager","auditor"].includes(role)||user.is_system_admin)&&!isOwner&&currentSubmission?.submitted_by!==user.id;const canRetest=canReview;const canClose=status==="retested"&&Boolean(currentRetest)&&currentRetest?.passed===true&&(["manager","auditor"].includes(role)||user.is_system_admin)&&!isOwner&&currentRetest?.tester_user_id!==user.id;
  const run=async(path:string,payload?:unknown)=>{setBusy(true);setError("");try{await api(`/api/issues/${issueId}${path}?organization_id=${org.id}`,{method:"POST",...(payload?{body:JSON.stringify(payload)}:{})});await load();onChanged("整改事项状态已更新");}catch(err){setError(err instanceof Error?err.message:"操作失败");}finally{setBusy(false);}};
  const upload=async(file:File)=>{const body=new FormData();body.set("file",file);setBusy(true);try{await api(`/api/evidence?organization_id=${org.id}&remediation_plan_id=${plan?.id}`,{method:"POST",body});await load();}catch(err){setError(err instanceof Error?err.message:"上传失败");}finally{setBusy(false);}};
  if(!detail&&!error)return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="issue-drawer loading-drawer" onMouseDown={e=>e.stopPropagation()}><LoaderCircle className="spin"/> 读取问题详情…</aside></div>;
  return <div className="drawer-backdrop" onMouseDown={onClose}><aside className="issue-drawer" onMouseDown={e=>e.stopPropagation()}><div className="drawer-top"><div><div className="section-kicker">REMEDIATION TRACKER</div><span className="drawer-issue-code">{String(issue?.code||"")}</span></div><button className="icon-btn" onClick={onClose}><X size={17}/></button></div>{error&&<div className="form-error drawer-error"><AlertTriangle size={15}/>{error}</div>}{issue&&<><div className="drawer-title-row"><h2 data-no-translate>{String(issue.title)}</h2><span className={`state-pill ${status}`}>{stateLabels[status]||status}</span></div><p className="drawer-description" data-no-translate>{String((detail?.finding as RecordRow|undefined)?.condition||((detail?.risk as RecordRow|undefined)?.name?`关联风险：${String((detail?.risk as RecordRow).name)}`:"由内控检查发现并建立的问题。"))}</p><div className="drawer-metadata"><span><small>优先级</small><b>{stateLabels[String(issue.priority)]||String(issue.priority)}</b></span><span><small>创建时间</small><b>{dateShort(issue.created_at)}</b></span></div><div className="drawer-divider"/><RemediationWorkflowPanel status={status} members={members} user={user} plan={plan} selectedOwnerId={owner} history={history}/>
    {status==="open"&&canCreatePlan&&<section className="workflow-section"><div className="workflow-title"><span className="step-marker">01</span><div><h3>建立整改计划</h3><p>指定公司成员作为责任人。</p></div></div><label className="field-label">整改责任人<select value={owner} onChange={e=>setOwner(e.target.value)}><option value="">选择责任人…</option>{members.filter(item=>item.is_active).map(item=><option key={item.id} value={item.id}>{String(item.name||"")} · {item.email} · {remediationRoleLabels[item.role]||item.role}</option>)}</select></label><label className="field-label">根因分析<textarea value={rootCause} onChange={e=>setRootCause(e.target.value)} rows={3} placeholder="说明问题发生的根本原因"/></label><label className="field-label">整改措施<textarea value={actionPlan} onChange={e=>setActionPlan(e.target.value)} rows={3} placeholder="描述准备采取的整改行动"/></label><label className="field-label">计划完成日期<input type="date" value={dueDate} onChange={e=>setDueDate(e.target.value)} required/></label>{owner&&!canCreateRoute&&<div className="workflow-route-warning">该责任人会导致后续流程缺少独立处理人。除责任人外，至少需要两名已启用的公司经理、内控审计员或系统管理员。</div>}<button className="primary-btn full-btn" disabled={busy||!owner||!canCreateRoute||!rootCause||!actionPlan||!dueDate} onClick={()=>{setBusy(true);api(`/api/issues/${issueId}/remediation?organization_id=${org.id}`,{method:"POST",body:JSON.stringify({owner_user_id:owner,root_cause:rootCause,action_plan:actionPlan,due_date:dueDate})}).then(()=>load()).then(()=>onChanged("整改计划已分配" )).catch(err=>setError(err.message)).finally(()=>setBusy(false));}}>创建整改计划 <ArrowUpRight size={15}/></button></section>}
    {plan&&<><section className="workflow-section"><div className="workflow-title"><span className="step-marker">{status==="open"?"01":"02"}</span><div><h3>整改计划 · 第 {String(Number(plan.current_version||0)||"—")} 轮</h3><p>责任人：<span data-no-translate>{String(assignedOwner?.name||String(plan.owner_user_id).slice(0,8))}{assignedOwner?.is_active===false?"（账号已停用）":!assignedOwner?"（已不在当前公司成员中）":""}</span> · 截止 {dateShort(plan.due_date)}</p></div></div><div className="plan-note"><small>根因</small><p data-no-translate>{String(plan.root_cause)}</p><small>整改措施</small><p data-no-translate>{String(plan.action_plan)}</p></div>{canReassign&&<div className="reassign-remediation"><div className="workflow-title"><span className="step-marker"><Users size={12}/></span><div><h3>重新分配责任人</h3><p>负责人离职或无法处理时，可转交给其他已启用的公司成员。</p></div></div><label className="field-label">新整改责任人<select value={reassignOwner||String(plan.owner_user_id)} onChange={e=>setReassignOwner(e.target.value)}>{members.filter(member=>member.is_active||member.id===plan.owner_user_id).map(member=><option key={member.id} value={member.id} disabled={!member.is_active}>{String(member.name||"")} · {member.email} · {remediationRoleLabels[member.role]||member.role}{member.id===plan.owner_user_id?"（当前）":member.is_active?"":"（账号已停用）"}</option>)}{!assignedOwner&&<option value={String(plan.owner_user_id)} disabled>当前责任人（已不在公司成员中）</option>}</select></label><p className="field-hint">转派只在“整改中”阶段生效；已提交复核的事项须先退回整改，再重新分派。</p>{reassignOwner&&reassignOwner!==String(plan.owner_user_id)&&!canReassignRoute&&<div className="workflow-route-warning">该新责任人会导致后续流程缺少独立处理人，请至少保证其之外有两名已启用的经理、内控审计员或系统管理员。</div>}<button className="outline-btn full-btn" disabled={busy||!reassignOwner||!canReassignRoute||reassignOwner===String(plan.owner_user_id)} onClick={async()=>{setBusy(true);setError("");try{await api(`/api/issues/${issueId}/remediation?organization_id=${org.id}`,{method:"PATCH",body:JSON.stringify({owner_user_id:reassignOwner})});setReassignOwner("");await load();onChanged("整改责任人已重新分配");}catch(err){setError(err instanceof Error?err.message:"重新分配失败");}finally{setBusy(false);}}}>确认重新分配 <ArrowUpRight size={15}/></button></div>}{status==="in_progress"&&isOwner&&<><label className="field-label">根因分析<textarea value={rootCause||String(plan.root_cause)} onChange={e=>setRootCause(e.target.value)} rows={2}/></label><label className="field-label">整改计划<textarea value={actionPlan||String(plan.action_plan)} onChange={e=>setActionPlan(e.target.value)} rows={3}/></label><label className="field-label">计划完成日期<input type="date" value={dueDate||String(plan.due_date)} onChange={e=>setDueDate(e.target.value)}/></label><button className="outline-btn full-btn" disabled={busy} onClick={async()=>{setBusy(true);try{await api(`/api/issues/${issueId}/remediation?organization_id=${org.id}`,{method:"PATCH",body:JSON.stringify({root_cause:rootCause||plan.root_cause,action_plan:actionPlan||plan.action_plan,due_date:dueDate||plan.due_date})});await load();onChanged("整改计划已更新");}catch(err){setError(err instanceof Error?err.message:"更新失败");}finally{setBusy(false);}}}>保存计划修改 <Check size={14}/></button><label className="field-label" style={{marginTop:12}}>本轮整改摘要<input value={summary} onChange={e=>setSummary(e.target.value)} placeholder="提交时说明本轮完成的修改"/></label><div className="draft-evidence"><b>整改证据</b><span>{((detail?.draft_evidence as RecordRow[]|undefined)||[]).length} 份 · 上传后点击提交</span><label className="file-pick"><input type="file" onChange={e=>{const file=e.target.files?.[0];if(file)upload(file);}}/><Plus size={14}/>上传文件</label></div><button className="primary-btn full-btn" disabled={busy||!summary} onClick={()=>run("/remediation/submit",{summary})}>提交复核 <ArrowUpRight size={15}/></button></>}</section>
    {((detail?.history as Record<string,unknown>[]|undefined)||[]).map((round,index)=>{const submission=round.submission as {id:string;version:number;submitted_at:string;summary:string;root_cause_snapshot?:string;action_plan_snapshot?:string;due_date_snapshot?:string};const review=round.review as {passed:boolean;notes:string}|null;const retest=round.retest as {passed:boolean;notes:string}|null;return <section className="timeline-entry" key={submission.id}><div className="timeline-head"><span className="timeline-dot"/><div><b>第 {String(submission.version)} 轮整改</b><small>{dateShort(String(submission.submitted_at||""))}</small></div></div><p data-no-translate>{String(submission.summary||"")}</p><div className="plan-note"><small>本轮根因</small><p data-no-translate>{String(submission.root_cause_snapshot||"—")}</p><small>本轮整改措施</small><p data-no-translate>{String(submission.action_plan_snapshot||"—")}</p><small>本轮期限</small><p>{dateShort(submission.due_date_snapshot)}</p></div>{Array.isArray(round.evidence)&&<div className="history-files">{(round.evidence as {id:string;file_name:string}[]).map(file=><span key={file.id}><Files size={13}/><span data-no-translate>{file.file_name}</span></span>)}</div>}{review&&<div className={`decision-note ${review.passed?"approved":"rejected"}`}><b>{review.passed?"复核通过":"退回整改"}</b><span data-no-translate>{String(review.notes||"")}</span></div>}{retest&&<div className={`decision-note ${retest.passed?"approved":"rejected"}`}><b>{retest.passed?"重测通过":"重测未通过"}</b><span data-no-translate>{String(retest.notes||"")}</span></div>}</section>;})}</>}
    {status==="in_review"&&canReview&&<section className="workflow-section decision-section"><div className="workflow-title"><span className="step-marker">03</span><div><h3>独立复核</h3><p>复核人不能是整改责任人。</p></div></div><label className="field-label">复核意见<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="记录复核结论和必要说明"/></label><div className="decision-actions"><button className="reject-btn" disabled={busy||!notes} onClick={()=>{setPassed(false);run("/remediation/review",{passed:false,notes});}}>退回整改</button><button className="primary-btn" disabled={busy||!notes} onClick={()=>{setPassed(true);run("/remediation/review",{passed:true,notes});}}><Check size={15}/> 复核通过</button></div></section>}
    {status==="verified"&&canReview&&<section className="workflow-section decision-section"><div className="workflow-title"><span className="step-marker">04</span><div><h3>执行重测</h3><p>本轮整改已经通过复核，可记录重测结果。</p></div></div><label className="field-label">重测结论<select value={passed?"true":"false"} onChange={e=>setPassed(e.target.value==="true")}><option value="true">通过</option><option value="false">未通过，退回整改</option></select></label><label className="field-label">重测记录<textarea value={notes} onChange={e=>setNotes(e.target.value)} rows={3} placeholder="记录本次控制重测步骤与结论"/></label><button className="primary-btn full-btn" disabled={busy||!notes} onClick={()=>run("/remediation/retest",{passed,notes})}>保存重测结果 <ArrowUpRight size={15}/></button></section>}
    {status==="retested"&&canClose&&<section className="workflow-section close-box"><div><BadgeCheck size={19}/><div><b>重测已通过</b><span>已具备关闭条件。关闭操作会保留完整的整改历史。</span></div></div><button className="primary-btn full-btn" disabled={busy} onClick={()=>run("/close")}>关闭整改事项 <Check size={15}/></button></section>}
    {status==="closed"&&<div className="closed-banner"><BadgeCheck size={18}/> 本整改事项已完成闭环并关闭。</div>}
    </>}</aside></div>;
}

function ModuleHeader({eyebrow,title,subtitle,action}:{eyebrow:string;title:string;subtitle:string;action?:React.ReactNode}) {return <div className="module-header"><div><div className="section-kicker">{eyebrow}</div><h1>{title}</h1><p>{subtitle}</p></div>{action}</div>;}
function Modal({title,subtitle,onClose,children}:{title:string;subtitle:string;onClose:()=>void;children:React.ReactNode}) {return <div className="modal-backdrop" onMouseDown={onClose}><section className="modal-card" onMouseDown={e=>e.stopPropagation()}><div className="modal-head"><div><h2>{title}</h2><p>{subtitle}</p></div><button className="icon-btn" onClick={onClose}><X size={17}/></button></div>{children}</section></div>;}
function EmptyRow({text,cols}:{text:string;cols:number}) {return <tr><td colSpan={cols} className="empty-row"><div className="empty-row-icon"><Files size={19}/></div><b>{text}</b></td></tr>;}
