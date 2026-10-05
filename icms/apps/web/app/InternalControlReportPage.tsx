"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertTriangle, BadgeCheck, BarChart3, CheckCircle2, Clock3, ClipboardCheck,
  ChevronDown, Download, FileText, LoaderCircle, PieChart, Printer, RotateCw, ShieldCheck, XCircle,
} from "lucide-react";
import "./internal-control-report.css";

const API = process.env.NEXT_PUBLIC_API_URL || "";

type Row = Record<string, unknown> & { id: string };
type RiskRow = Row & {
  name?: string;
  code?: string;
  description?: string;
  category?: string;
  status?: string;
  process_name?: string;
  department_name?: string;
  owner_name?: string | null;
  risk_score?: number;
  risk_level?: string;
  risk_level_label?: string;
  controls?: (Row & { is_active?: boolean })[];
};
type InspectionRow = Row & { code?: string; name?: string; process_id?: string; period_start?: string; period_end?: string; status?: string };
type TestRow = Row & { inspection_id?: string; result?: string; procedure?: string; sample_description?: string | null; notes?: string | null };
type FindingRow = Row & { title?: string; severity?: string; status?: string; condition?: string; criteria?: string | null; root_cause?: string | null; impact?: string | null; recommendation?: string | null };
type IssueRow = Row & {
  code?: string;
  title?: string;
  priority?: string;
  status?: string;
  remediation?: { due_date?: string; owner_user_id?: string; root_cause?: string; action_plan?: string } | null;
};
type ReportData = {
  risks: RiskRow[];
  controls: Row[];
  processes: Row[];
  inspections: InspectionRow[];
  tests: TestRow[];
  findings: FindingRow[];
  issues: IssueRow[];
};
type ReportSummary = {
  risksByLevel: { id: string; label: string; tone: string; count: number }[];
  coveredRisks: number;
  coverageRate: number;
  linkedControls: number;
  tested: TestRow[];
  passRate: number;
  resultCounts: { id: string; label: string; count: number }[];
  findingsBySeverity: { id: string; label: string; count: number }[];
  openFindings: number;
  closedIssues: number;
  remediationRate: number;
  overdue: IssueRow[];
};

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${API}${path}`, { credentials: "include", cache: "no-store" });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const detail = typeof body === "object" && body && "detail" in body ? String(body.detail) : `请求失败 (${response.status})`;
    throw new Error(detail);
  }
  return body as T;
}

const countBy = (rows: Row[], key: string, value: string) => rows.filter(row => String(row[key] || "") === value).length;
const riskLevels = [
  { id: "critical", label: "重大", tone: "critical" },
  { id: "high", label: "高", tone: "high" },
  { id: "medium", label: "中", tone: "medium" },
  { id: "low", label: "低", tone: "low" },
];
const resultLabels: Record<string, string> = { pass: "通过", fail: "未通过", needs_improvement: "需改进", not_tested: "未测试", not_applicable: "不适用" };
const severityLabels: Record<string, string> = { critical: "严重", high: "高", medium: "中", low: "低" };
const statusLabels: Record<string, string> = {
  active: "进行中", accepted: "已接受", mitigating: "应对中", closed: "已关闭",
  planned: "计划中", in_progress: "执行中", completed: "已完成", open: "待处理",
  converted: "已转整改", in_review: "等待复核", verified: "待重测", retested: "待关闭",
};
const frequencyLabels: Record<string, string> = { continuous: "持续", daily: "每日", weekly: "每周", monthly: "每月", quarterly: "每季度", annual: "每年", ad_hoc: "按需" };
const controlTypeLabels: Record<string, string> = { preventive: "预防性", detective: "检查性", corrective: "纠正性" };
const executionModeLabels: Record<string, string> = { manual: "人工", automated: "自动", hybrid: "人工与自动" };
const dateLabel = (value: string) => {
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  return Number.isNaN(date.valueOf()) ? value : date.toLocaleDateString("zh-CN", { month: "numeric", day: "numeric" });
};
const reportDate = (value: unknown) => {
  if (!value) return "—";
  const raw = String(value).slice(0, 10);
  const match = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/u);
  return match ? `${match[1]}年${Number(match[2])}月${Number(match[3])}日` : String(value);
};
const reportValue = (value: unknown, fallback = "—") => value === null || value === undefined || value === "" ? fallback : String(value);
const localDateStamp = () => {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
};
const escapeHtml = (value: unknown) => reportValue(value).replace(/[&<>"']/gu, character => {
  if (character === "&") return "&amp;";
  if (character === "<") return "&lt;";
  if (character === ">") return "&gt;";
  if (character === '"') return "&quot;";
  return "&#39;";
});
const escapeXml = (value: unknown) => reportValue(value).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/gu, "").replace(/[&<>"']/gu, character => {
  if (character === "&") return "&amp;";
  if (character === "<") return "&lt;";
  if (character === ">") return "&gt;";
  if (character === '"') return "&quot;";
  return "&apos;";
});

function reportTable(headers: string[], rows: unknown[][]) {
  if (!rows.length) return `<p class="empty-note">暂无记录</p>`;
  return `<table><thead><tr>${headers.map(item => `<th>${escapeHtml(item)}</th>`).join("")}</tr></thead><tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${escapeHtml(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function buildReportMarkup(data: ReportData, summary: ReportSummary, organizationName: string, generatedOn: string) {
  const activeControls = data.controls.filter(control => control.is_active !== false);
  const riskRows = data.risks.map(risk => [
    risk.code, risk.name, risk.category, `${risk.risk_level_label || severityLabels[String(risk.risk_level)] || risk.risk_level || "—"} / ${risk.risk_score ?? "—"}`,
    risk.process_name, statusLabels[String(risk.status)] || risk.status,
    (risk.controls || []).filter(control => control.is_active !== false).map(control => `${control.code || ""} ${control.name || ""}`.trim()).join("、") || "未关联启用控制",
  ]);
  const processNames = new Map(data.processes.map(process => [String(process.id), String(process.name || "未分配流程")] as const));
  const controlRows = data.controls.map(control => [
    control.code, control.name, processNames.get(String(control.process_id)) || "—",
    controlTypeLabels[String(control.control_type)] || control.control_type,
    frequencyLabels[String(control.frequency)] || control.frequency,
    executionModeLabels[String(control.execution_mode)] || control.execution_mode,
    control.is_key_control ? "是" : "否", control.is_active === false ? "停用" : "启用",
  ]);
  const inspectionCounts = new Map<string, number>();
  data.tests.forEach(test => inspectionCounts.set(String(test.inspection_id), (inspectionCounts.get(String(test.inspection_id)) || 0) + 1));
  const inspectionRows = data.inspections.map(inspection => {
    const relatedTests = data.tests.filter(test => test.inspection_id === inspection.id);
    return [inspection.code, inspection.name, `${reportDate(inspection.period_start)} 至 ${reportDate(inspection.period_end)}`,
      statusLabels[String(inspection.status)] || inspection.status, inspectionCounts.get(inspection.id) || 0,
      `${relatedTests.filter(test => test.result === "pass").length} 通过 / ${relatedTests.filter(test => test.result === "fail").length} 未通过 / ${relatedTests.filter(test => test.result === "needs_improvement").length} 需改进`];
  });
  const testRows = data.tests.map(test => [
    data.inspections.find(inspection => inspection.id === test.inspection_id)?.name || "—",
    resultLabels[String(test.result)] || test.result, test.procedure, test.sample_description, test.notes,
  ]);
  const issueRows = data.issues.map(issue => [
    issue.code, issue.title, severityLabels[String(issue.priority)] || issue.priority,
    statusLabels[String(issue.status)] || issue.status,
    issue.remediation ? reportDate(issue.remediation.due_date) : "未制定整改计划",
  ]);
  const reportHeading = `${organizationName} 内控报告`;

  return `<article class="report-document">
    <header class="report-cover"><div class="eyebrow">INTERNAL CONTROL REPORT</div><h1>${escapeHtml(reportHeading)}</h1><p>报告日期：${escapeHtml(generatedOn)}</p><p>本报告根据当前公司风险库、控制库、内控检查、检查发现与整改数据实时汇总。</p></header>
    <section><h2>一、执行摘要</h2>${reportTable(["指标", "汇总结果", "指标", "汇总结果"], [
      ["风险总数", `${data.risks.length} 项`, "高及重大风险", `${(summary.risksByLevel.find(item => item.id === "critical")?.count || 0) + (summary.risksByLevel.find(item => item.id === "high")?.count || 0)} 项`],
      ["控制措施", `${data.controls.length} 项（启用 ${activeControls.length} 项）`, "风险控制覆盖率", `${summary.coverageRate}%（${summary.coveredRisks}/${data.risks.length}）`],
      ["检查任务", `${data.inspections.length} 项`, "检查测试通过率", `${summary.passRate}%（${summary.tested.length} 项已测试）`],
      ["检查发现", `${data.findings.length} 项（待处理 ${summary.openFindings} 项）`, "整改完成率", `${summary.remediationRate}%（${summary.closedIssues}/${data.issues.length}）`],
      ["逾期整改", `${summary.overdue.length} 项`, "报告生成时间", generatedOn],
    ])}
    <h3>风险等级分布</h3>${reportTable(["风险等级", "数量", "占比"], summary.risksByLevel.map(item => [item.label, item.count, data.risks.length ? `${Math.round(item.count / data.risks.length * 100)}%` : "0%"]))}
    <p class="method-note">统计口径：风险控制覆盖率按至少关联一项启用控制措施的风险数计算；检查通过率以已测试且非“不适用”的测试项为分母；整改完成率按已关闭整改事项占全部整改事项计算。</p></section>
    <section><h2>二、风险评估</h2><p>当前共识别 ${data.risks.length} 项风险，其中重大 ${summary.risksByLevel.find(item => item.id === "critical")?.count || 0} 项、高风险 ${summary.risksByLevel.find(item => item.id === "high")?.count || 0} 项。下表列示风险等级、责任归属与关联控制情况。</p>
    ${reportTable(["编号", "风险名称", "类别", "等级 / 评分", "业务流程", "状态", "启用控制"], riskRows)}
    ${data.risks.map(risk => `<h3>${escapeHtml(`${risk.code || "风险"} · ${risk.name || "未命名风险"}`)}</h3><p><b>风险描述：</b>${escapeHtml(risk.description)}</p><p><b>所属部门：</b>${escapeHtml(risk.department_name)}；<b>负责人：</b>${escapeHtml(risk.owner_name || "未分配")}；<b>剩余风险：</b>${escapeHtml(risk.residual_score ?? "尚未评估")}</p><p><b>验证频率：</b>${escapeHtml(frequencyLabels[String(risk.verification_frequency)] || risk.verification_frequency || "—")}；<b>责任岗位：</b>${escapeHtml(risk.owner_role || "—")}</p>`).join("")}</section>
    <section><h2>三、控制措施</h2><p>风险当前关联 ${summary.linkedControls} 项启用控制。控制措施总数 ${data.controls.length} 项，其中启用 ${activeControls.length} 项。</p>${reportTable(["编号", "控制措施", "业务流程", "控制类型", "执行频率", "执行方式", "关键控制", "状态"], controlRows)}</section>
    <section><h2>四、内控检查</h2><p>共 ${data.inspections.length} 项检查任务，记录 ${data.tests.length} 项检查测试。测试结果通过 ${countBy(data.tests, "result", "pass")} 项、未通过 ${countBy(data.tests, "result", "fail")} 项、需改进 ${countBy(data.tests, "result", "needs_improvement")} 项、未测试 ${countBy(data.tests, "result", "not_tested")} 项。</p>
    <h3>检查任务</h3>${reportTable(["编号", "检查名称", "检查期间", "状态", "测试项", "测试结果摘要"], inspectionRows)}
    <h3>检查测试记录</h3>${reportTable(["所属检查", "结论", "检查程序", "样本说明", "检查记录"], testRows)}</section>
    <section><h2>五、检查发现</h2>${data.findings.length ? data.findings.map(finding => `<h3>${escapeHtml(finding.title || "检查发现")}（${escapeHtml(severityLabels[String(finding.severity)] || finding.severity || "—")}）</h3>${reportTable(["项目", "内容"], [["状态", statusLabels[String(finding.status)] || finding.status], ["实际情况", finding.condition], ["控制要求", finding.criteria], ["原因分析", finding.root_cause], ["影响", finding.impact], ["改进建议", finding.recommendation]])}`).join("") : `<p>当前暂无检查发现。</p>`}</section>
    <section><h2>六、整改跟踪</h2><p>整改事项共 ${data.issues.length} 项，已关闭 ${summary.closedIssues} 项，完成率 ${summary.remediationRate}%；当前有 ${summary.overdue.length} 项逾期未关闭。</p>
    ${reportTable(["编号", "整改事项", "优先级", "状态", "截止日期"], issueRows)}
    ${data.issues.map(issue => issue.remediation ? `<h3>${escapeHtml(`${issue.code || "整改事项"} · ${issue.title || "未命名事项"}`)}</h3><p><b>根因分析：</b>${escapeHtml(issue.remediation.root_cause)}</p><p><b>整改方案：</b>${escapeHtml(issue.remediation.action_plan)}</p><p><b>计划截止：</b>${escapeHtml(reportDate(issue.remediation.due_date))}</p>` : "").join("")}</section>
    <footer><p>本报告为系统业务数据汇总，供公司内控管理与监督整改参考。</p><p>${escapeHtml(organizationName)} · ${escapeHtml(generatedOn)}</p></footer>
  </article>`;
}

const REPORT_CSS = `
  :root{color-scheme:light}*{box-sizing:border-box}body{margin:0;background:#eef2ef;color:#273b36;font:14px/1.7 -apple-system,BlinkMacSystemFont,"Segoe UI","PingFang SC","Microsoft YaHei",sans-serif}
  .report-document{width:min(980px,calc(100% - 40px));margin:28px auto;padding:48px 58px;background:#fff;box-shadow:0 10px 35px #19372b17}.report-cover{padding:0 0 25px;border-bottom:2px solid #438d70;margin-bottom:24px}.report-cover .eyebrow{font-size:10px;font-weight:700;letter-spacing:.17em;color:#438d70}.report-cover h1{font-size:28px;line-height:1.35;margin:10px 0 12px;color:#203c32}.report-cover p{font-size:12px;color:#75837d;margin:5px 0}.report-document section{margin:0 0 26px}.report-document h2{padding:9px 12px;border-left:4px solid #4b9a79;background:#f1f7f3;color:#315a48;font-size:17px;margin:20px 0 12px;break-after:avoid}.report-document h3{font-size:13px;color:#456d58;margin:17px 0 7px;break-after:avoid}.report-document p{font-size:11px;line-height:1.85;margin:6px 0;color:#52635b;overflow-wrap:anywhere}.report-document table{width:100%;border-collapse:collapse;margin:10px 0 15px;table-layout:fixed;font-size:9px;line-height:1.55}.report-document th,.report-document td{border:1px solid #dce7df;padding:7px 8px;text-align:left;vertical-align:top;overflow-wrap:anywhere;word-break:break-word}.report-document th{background:#edf5ef;color:#426552;font-weight:700}.report-document tbody tr:nth-child(even){background:#fafcfb}.report-document .method-note,.report-document .empty-note{color:#829188;font-size:9px}.report-document footer{border-top:1px solid #dce7df;padding-top:12px;margin-top:30px}.report-document footer p{font-size:9px;color:#8a9790}
  @page{size:A4;margin:16mm 14mm}@media print{body{background:#fff;font-size:10pt}.report-document{width:auto;margin:0;padding:0;box-shadow:none}.report-cover{padding-bottom:13mm}.report-document section{margin-bottom:8mm}.report-document h2{font-size:14pt;break-after:avoid}.report-document h3{break-after:avoid}.report-document table{font-size:8pt;break-inside:auto}.report-document tr{break-inside:avoid;break-after:auto}.report-document thead{display:table-header-group}.report-document footer{break-inside:avoid}}
`;

function docxTextParagraph(text: string, style?: string) {
  const styleXml = style ? `<w:pPr><w:pStyle w:val="${style}"/></w:pPr>` : "";
  return `<w:p>${styleXml}<w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:color w:val="31483D"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

function docxTable(rows: string[][]) {
  if (!rows.length) return "";
  const columnCount = Math.max(1, ...rows.map(row => row.length));
  const cellWidth = Math.floor(9360 / columnCount);
  const border = `<w:top w:val="single" w:sz="4" w:color="DCE7DF"/><w:left w:val="single" w:sz="4" w:color="DCE7DF"/><w:bottom w:val="single" w:sz="4" w:color="DCE7DF"/><w:right w:val="single" w:sz="4" w:color="DCE7DF"/><w:insideH w:val="single" w:sz="4" w:color="DCE7DF"/><w:insideV w:val="single" w:sz="4" w:color="DCE7DF"/>`;
  const rowXml = rows.map((row, rowIndex) => `<w:tr>${rowIndex === 0 ? `<w:trPr><w:tblHeader/></w:trPr>` : ""}${Array.from({ length: columnCount }, (_, columnIndex) => {
    const text = row[columnIndex] || "";
    const fill = rowIndex === 0 ? `<w:shd w:fill="EDF5EF"/>` : "";
    return `<w:tc><w:tcPr><w:tcW w:w="${cellWidth}" w:type="dxa"/>${fill}</w:tcPr><w:p><w:pPr><w:spacing w:after="45"/></w:pPr><w:r><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:color w:val="426552"/><w:sz w:val="18"/></w:rPr><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p></w:tc>`;
  }).join("")}</w:tr>`).join("");
  return `<w:tbl><w:tblPr><w:tblW w:w="9360" w:type="dxa"/><w:tblLayout w:type="fixed"/><w:tblBorders>${border}</w:tblBorders><w:tblCellMar><w:top w:w="75" w:type="dxa"/><w:left w:w="90" w:type="dxa"/><w:bottom w:w="75" w:type="dxa"/><w:right w:w="90" w:type="dxa"/></w:tblCellMar></w:tblPr><w:tblGrid>${Array.from({ length: columnCount }, () => `<w:gridCol w:w="${cellWidth}"/>`).join("")}</w:tblGrid>${rowXml}</w:tbl>`;
}

function crc32(bytes: Uint8Array) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function zipFiles(files: { name: string; content: string }[]) {
  const encoder = new TextEncoder();
  const localParts: Uint8Array[] = [];
  const centralParts: Uint8Array[] = [];
  let offset = 0;
  const viewOf = (length: number, setup: (view: DataView) => void) => { const bytes = new Uint8Array(length); setup(new DataView(bytes.buffer)); return bytes; };
  for (const file of files) {
    const name = encoder.encode(file.name);
    const content = encoder.encode(file.content);
    const checksum = crc32(content);
    const localHeader = viewOf(30, view => {
      view.setUint32(0, 0x04034b50, true); view.setUint16(4, 20, true); view.setUint16(6, 0x800, true);
      view.setUint16(8, 0, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true);
      view.setUint32(14, checksum, true); view.setUint32(18, content.length, true); view.setUint32(22, content.length, true);
      view.setUint16(26, name.length, true); view.setUint16(28, 0, true);
    });
    localParts.push(localHeader, name, content);
    const centralHeader = viewOf(46, view => {
      view.setUint32(0, 0x02014b50, true); view.setUint16(4, 20, true); view.setUint16(6, 20, true);
      view.setUint16(8, 0x800, true); view.setUint16(10, 0, true); view.setUint16(12, 0, true); view.setUint16(14, 0, true);
      view.setUint32(16, checksum, true); view.setUint32(20, content.length, true); view.setUint32(24, content.length, true);
      view.setUint16(28, name.length, true); view.setUint16(30, 0, true); view.setUint16(32, 0, true);
      view.setUint16(34, 0, true); view.setUint16(36, 0, true); view.setUint32(38, 0, true); view.setUint32(42, offset, true);
    });
    centralParts.push(centralHeader, name);
    offset += localHeader.length + name.length + content.length;
  }
  const centralSize = centralParts.reduce((sum, part) => sum + part.length, 0);
  const end = viewOf(22, view => {
    view.setUint32(0, 0x06054b50, true); view.setUint16(4, 0, true); view.setUint16(6, 0, true);
    view.setUint16(8, files.length, true); view.setUint16(10, files.length, true);
    view.setUint32(12, centralSize, true); view.setUint32(16, offset, true); view.setUint16(20, 0, true);
  });
  const archiveBuffer = new ArrayBuffer(offset + centralSize + end.length);
  const archiveBytes = new Uint8Array(archiveBuffer);
  let cursor = 0;
  [...localParts, ...centralParts, end].forEach(part => { archiveBytes.set(part, cursor); cursor += part.length; });
  return new Blob([archiveBuffer], { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

function buildDocx(markup: string) {
  const parsed = new DOMParser().parseFromString(markup, "text/html");
  const blocks: string[] = [];
  const walk = (node: Element) => {
    const tag = node.tagName.toLowerCase();
    const text = node.textContent?.replace(/\s+/gu, " ").trim() || "";
    if (["h1", "h2", "h3", "p", "li"].includes(tag)) {
      const style = tag === "h1" ? "Title" : tag === "h2" ? "Heading1" : tag === "h3" ? "Heading2" : undefined;
      blocks.push(docxTextParagraph(tag === "li" ? `• ${text}` : text, style));
      return;
    }
    if (tag === "table") {
      const rows = Array.from(node.querySelectorAll("tr")).map(row => Array.from(row.querySelectorAll("th,td")).map(cell => cell.textContent?.replace(/\s+/gu, " ").trim() || ""));
      blocks.push(docxTable(rows));
      return;
    }
    Array.from(node.children).forEach(walk);
  };
  Array.from(parsed.body.children).forEach(walk);
  const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks.join("")}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1134" w:right="1134" w:bottom="1134" w:left="1134" w:header="567" w:footer="567" w:gutter="0"/></w:sectPr></w:body></w:document>`;
  const stylesXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Aptos" w:hAnsi="Aptos" w:eastAsia="Microsoft YaHei"/><w:sz w:val="21"/><w:lang w:val="zh-CN"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="120" w:line="330" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults><w:style w:type="paragraph" w:styleId="Normal"><w:name w:val="Normal"/></w:style><w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:basedOn w:val="Normal"/><w:pPr><w:spacing w:before="100" w:after="240"/></w:pPr><w:rPr><w:b/><w:color w:val="203C32"/><w:sz w:val="36"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="320" w:after="120"/><w:pBdr><w:left w:val="single" w:sz="20" w:space="8" w:color="4B9A79"/></w:pBdr></w:pPr><w:rPr><w:b/><w:color w:val="315A48"/><w:sz w:val="28"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:basedOn w:val="Normal"/><w:next w:val="Normal"/><w:pPr><w:keepNext/><w:spacing w:before="220" w:after="80"/></w:pPr><w:rPr><w:b/><w:color w:val="456D58"/><w:sz w:val="23"/></w:rPr></w:style></w:styles>`;
  const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`;
  const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>`;
  const documentRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`;
  const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>企业内控报告</dc:title><dc:creator>企业内控管理系统</dc:creator><dc:language>zh-CN</dc:language></cp:coreProperties>`;
  return zipFiles([
    { name: "[Content_Types].xml", content: contentTypes }, { name: "_rels/.rels", content: rootRels },
    { name: "word/document.xml", content: documentXml }, { name: "word/styles.xml", content: stylesXml },
    { name: "word/_rels/document.xml.rels", content: documentRels }, { name: "docProps/core.xml", content: core },
  ]);
}

function saveBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url; anchor.download = fileName; anchor.style.display = "none";
  document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export default function InternalControlReportPage({ organizationId, organizationName }: { organizationId: string; organizationName: string }) {
  const [data, setData] = useState<ReportData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [exportError, setExportError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [exporting, setExporting] = useState(false);
  const exportMenuRef = useRef<HTMLDetailsElement>(null);

  useEffect(() => {
    const closeOnOutsideClick = (event: PointerEvent) => {
      if (exportMenuRef.current && !exportMenuRef.current.contains(event.target as Node)) exportMenuRef.current.open = false;
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && exportMenuRef.current) exportMenuRef.current.open = false;
    };
    document.addEventListener("pointerdown", closeOnOutsideClick);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsideClick);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  useEffect(() => {
    let active = true;
    const query = `?organization_id=${encodeURIComponent(organizationId)}`;
    setData(null);
    setLoading(true);
    setError("");
    Promise.all([
      request<{ risks: RiskRow[]; processes?: Row[] }>(`/api/risk-management${query}`),
      request<Row[]>(`/api/controls${query}`),
      request<Row[]>(`/api/inspections${query}`),
      request<Row[]>(`/api/inspection-tests${query}`),
      request<Row[]>(`/api/findings${query}`),
      request<IssueRow[]>(`/api/issues${query}`),
    ]).then(([riskPack, controls, inspections, tests, findings, issues]) => {
      if (active) setData({ risks: riskPack.risks || [], processes: riskPack.processes || [], controls, inspections, tests, findings, issues });
    }).catch(reason => {
      if (active) setError(reason instanceof Error ? reason.message : "报告数据加载失败");
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [organizationId, reloadKey]);

  const summary = useMemo<ReportSummary | null>(() => {
    if (!data) return null;
    const risksByLevel = riskLevels.map(level => ({ ...level, count: data.risks.filter(risk => risk.risk_level === level.id).length }));
    const coveredRisks = data.risks.filter(risk => (risk.controls || []).some(control => control.is_active !== false)).length;
    const linkedControlIds = new Set(data.risks.flatMap(risk => (risk.controls || []).filter(control => control.is_active !== false).map(control => control.id)));
    const tested = data.tests.filter(test => !["not_tested", "not_applicable"].includes(String(test.result || "not_tested")));
    const resultCounts = ["pass", "fail", "needs_improvement", "not_tested"].map(result => ({ id: result, label: resultLabels[result], count: countBy(data.tests, "result", result) }));
    const findingsBySeverity = ["critical", "high", "medium", "low"].map(level => ({ id: level, label: severityLabels[level], count: data.findings.filter(finding => finding.severity === level).length }));
    const closedIssues = data.issues.filter(issue => issue.status === "closed").length;
    const now = new Date();
    const today = new Date(now.getTime() - now.getTimezoneOffset() * 60_000).toISOString().slice(0, 10);
    const overdue = data.issues.filter(issue => issue.status !== "closed" && issue.remediation?.due_date && issue.remediation.due_date.slice(0, 10) < today)
      .sort((a, b) => String(a.remediation?.due_date || "").localeCompare(String(b.remediation?.due_date || "")));
    return {
      risksByLevel,
      coveredRisks,
      coverageRate: data.risks.length ? Math.round(coveredRisks / data.risks.length * 100) : 0,
      linkedControls: linkedControlIds.size,
      tested,
      passRate: tested.length ? Math.round(countBy(tested, "result", "pass") / tested.length * 100) : 0,
      resultCounts,
      findingsBySeverity,
      openFindings: data.findings.filter(finding => finding.status === "open").length,
      closedIssues,
      remediationRate: data.issues.length ? Math.round(closedIssues / data.issues.length * 100) : 0,
      overdue,
    };
  }, [data]);

  const exportReady = Boolean(data && summary && !loading && !error);
  const reportMarkup = () => {
    if (!data || !summary) return "";
    const generatedOn = new Date().toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric" });
    return buildReportMarkup(data, summary, organizationName, generatedOn);
  };
  const reportFileName = () => {
    const orgName = organizationName.replace(/[\\/:*?"<>|]/gu, "_").trim() || "企业";
    const today = localDateStamp();
    return `${orgName}-${today}-内控报告`;
  };
  const exportWord = async () => {
    if (!exportReady) return;
    setExportError("");
    setExporting(true);
    try {
      const blob = buildDocx(reportMarkup());
      saveBlob(blob, `${reportFileName()}.docx`);
    } catch {
      setExportError("Word 文件生成失败，请刷新报告后重试。");
    } finally {
      setExporting(false);
    }
  };
  const exportPdf = () => {
    if (!exportReady) return;
    const printWindow = window.open("", "_blank");
    if (!printWindow) {
      setExportError("浏览器拦截了 PDF 导出窗口，请允许此站点打开弹出窗口后重试。");
      return;
    }
    setExportError("");
    const markup = reportMarkup();
    const title = escapeHtml(`${organizationName} 内控报告`);
    printWindow.document.open();
    printWindow.document.write(`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>${REPORT_CSS}</style></head><body>${markup}</body></html>`);
    printWindow.document.close();
    printWindow.addEventListener("afterprint", () => printWindow.close(), { once: true });
    window.setTimeout(() => { printWindow.focus(); printWindow.print(); }, 450);
  };
  const closeExportMenu = () => exportMenuRef.current?.removeAttribute("open");

  const riskTotal = data?.risks.length || 0;
  const moduleCards = [
    {
      title: "风险分布", eyebrow: "RISK PROFILE", description: "按固有风险等级汇总当前风险库。", icon: PieChart,
      value: loading && !data ? "—" : String(riskTotal), unit: "项风险", tone: "risk",
      content: summary ? <div className="report-breakdown report-risk-breakdown">{summary.risksByLevel.map(item => <div className="report-breakdown-row" key={item.id}><span className={`report-dot ${item.tone}`}/><span>{item.label}风险</span><b>{item.count}</b><div className="report-mini-track"><i className={item.tone} style={{ width: `${riskTotal ? item.count / riskTotal * 100 : 0}%` }}/></div></div>)}</div> : <EmptyLine loading={loading} text="暂无风险记录"/> ,
    },
    {
      title: "控制覆盖率", eyebrow: "CONTROL COVERAGE", description: "风险至少关联一项启用控制措施的比例。", icon: ShieldCheck,
      value: loading && !data ? "—" : `${summary?.coverageRate || 0}%`, unit: `${summary?.coveredRisks || 0} / ${riskTotal} 项风险`, tone: "coverage",
      content: summary ? <div className="report-progress-block"><div className="report-progress-track"><i style={{ width: `${summary.coverageRate}%` }}/></div><div className="report-inline-note"><span>已关联 {summary.linkedControls} 项控制</span><span>{riskTotal - summary.coveredRisks} 项待覆盖</span></div></div> : <EmptyLine loading={loading} text="暂无覆盖数据"/> ,
    },
    {
      title: "检查结果", eyebrow: "INSPECTION RESULTS", description: "按已执行测试项统计结果，通过率以已测试项为分母。", icon: ClipboardCheck,
      value: loading && !data ? "—" : `${summary?.passRate || 0}%`, unit: `${summary?.tested.length || 0} 项已测试`, tone: "inspection",
      content: summary ? <div className="report-chip-list">{summary.resultCounts.map(item => <span className={`report-count-chip ${item.id}`} key={item.id}>{item.label}<b>{item.count}</b></span>)}</div> : <EmptyLine loading={loading} text="暂无检查记录"/> ,
    },
    {
      title: "缺陷统计", eyebrow: "DEFICIENCY ANALYSIS", description: "汇总检查发现的严重程度及待整改数量。", icon: BarChart3,
      value: loading && !data ? "—" : String(data?.findings.length || 0), unit: "项检查发现", tone: "finding",
      content: summary ? <div className="report-chip-list">{summary.findingsBySeverity.map(item => <span className={`report-count-chip severity-${item.id}`} key={item.id}>{item.label}<b>{item.count}</b></span>)}<span className="report-open-note">待处理 {summary.openFindings} 项</span></div> : <EmptyLine loading={loading} text="暂无检查发现"/> ,
    },
    {
      title: "整改完成率", eyebrow: "REMEDIATION RATE", description: "按已关闭整改事项占全部整改事项计算。", icon: BadgeCheck,
      value: loading && !data ? "—" : `${summary?.remediationRate || 0}%`, unit: `${summary?.closedIssues || 0} / ${data?.issues.length || 0} 项已关闭`, tone: "remediation",
      content: summary ? <div className="report-progress-block"><div className="report-progress-track"><i style={{ width: `${summary.remediationRate}%` }}/></div><div className="report-inline-note"><span><CheckCircle2 size={12}/> 已关闭 {summary.closedIssues}</span><span>处理中 {(data?.issues.length || 0) - summary.closedIssues}</span></div></div> : <EmptyLine loading={loading} text="暂无整改事项"/> ,
    },
    {
      title: "逾期整改", eyebrow: "OVERDUE REMEDIATION", description: "未关闭且超过整改计划截止日期的事项。", icon: Clock3,
      value: loading && !data ? "—" : String(summary?.overdue.length || 0), unit: "项已逾期", tone: "overdue",
      content: summary?.overdue.length ? <div className="report-overdue-list">{summary.overdue.slice(0, 3).map(issue => <div key={issue.id}><span>{issue.title || "整改事项"}</span><b>截止 {dateLabel(String(issue.remediation?.due_date || ""))}</b></div>)}{summary.overdue.length > 3 && <small>另有 {summary.overdue.length - 3} 项逾期整改</small>}</div> : <EmptyLine loading={loading} text="暂无逾期整改"/>,
    },
  ];

  return <div className="module-page internal-report-page">
    <header className="module-header report-page-header"><div><span className="section-kicker">INTERNAL CONTROL REPORT</span><h1>内控报告</h1><p>查看 {organizationName} 的风险、控制、检查与整改汇总。</p></div><div className="report-header-actions"><details className="report-export-dropdown" ref={exportMenuRef}><summary className="primary-btn compact" aria-label="选择报告导出格式" aria-disabled={!exportReady || exporting} onClick={event => { if (!exportReady || exporting) event.preventDefault(); }}><Download size={14}/>{exporting ? "正在生成" : "导出报告"}<ChevronDown size={13}/></summary><div className="report-export-options" aria-label="导出格式"><button type="button" onClick={() => { closeExportMenu(); void exportWord(); }} disabled={!exportReady || exporting}><FileText size={14}/>Word（.docx）</button><button type="button" onClick={() => { closeExportMenu(); exportPdf(); }} disabled={!exportReady || exporting} title="打开打印窗口后选择“存储为 PDF”"><Printer size={14}/>PDF</button></div></details><span className={`state-pill report-ready-pill ${loading ? "is-loading" : ""}`}>{loading ? <LoaderCircle size={13} className="spin"/> : <BarChart3 size={13} />}{loading ? "正在汇总" : "数据实时汇总"}</span></div></header>
    <section className="card report-intro"><div className="report-intro-icon"><BarChart3 size={20}/></div><div><b>当前公司业务数据</b><p>统计结果来自风险库、控制库、内控检查、检查发现和整改闭环；切换公司后自动更新。Word 直接下载为 .docx，PDF 在打印窗口中选择“存储为 PDF”。</p></div><span>{loading ? "正在读取数据…" : `${riskTotal} 项风险 · ${data?.controls.length || 0} 项控制 · ${data?.inspections.length || 0} 项检查 · ${data?.issues.length || 0} 项整改`}</span></section>
    {error && <div className="report-error" role="alert"><AlertTriangle size={15}/><span>报告数据读取失败：{error}</span><button type="button" onClick={() => setReloadKey(value => value + 1)}><RotateCw size={13}/>重新读取</button></div>}
    {exportError && <div className="report-error" role="alert"><AlertTriangle size={15}/><span>报告导出失败：{exportError}</span><button type="button" onClick={() => setExportError("")}>知道了</button></div>}
    <section className="report-module-grid" aria-label="内控报告分析模块">{moduleCards.map((item, index) => { const Icon = item.icon; return <article className={`card report-module-card ${item.tone}`} key={item.title}>
      <div className="report-module-top"><span className="report-module-icon"><Icon size={17}/></span><span className="report-module-index">0{index + 1}</span></div>
      <span className="section-kicker">{item.eyebrow}</span><h2>{item.title}</h2><p>{item.description}</p>
      <div className="report-module-metric"><strong>{item.value}</strong><span>{item.unit}</span></div>
      <div className="report-module-content">{item.content}</div>
    </article>; })}</section>
    {!loading && !error && data && !riskTotal && !data.controls.length && !data.inspections.length && !data.findings.length && !data.issues.length && <div className="report-empty-hint"><XCircle size={14}/> 当前公司还没有内控业务记录，创建业务流程并录入风险、控制和检查后，报告会自动生成统计。</div>}
  </div>;
}

function EmptyLine({ loading, text }: { loading: boolean; text: string }) {
  return <div className="report-empty-line">{loading ? <><LoaderCircle className="spin" size={12}/>正在汇总</> : text}</div>;
}
