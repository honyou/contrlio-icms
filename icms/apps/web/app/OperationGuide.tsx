"use client";

import { useEffect, useRef, useState } from "react";
import { BookOpen, ChevronDown, CircleHelp, X } from "lucide-react";
import { useI18n } from "./I18n";

type Copy = { zh: string; en: string };
const c = (zh: string, en: string): Copy => ({ zh, en });
type GuideField = { key: string; label: string; source?: string; required?: boolean; options?: [string, string][]; type?: string };
type Guide = { purpose: Copy; steps: Copy[]; parameters?: { label: Copy; meaning: Copy }[] };

const guides: Record<string, Guide> = {
  "organization-setup": {
    purpose: c("先建立当前登录账号所属的公司工作空间。", "Create the organization workspace for the signed-in account."),
    steps: [c("填写公司名称、唯一公司代码和所属行业。", "Enter the organization name, unique code, and industry."), c("可选行业阶段模板会建立可编辑的基础数据；检查仍是待执行状态。", "An optional maturity template creates editable baseline records; inspections remain unexecuted."), c("创建后你将成为公司经理，可从公司与成员菜单邀请团队。", "You become the organization manager and can invite teammates from Organizations & Members.")],
    parameters: [{ label: c("公司代码", "Organization code"), meaning: c("用于识别和检索公司的短代码，建议保持唯一、简短。", "A short identifier for the organization; keep it unique and concise.") }, { label: c("行业模板", "Industry template"), meaning: c("按行业和发展阶段导入流程、风险和控制样例，之后仍可修改。", "Imports editable process, risk, and control examples for the selected industry and maturity.") }],
  },
  dashboard: {
    purpose: c("查看当前公司的真实业务数据汇总；点击统计卡或快捷入口可进入对应清单。", "Review live organization metrics; select a stat card or shortcut to open its records."),
    steps: [c("点击业务流程、控制措施、检查发现或未关闭问题卡片，进入对应列表。", "Select Processes, Controls, Findings, or Open Issues to open that list."), c("点击问题整改进度进入 Issue 整改列表；已关闭比例按关闭数/Issue 总数计算。", "Select remediation progress to open Issues; the closed rate is closed issues divided by all issues."), c("下方快捷入口可直接创建或维护流程、风险、控制和检查。", "Use the shortcuts below to create or maintain processes, risks, controls, and inspections.")],
    parameters: [{ label: c("统计数字", "Metrics"), meaning: c("从当前公司的数据库记录聚合，不是示例值；点击后查看明细清单。", "Aggregated from this organization's database records, not sample values; select to see the list.") }, { label: c("数据更新时间", "Last updated"), meaning: c("显示仪表盘数据最近一次读取时间。", "Shows when the dashboard data was last loaded.") }],
  },
  "policy-review": {
    purpose: c("上传公司内部制度并与当前行业法规索引进行 AI 对照，形成带官方来源链接的风险与改进草案。", "Upload company policies and compare them with the current industry regulation index to draft risks and improvements with official source links."),
    steps: [c("选择 PDF、DOCX、TXT 或 Markdown 文件上传；原文件存入 MinIO，系统仅在分析时提取正文。", "Upload a PDF, DOCX, TXT, or Markdown file; the original is stored in MinIO and text is extracted only for analysis."), c("先在系统设置配置公司购买的 AI 服务商 Token，并确认该服务商的数据处理政策。", "Configure the company's AI provider token in Settings and review that provider's data handling policy."), c("勾选数据发送确认后启动分析；报告列出制度原文、风险、建议及法规索引来源。", "Confirm external processing before analysis; the report lists policy excerpts, risks, recommendations, and regulation-index sources."), c("通过报告中的官方链接核对现行法规全文，再由法务/内控负责人复核后修订制度。", "Verify current law text through official links, then have legal or internal-control owners review before changing policy.")],
    parameters: [{ label: c("正文字符数", "Extracted characters"), meaning: c("最多 60,000 字；不截断后半段，超限时请按制度拆分，避免只分析部分内容。", "Up to 60,000 characters; oversized files are rejected instead of silently truncating the text."), }, { label: c("法规依据", "Regulation references"), meaning: c("模型收到的是系统按行业筛选的法规索引摘要和官方链接，不是完整法规原文，也未实时联网检索。", "The model receives industry-filtered index summaries and official links, not full law text or live web research.") }, { label: c("外部 AI 确认", "External AI consent"), meaning: c("每次分析前需确认发送该制度全文和法规索引摘要到公司配置的 AI 服务商；其处理方式由服务商决定。", "Each analysis requires consent to send the full policy text and index summaries to the configured AI provider.") }, { label: c("分析额度", "AI token quota"), meaning: c("消耗当前成员本月 AI Token 配额；额度不足时按 AI 助手规则申请追加。", "Uses the member's monthly AI token quota; request more if the remaining allowance is insufficient.") }],
  },
  organizations: {
    purpose: c("创建、切换、停用或恢复公司工作空间，并管理公司成员入口。", "Create, switch, deactivate, or restore organization workspaces and access member management."),
    steps: [c("新建公司后，创建者自动成为公司经理。", "The creator becomes the organization manager."), c("删除公司会停用工作空间并保留业务记录；可由经理恢复。", "Deleting deactivates the workspace while retaining records; a manager can restore it."), c("点击查看成员进入成员与权限管理。", "Select View members to manage member access and roles.")],
    parameters: [{ label: c("公司代码", "Organization code"), meaning: c("公司识别代码，应在系统中保持唯一。", "Organization identifier; it should be unique in the system.") }, { label: c("行业", "Industry"), meaning: c("用于选择法规索引和行业流程参考，不会自动改变公司实际业务记录。", "Sets the industry reference for regulations and playbooks; it does not change actual business records.") }, { label: c("停用/恢复", "Deactivate / restore"), meaning: c("停用撤销成员的公司访问权但保留数据；恢复后可继续使用。", "Deactivation removes organization access but retains data; restore re-enables access.") }],
  },
  members: {
    purpose: c("为当前公司创建成员账号、设置角色，或撤销成员的公司访问权限。", "Create member accounts, assign roles, or remove organization access."),
    steps: [c("添加成员时填写姓名、邮箱和至少 12 位初始密码。", "When adding a member, enter their name, email, and an initial password of at least 12 characters."), c("移出成员只撤销其当前公司的权限，个人账号及历史业务记录保留。", "Removing a member revokes access to this organization while preserving the account and historical records."), c("公司经理分配角色；审计员负责独立检查，整改责任人处理整改，只读用户仅查看。", "Managers assign roles; auditors perform independent checks, owners handle remediation, and viewers have read-only access.")],
    parameters: [{ label: c("公司角色", "Organization role"), meaning: c("经理：公司管理；审计员：检查与复核；整改责任人：执行整改；只读查看者：查看记录。", "Manager: organization administration; auditor: testing and review; owner: remediation; viewer: read-only access.") }, { label: c("邮箱与密码", "Email and password"), meaning: c("邮箱用于登录识别；初始密码交由成员安全保管并按需修改。", "Email identifies the login; the member should securely retain and change the initial password as needed.") }],
  },
  departments: {
    purpose: c("先建立部门，再将业务流程归入对应责任部门。", "Create departments first, then assign processes to the responsible department."),
    steps: [c("按公司真实组织架构建立部门，避免同一部门重复建档。", "Create departments based on the actual organization structure and avoid duplicates."), c("在业务流程中选择所属部门，并维护流程负责人。", "Choose the department and process owner in each business process."), c("部门名称或职责变化时，编辑现有记录以保持关联稳定。", "Edit existing records when names or responsibilities change to preserve relationships.")],
  },
  "industry-library": {
    purpose: c("浏览行业制度、组织职责、工作方案、案例、流程、风险、控制和抽样参考。", "Browse industry policy, accountability, work plans, cases, process, risk, control, and sampling guidance."),
    steps: [c("选择行业和发展阶段，按顶部标签浏览对应内容。", "Choose an industry and maturity stage, then use the tabs to browse content."), c("应用样例会写入当前公司的数据库，后续可在各业务菜单中编辑。", "Applying a template writes baseline records to the current organization; edit them in the business menus."), c("样例检查保持待执行，不会伪造已完成的测试、Finding 或整改证据。", "Sample inspections remain unexecuted; the system does not fabricate test results, findings, or remediation evidence.")],
    parameters: [{ label: c("发展阶段", "Maturity stage"), meaning: c("用于选择相称的组织复杂度和控制实践，不代表评级或合规认证。", "Selects practices suited to organizational complexity; it is not a rating or compliance certification.") }, { label: c("应用样例", "Apply template"), meaning: c("创建可编辑的基础流程、风险、控制和检查任务；不会重复替代实际执行记录。", "Creates editable baseline processes, risks, controls, and inspection tasks; it does not replace actual execution records.") }],
  },
  "compliance-library": {
    purpose: c("按行业查询法规索引，并将合规关注点映射到公司的实际业务流程。", "Browse regulation references by industry and map compliance topics to actual organization processes."),
    steps: [c("选择行业后，在法规索引和流程风险与内控要点之间切换。", "Choose an industry and switch between the regulation index and process guidance."), c("使用关键词和类别筛选缩小范围；点击法规链接查看发布机构的原文。", "Filter by keyword or category and follow the link to the issuing authority's source text."), c("将模板流程与最接近的公司实际流程对照；法规适用性需结合所在地和业务确认。", "Compare template processes with actual processes; confirm applicability for your jurisdiction and business.")],
    parameters: [{ label: c("行业 / 类别 / 搜索", "Industry / category / search"), meaning: c("控制索引显示范围；搜索可匹配法规标题、义务、流程、风险和控制关注点。", "Filters the index; search covers regulation titles, obligations, processes, risks, and controls."), }, { label: c("关联公司流程", "Linked organization process"), meaning: c("用于对照模板与实际流程，选择本身不等于正式合规结论。", "Compares guidance with an actual process; selecting a link is not a formal compliance conclusion.") }],
  },
  "ai-assistant": {
    purpose: c("以对话方式获取现有流程整改建议或法规影响梳理；模型调用使用公司自行配置的服务商 Token。", "Use chat for process remediation or regulatory impact guidance with a provider token configured by the organization."),
    steps: [c("选择任务和业务流程，提出具体问题；可继续追问。", "Choose a task and process, ask a specific question, and follow up."), c("发送前阅读资料范围提示并确认；流程关联数据会发送给所配置的第三方模型。", "Review the data disclosure and confirm before sending; linked process data is sent to the configured third-party model."), c("回答仅为建议草案，不会自动修改台账；模型设置在系统设置菜单中。", "Responses are draft guidance and do not change records; configure the model under Settings.")],
    parameters: [{ label: c("任务类型", "Task type"), meaning: c("现有流程整改建议读取当前风险、控制、检查和整改记录；法规分析结合索引及你提供的材料。", "Process guidance uses current risk, control, testing, and remediation records; regulatory analysis uses the index and supplied source material.") }, { label: c("资料确认", "Data consent"), meaning: c("确认后才会向服务商发送本次分析必要的数据；Evidence 文件内容不会发送。", "Only after confirmation is necessary analysis data sent to the provider; Evidence file contents are not sent.") }],
  },
  processes: {
    purpose: c("以流程为中心维护基本信息、控制目标、风险控制关系、制度依据和流程配置，并保留发布版本。", "Maintain process details, control objectives, risk-control links, policy basis, and workflow configuration in one place."),
    steps: [c("打开清单中的“流程详情”，先维护流程基本信息和控制目标。", "Open Configure Process to review process details and maintain its objectives."), c("在“控制目标”页先关联风险，再在“风险与控制”页连接控制措施；风险控制矩阵会自动汇总完整关系。", "Link risks to objectives first, then connect controls under Risks & Controls; the RCM is generated from these relationships."), c("在“关联制度/依据”页引用制度库中已有文件，不会复制制度正文。", "Link existing policy files under Policies & Basis; this does not copy policy content."), c("按需配置办理表单、步骤和审批规则；发布版本会保留配置快照。", "Configure forms, steps, and approvals as needed; published workflow versions are retained.")],
    parameters: [{ label: c("配置状态", "Configuration status"), meaning: c("待配置表示还没有步骤；草稿可继续编辑；已发布可查看历史版本；有未发布修改表示草稿已更新。", "Unconfigured has no steps; drafts remain editable; published versions have history; unpublished changes indicate an updated draft.") }, { label: c("审批与分支", "Approvals and branches"), meaning: c("审批可设置任一人、全员或顺序审批；条件分支使用办理表单字段并指向后续步骤。", "Approvals support any, all, or sequential approvers. Branches use form fields and target subsequent steps.") }, { label: c("保存与发布", "Save and publish"), meaning: c("保存允许逐步完善草稿；发布形成完整流程设计快照，不会自动发起业务审批或发送通知。", "Saving supports incremental drafting. Publishing creates a complete design snapshot; it does not start business approvals or send notifications.") }],
  },
  risks: {
    purpose: c("全局管理企业内控风险，集中查看流程、等级、责任、控制覆盖、核查安排和剩余风险。", "Manage the enterprise risk register with process, rating, ownership, control coverage, verification, and residual risk."),
    steps: [c("在风险库查看全部风险及责任部门、责任人和关联控制数量。", "Review risks, owners, departments, and linked-control counts in the risk library."), c("点击风险名称可查看控制目标、控制措施、核查手段、证据要求和剩余风险。", "Open a risk to review objectives, controls, verification, evidence, and residual risk."), c("在业务流程详情中分别维护风险与流程、风险与控制目标的关系；风险与控制措施的映射在同一处维护。", "Maintain process, risk-objective, and risk-control relationships in process details."), c("行业参考模板只用于对照；带入填写表单后仍需用户确认并保存。", "Industry templates are reference only; users must review and save any prefilled risk.")],
    parameters: [{ label: c("一级菜单", "First level"), meaning: c("按实际业务流程列出风险点和重要等级；流程没有风险时明确显示尚未填写。", "Lists risk points and importance levels under actual business processes; empty processes are explicitly marked as not filled.") }, { label: c("二级详情", "Second-level details"), meaning: c("风险详情展示已关联控制目标和控制措施；责任人、核查手段、证据及剩余风险评分也可一并查看。", "Risk details show linked objectives and controls, as well as ownership, verification, evidence, and residual ratings.") }, { label: c("行业参考", "Industry reference"), meaning: c("模板提供流程、风险描述和核查方式的参考；带入表单后仍需用户补充、修改并确认保存。", "Templates provide reference process, risk, and verification content; users must complete, adjust, and confirm before saving.") }, { label: c("风险等级", "Risk level"), meaning: c("可能性 × 影响，各为 1–5 分；1–4 低、5–9 中、10–16 高、17–25 重大。", "Likelihood × impact, each from 1–5: 1–4 low, 5–9 medium, 10–16 high, 17–25 critical.") }],
  },
  "control-objectives": {
    purpose: c("明确风险控制后要保障的管理结果，作为控制设计的依据。", "Define the outcome controls should achieve to address a risk."),
    steps: [c("选择目标覆盖的流程，按可判断的结果命名控制目标。", "Choose the covered process and describe an observable control outcome."), c("在说明中补充范围、判断标准或责任边界。", "Add scope, evaluation criteria, or accountability in the description."), c("创建控制措施时关联该目标。", "Link controls to this objective when you create them.")],
  },
  controls: {
    purpose: c("集中管理控制措施，并查看所属流程、控制目标、关联风险、责任、频率、方式和关键控制标记。", "Manage controls and review their process, objective, risks, ownership, cadence, mode, and key-control status."),
    steps: [c("控制目标在业务流程详情中维护；建立控制措施时选择所属流程和目标。", "Maintain objectives in process details, then select the process and objective for each control."), c("选择与实际运行一致的控制类型、频率和执行方式，并指定控制责任人。", "Choose the type, cadence, and mode that match actual operation, and assign an owner."), c("在业务流程详情中关联风险；风险控制矩阵会自动展示这些关系。", "Link risks in process details; the RCM displays the resulting relationships automatically.")],
  },
  rcms: {
    purpose: c("基于已维护关系汇总业务流程、控制目标、风险和控制措施，并检查覆盖完整性。", "Summarize processes, objectives, risks, and controls from existing links and check coverage."),
    steps: [c("在业务流程详情中的“风险与控制”页维护关系。", "Maintain relationships in the process details under Risks & Controls."), c("矩阵自动显示控制责任人、频率、关键控制和风险等级。", "The matrix automatically displays owners, cadence, key-control status, and risk level."), c("查看完整性检查并返回流程详情补齐缺失关系或责任信息。", "Review integrity checks and return to process details to fill gaps.")],
    parameters: [{ label: c("完整性检查", "Completeness checks"), meaning: c("检查风险无控制、控制缺责任人、关键控制无频率、目标无风险及高风险无关键控制。", "Flags risks without controls, controls without owners, key controls without cadence, objectives without risks, and high risks without key controls.") }],
  },
  inspections: {
    purpose: c("建立覆盖特定流程和期间的内控检查，并按步骤推进执行状态。", "Create an inspection for a process and period, then move it through its execution states."),
    steps: [c("选取流程、检查负责人和期间，创建后处于计划中。", "Select a process, lead, and period; new inspections begin as planned."), c("将状态改为进行中，并在检查执行项中记录测试和结论。", "Move it to in progress and record test steps and results in Inspection Tests."), c("所有执行项不再是未测试后，才可标记完成。", "Mark it completed only after every test item has a recorded result.")],
    parameters: [{ label: c("检查期间", "Inspection period"), meaning: c("结束日期不能早于开始日期；范围需符合测试目标。", "The end date must not precede the start date; align the period with test objectives.") }, { label: c("检查状态", "Inspection status"), meaning: c("只能按计划中 → 进行中 → 已完成推进；完成前系统会检查未测试项。", "Moves planned → in progress → completed; the system blocks completion while tests remain untested.") }],
  },
  "inspection-tests": {
    purpose: c("把检查程序落实为可追踪的测试项，记录执行人、样本、步骤和结论。", "Track each inspection test with its tester, sample, procedure, and result."),
    steps: [c("选择检查任务和同流程的 RCM，指定实际测试人员。", "Select an inspection and same-process RCM, then assign the actual tester."), c("填写总体来源、抽样方法、样本标识和测试程序。", "Record population source, sampling method, sample identifiers, and procedure."), c("完成测试后记录通过、未通过、需改进或不适用；未通过/需改进可创建 Finding。", "Record pass, fail, needs improvement, or not applicable; failed tests can produce a Finding.")],
    parameters: [{ label: c("未测试", "Not tested"), meaning: c("新建执行项默认未测试；有结论后再更新，不能把默认值误当成测试通过。", "New tests default to not tested; record an actual result before treating the test as complete.") }, { label: c("样本说明", "Sample description"), meaning: c("记录总体、期间、抽样方法、样本量与可复核标识。", "Capture population, period, method, sample size, and identifiers for review.") }],
  },
  findings: {
    purpose: c("把控制测试偏差记录为事实性发现，说明依据、根因、影响和建议。", "Record a control-test exception with its criteria, cause, impact, and recommendation."),
    steps: [c("仅从未通过或需改进的检查项创建 Finding。", "Create a Finding only from a failed or needs-improvement test."), c("区分实际观察事实与制度/控制标准，并说明样本和期间。", "Separate observed facts from criteria and identify sample and period."), c("评估严重程度并提出建议；确认后可转换为 Issue 进入整改闭环。", "Rate severity and recommend action; convert it to an Issue to start remediation.")],
    parameters: [{ label: c("实际情况 / 控制要求", "Condition / criteria"), meaning: c("实际情况写证据支持的观察结果；控制要求引用应遵循的制度或控制标准。", "Condition describes evidence-backed observations; criteria cites the applicable policy or control."), }, { label: c("严重程度", "Severity"), meaning: c("结合影响和可能性判断，并保留评估理由供复核。", "Assess based on impact and likelihood, retaining rationale for review.") }],
  },
  evidence: {
    purpose: c("上传、索引和下载控制检查或整改所需的真实证据文件。", "Upload, index, and download actual evidence for control testing or remediation."),
    steps: [c("先选择关联的 RCM，或在 Issue 整改计划中上传整改证据。", "Choose an RCM or upload remediation evidence from an Issue plan."), c("选择文件后会把文件内容上传到 MinIO，并将元数据和校验摘要写入数据库。", "The file is uploaded to MinIO; metadata and its checksum are stored in the database."), c("上传前确认文件对应期间、流程和控制，并避免提交不必要的敏感资料。", "Confirm the period, process, and control before upload, and avoid unnecessary sensitive data.")],
    parameters: [{ label: c("业务关联", "Business link"), meaning: c("RCM 关联控制运行证据；整改计划关联整改完成证据。", "RCM links evidence to control operation; a remediation plan links evidence to corrective action.") }, { label: c("SHA-256", "SHA-256"), meaning: c("文件内容校验值，用于识别下载文件是否与上传版本一致。", "A content checksum used to verify that a downloaded file matches the uploaded version.") }, { label: c("文件大小", "File size"), meaning: c("当前上传上限为单个文件 20 MB。", "The current upload limit is 20 MB per file.") }],
  },
  issues: {
    purpose: c("把检查发现转成有责任人、期限、证据、独立复核和重测记录的问题整改闭环。", "Track findings through ownership, deadlines, evidence, independent review, and retesting."),
    steps: [c("先从未通过的 Finding 转为 Issue，再分配责任人并记录根因、措施和期限。", "Convert a failed Finding to an Issue, then assign an owner and record cause, action, and due date."), c("责任人完成整改并上传证据后提交复核；复核人不能与责任人为同一人。", "The owner uploads evidence and submits for review; the reviewer must be a different person."), c("复核通过后执行重测；重测通过才能关闭，未通过则退回继续整改。", "Retest after review; close only after a passing retest. Failed review or retest returns the Issue for remediation.")],
    parameters: [{ label: c("状态", "Status"), meaning: c("待分配 → 整改中 → 等待复核 → 待重测 → 待关闭 → 已关闭；退回会重新进入整改中。", "Open → In progress → In review → Verified for retest → Retested → Closed; a return sends it back to In progress.") }, { label: c("根因 / 措施 / 期限", "Root cause / action / due date"), meaning: c("记录问题成因、可执行的修复动作和目标完成日期，便于跟踪逾期。", "Record why the issue occurred, the corrective action, and its target completion date." ) }, { label: c("复核与重测", "Review and retest"), meaning: c("复核证据与整改设计；重测验证控制在后续样本中是否持续有效。", "Review evidence and design; retesting checks whether the control remains effective on later samples.") }],
  },
  settings: {
    purpose: c("设置浏览器界面偏好、AI 服务连接和成员 Token 月度额度。", "Set browser preferences, the AI provider connection, and member token quotas."),
    steps: [c("语言和主题偏好保存在当前浏览器；业务记录原文不会被翻译。", "Language and theme preferences are saved in this browser; business records stay in their original language."), c("公司经理配置服务商 Token；普通成员默认每人每月 2,000,000 tokens，系统管理员不限额，经理可以调整普通成员额度。", "A company manager configures the provider token. Ordinary members receive 2,000,000 tokens per month by default; system administrators are unlimited, and managers can adjust ordinary members' quotas."), c("AI 对话按服务商用量记账；达到额度后成员可申请追加，经理审批后额度仅在本月有效。", "Assistant calls are tracked using provider usage. Members can request more at the limit; manager-approved tokens expire at month end.")],
    parameters: [{ label: c("个人月额度", "Member monthly quota"), meaning: c("经理设置成员每个自然月的基础 token 上限；0 表示没有基础额度，仍可通过审批获得追加额度。", "The manager sets a member's base allowance per calendar month; 0 gives no base tokens, but approved extra tokens can still be used.") }, { label: c("已用 / 剩余", "Used / remaining"), meaning: c("优先使用服务商返回的输入和输出 token 数；服务商未提供时以字符长度保守估算。", "Uses provider-reported input/output tokens when available; otherwise estimates conservatively from text length.") }, { label: c("追加申请", "Extra quota request"), meaning: c("成员提交用途和申请数量；经理可批准全部、部分或驳回。追加额度于自然月结束时失效。", "Members provide a reason and amount; managers can approve all, some, or none. Extra tokens expire at month end.") }, { label: c("API Token", "API token"), meaning: c("由公司自行采购和维护；系统不会向其他公司成员展示已保存的 Token。", "Purchased and maintained by the organization; saved tokens are not shown to other members.") }],
  },
};

const fieldMeanings: Record<string, Record<string, Copy>> = {
  departments: { code: c("部门唯一编号，用于检索和其他记录关联。", "Unique department code for lookup and record relationships."), name: c("公司的正式部门名称。", "The department's formal name."), parent_id: c("上级部门；用于表达组织层级，不能选择自身或下级部门。", "Parent department for hierarchy; a department cannot select itself or a descendant."), manager_user_id: c("对部门职责和组织信息负责的公司成员。", "Organization member accountable for the department."), description: c("概述部门职责和管理边界。", "Summarize department responsibilities and scope.") },
  processes: { code: c("业务流程唯一编号，便于跟踪和审计引用。", "Unique process code for tracking and audit references."), name: c("流程名称，建议使用清晰的动宾表达。", "Process name; use a clear action-oriented phrase."), department_id: c("该流程归属的责任部门。", "The department accountable for this process."), owner_user_id: c("对流程设计、运行和改进负责的成员。", "Member accountable for process design, operation, and improvement."), description: c("说明流程边界、主要步骤及涉及的系统或岗位。", "Describe process scope, key steps, systems, or roles.") },
  risks: { code: c("风险唯一编号，便于引用和整改追踪。", "Unique risk code for references and remediation tracking."), name: c("简洁描述可能发生的风险事件。", "Concise name for a possible risk event."), process_id: c("风险所属的实际业务流程。", "The actual process associated with the risk."), description: c("说明风险成因、触发条件和可能后果。", "Describe causes, triggers, and potential consequences."), likelihood: c("发生可能性评分 1–5；数值越高表示越可能发生。", "Likelihood score from 1–5; higher means more likely."), impact: c("影响程度评分 1–5；数值越高表示影响越大。", "Impact score from 1–5; higher means greater impact."), owner_user_id: c("负责监控并推动该风险应对的成员。", "Member responsible for monitoring and responding to the risk."), status: c("跟踪风险处置状态；选“已接受”应有授权和留存理由。", "Tracks the response; acceptance should have documented authorization and rationale.") },
  "control-objectives": { code: c("控制目标唯一编号。", "Unique control objective code."), name: c("描述控制需要保障的结果。", "Describe the outcome the control must achieve."), process_id: c("该控制目标覆盖的业务流程。", "The process covered by this control objective."), description: c("补充目标范围、判断标准或约束。", "Add scope, evaluation criteria, or constraints.") },
  controls: { code: c("控制措施唯一编号。", "Unique control code."), name: c("可识别的一项控制活动名称。", "Name of the identifiable control activity."), process_id: c("控制实际运行的业务流程。", "The process where the control operates."), objective_id: c("该措施支持实现的控制目标。", "The objective supported by this control."), description: c("说明执行人、复核人、输入、操作和异常处理。", "Describe operator, reviewer, inputs, actions, and exception handling."), control_type: c("预防性降低错误发生；检查性发现偏差；纠正性处理已发现问题。", "Preventive controls reduce errors; detective controls identify deviations; corrective controls resolve them."), frequency: c("控制实际执行周期，应与检查期间和抽样设计一致。", "Actual control cadence; align it with the testing period and sample design."), execution_mode: c("说明控制依赖人工、自动化系统或两者结合。", "Indicates whether the control is manual, automated, or hybrid."), owner_user_id: c("负责执行或维护该控制的成员。", "Member responsible for performing or maintaining the control."), is_key_control: c("标记该控制是否对降低重大风险或实现关键目标不可替代。", "Mark whether this control is critical to reducing a material risk or achieving a key objective."), is_active: c("停用后不计入有效控制覆盖。", "Inactive controls are excluded from active control coverage.") },
  rcms: { process_id: c("由风险、控制和流程的现有关联自动汇总。", "Generated from existing process, risk, and control relationships."), risk_id: c("风险控制关系在业务流程详情中维护。", "Maintain risk-control relationships under process details."), control_id: c("控制目标由所关联控制措施继承。", "The objective is inherited from the linked control."), assertion: c("旧映射中的断言只供参考，新的目标名称来自控制目标记录。", "Legacy assertions remain reference data; objective names come from objective records."), test_procedure: c("旧映射中的测试程序可供检查团队参考。", "Legacy test procedures remain available to inspection teams.") },
  inspections: { code: c("检查任务唯一编号。", "Unique inspection identifier."), name: c("本次检查的主题或范围名称。", "Name of the inspection topic or scope."), process_id: c("本次检查覆盖的流程。", "Process covered by this inspection."), period_start: c("纳入检查的期间起始日。", "First day in the inspection period."), period_end: c("纳入检查的期间结束日。", "Last day in the inspection period."), lead_user_id: c("负责组织检查、记录结论的负责人。", "Lead responsible for organizing and documenting the inspection."), status: c("按计划中、进行中和已完成推进；有未测试执行项时不能完成检查。", "Moves through planned, in progress, and completed; untested items block completion.") },
  "inspection-tests": { inspection_id: c("该测试所属的检查任务。", "Inspection task containing this test."), rcm_id: c("本测试要验证的风险控制映射。", "Risk-control mapping being tested."), tester_user_id: c("实际执行测试并留存底稿的公司成员。", "Organization member who performs the test and retains workpapers."), procedure: c("说明测试步骤、判断标准和取证方式。", "Describe test steps, evaluation criteria, and evidence method."), result: c("记录该样本或控制测试的实际结论；新建时默认未测试。", "Record the actual result; a new test defaults to not tested."), sample_description: c("记录总体来源、抽样方法、样本量和样本标识。", "Record population source, sampling method, sample size, and identifiers."), notes: c("记录观察事实、差异、解释和证据位置。", "Record observations, exceptions, explanations, and evidence references.") },
  findings: { inspection_test_id: c("产生该发现的检查执行项。", "Test item that produced this finding."), title: c("用简短、事实化标题概括问题。", "A concise, factual title for the issue."), condition: c("描述实际观察到的事实、期间和样本。", "Describe observed facts, period, and sample."), criteria: c("引用应遵循的制度、控制要求或法规依据。", "Cite the policy, control requirement, or regulation."), root_cause: c("分析问题产生的根本原因，不只重述现象。", "Identify the underlying cause rather than restating the symptom."), impact: c("说明问题可能造成的财务、运营、合规或声誉影响。", "Describe possible financial, operational, compliance, or reputational impact."), recommendation: c("给出可执行的改进方向。", "Provide a practical improvement recommendation."), severity: c("按影响和发生可能性评估严重程度。", "Rate severity based on impact and likelihood.") },
};

function getGuide(pageId: string): Guide {
  return guides[pageId] || guides.dashboard;
}

const optionLabelsEn: Record<string, string> = {
  preventive: "Preventive", detective: "Detective", corrective: "Corrective", continuous: "Continuous", daily: "Daily", weekly: "Weekly", monthly: "Monthly", quarterly: "Quarterly", annual: "Annual", ad_hoc: "As needed", manual: "Manual", automated: "Automated", hybrid: "Hybrid", pass: "Pass", fail: "Fail", needs_improvement: "Needs improvement", not_applicable: "Not applicable", low: "Low", medium: "Medium", high: "High", critical: "Critical", active: "Active", accepted: "Accepted", mitigating: "Mitigating", closed: "Closed", planned: "Planned", in_progress: "In progress", completed: "Completed", not_tested: "Not tested",
};

function meaningFor(pageId: string, field: GuideField): Copy {
  const specific = fieldMeanings[pageId]?.[field.key];
  const base = specific || (field.source
    ? c("从当前公司的已有记录中选择关联项，避免手工填写无效编号。", "Select an existing record from this organization to maintain a valid relationship.")
    : field.type === "textarea"
      ? c("补充相关事实、范围、执行步骤或判断依据。", "Add relevant facts, scope, execution steps, or evaluation basis.")
      : c("填写该记录的识别信息；保存后会关联到当前公司。", "Identifies this record; it will be associated with the current organization."));
  if (!field.options?.length) return base;
  const optionsZh = field.options.map(([, label]) => label).join("、");
  const optionsEn = field.options.map(([value]) => optionLabelsEn[value] || value).join(", ");
  return c(`${base.zh} 可选值：${optionsZh}。`, `${base.en} Options: ${optionsEn}.`);
}

export default function OperationGuideButton({ pageId, pageTitle, fields = [] }: { pageId: string; pageTitle: string; fields?: GuideField[] }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const { locale } = useI18n();
  const isEnglish = locale === "en-US";
  const guide = getGuide(pageId);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => { document.removeEventListener("pointerdown", onPointerDown); document.removeEventListener("keydown", onKeyDown); };
  }, [open]);

  return <div className="operation-guide" ref={root}>
    <button type="button" className="operation-guide-trigger" aria-expanded={open} aria-haspopup="dialog" aria-controls="operation-guide-panel" onClick={() => setOpen(value => !value)}><CircleHelp size={15}/><span>{isEnglish ? "Guide" : "操作指南"}</span><ChevronDown size={13} className={open ? "guide-chevron open" : "guide-chevron"}/></button>
    {open && <section className="operation-guide-panel" id="operation-guide-panel" role="dialog" aria-label={isEnglish ? `Operation guide: ${pageTitle}` : `${pageTitle}操作指南`}>
      <div className="operation-guide-head"><span className="guide-book-icon"><BookOpen size={16}/></span><div><small>{isEnglish ? "QUICK GUIDE" : "QUICK GUIDE · 快速说明"}</small><h2>{pageTitle}</h2></div><button type="button" className="guide-close" aria-label={isEnglish ? "Close guide" : "关闭操作指南"} onClick={() => setOpen(false)}><X size={15}/></button></div>
      <p className="operation-guide-purpose">{isEnglish ? guide.purpose.en : guide.purpose.zh}</p>
      <div className="operation-guide-section"><b>{isEnglish ? "How to use" : "操作步骤"}</b><ol>{guide.steps.map((step, index) => <li key={index}>{isEnglish ? step.en : step.zh}</li>)}</ol></div>
      {(guide.parameters?.length || fields.length) ? <div className="operation-guide-section guide-parameters"><b>{isEnglish ? "Parameter meanings" : "参数说明"}</b><dl>
        {fields.map(field => { const meaning = meaningFor(pageId, field); return <div key={field.key}><dt>{field.label}{field.required && <em>{isEnglish ? "Required" : "必填"}</em>}</dt><dd>{isEnglish ? meaning.en : meaning.zh}</dd></div>; })}
        {guide.parameters?.map((item, index) => <div key={`${item.label.zh}-${index}`}><dt>{isEnglish ? item.label.en : item.label.zh}</dt><dd>{isEnglish ? item.meaning.en : item.meaning.zh}</dd></div>)}
      </dl></div> : null}
      <div className="operation-guide-foot">{isEnglish ? "Guide copy is informational; follow your organization's approved policies and role permissions." : "本指引用于帮助理解页面；实际操作仍应遵循公司已批准制度和角色权限。"}</div>
    </section>}
  </div>;
}
