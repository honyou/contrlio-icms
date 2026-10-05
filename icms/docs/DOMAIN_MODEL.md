# 领域模型

## 建模原则

1. 公司作为全部核心业务数据的租户边界；业务行显式携带 `organization_id`。服务端从认证用户成员关系构造查询范围。
2. 流程、风险、控制目标和措施构成一张可关联的 RCM，而非自由文本快照。风险与控制被关联时必须属于同公司同流程。
3. 检查项执行一个 RCM 的设计/运行检验，形成 Finding；Finding 经显式转换形成 Issue。一个 Finding 最多一个 Issue。
4. 业务证据的 MinIO 对象和 PostgreSQL 元数据一起提供可审计引用。元数据含 SHA-256 校验值。
5. Issue 状态只能由工作流操作改变；整改提交、复核、重测记录不可覆盖，重试留存历史。

## 主要实体

| 实体 | 主要关系和职责 |
|---|---|
| User | 登录身份、密码哈希、启用状态和认证版本；重置密码后旧会话失效。 |
| OrganizationMembership | 用户在一个公司的唯一成员记录及角色；公司内账号可被分配整改。 |
| Organization | 公司，租户范围。 |
| Department | 隶属公司，可有上级部门。 |
| Process | 隶属公司和部门，描述需纳入内控的业务流程。 |
| Risk | 隶属公司和流程，包含场景、影响、可能性、固有/剩余等级及负责人。 |
| ControlObjective | 隶属公司和流程，表示需要实现的目标。 |
| Control | 隶属公司、流程和控制目标，包含执行方式、频率、责任人。 |
| RCM | 公司 + 流程 + 风险 + 控制的映射；流程由风险和控制共同校验。 |
| Inspection | 一次检查活动，关联公司、流程、期间和负责人。 |
| InspectionTest | 检查活动内的一项 RCM 检验，保存测试程序、结果、样本说明、备注与执行人。 |
| Finding | 来自一次失败/异常检查项，包含条件、准则、原因、影响、等级及建议。 |
| Issue | 从 Finding 转换的跟踪问题，保存状态及优先级；每个 Finding 唯一对应一个。 |
| RemediationPlan | 每个 Issue 一份当前计划，含责任人、根因、行动、期限。 |
| RemediationSubmission | 每一轮不可变整改提交，递增版本；提交时快照根因、行动计划和期限，相关证据与其版本绑定。 |
| ReviewRecord | 对一个提交版本的独立通过/退回结论、意见、操作人和时间。 |
| RetestRecord | 对同一提交版本进行的独立复测结论、证据/意见、操作人和时间。 |
| Evidence | MinIO 实际对象及其文件元数据；支持关联 RCM、未提交整改计划，或已提交修订版本，始终且仅一个业务 FK。 |
| PolicyDocument | 公司内部制度原件的 MinIO 对象引用、文件哈希和正文字符数；提取正文不持久化到 PostgreSQL。 |
| PolicyAnalysis | 对一份 PolicyDocument 的不可覆盖 AI 分析版本，保存结构化风险建议、经校验的法规引用、分析人、服务商、模型和 Token 用量。 |
| AuditEvent | actor、组织、动作、实体 ID、前后差异和时间；不可由普通用户更新或删除。 |

## 字段与约束

- 主键使用 UUID；时间使用带时区 UTC 时间；金额和数值避免文本编码。
- 部门号、流程编号、风险编号、控制编号、问题编号在公司内唯一。
- 风险可能性/影响使用有界整数刻度；风险等级由输入值计算或显式复核，页面展示其解释字段。
- 控制频率取 `continuous/daily/weekly/monthly/quarterly/annual/ad_hoc`；检查结果取 `not_tested/pass/fail/needs_improvement/not_applicable`。
- Issue 状态取 `open/in_progress/in_review/verified/retested/closed`。
- 提交序号在同一 RemediationPlan 内唯一。审核和重测各一条记录绑定一个 Submission；失败历史不会被覆盖。
- 关闭必须引用当前整改版本的通过重测。任何整改计划或证据变化均不能悄悄修改已提交版本。
- Evidence 接受有上限的文件字节；服务端校验组织授权、内容类型、扩展名和大小，使用随机对象键；文件名仅作展示文本。
- 制度文件只支持 PDF、DOCX、TXT、Markdown；正文最多 60,000 字符，不做静默截断，扫描版 PDF 需先 OCR 后上传。
- 公司经理/内控审计员可上传并分析制度；调用模型前逐次确认外传正文。额度不足沿用现有 AI Token 配额申请流程。
- PolicyAnalysis 的法规 ID 仅允许来自本次传入的行业法规索引，并由服务端解析官方链接；报告明确标注索引摘要不是法规全文或实时法律核验。

## 工作流不变量

- Issue 从 Finding 创建时采用事务及唯一约束，重试不会创建重复 Issue。
- 仅当前责任人可创建整改提交；提交时必须有整改说明和至少一个已成功保存的 MinIO Evidence。
- `in_review/verified/retested/closed` 状态冻结计划及本轮证据；复核/重测失败后回到 `in_progress` 才能建立下一版本。
- Reviewer 与 Retester 必须是当前公司授权的审计员/经理，且都不能是该计划责任人；责任人不得关闭本人 Issue。
- Review 与 Retest 一旦记录不可修改；重测必须建立在当前版本通过复核之后，关闭只允许经理/审计员执行。
- 删除有后代或审计记录的记录使用停用标识，不做级联硬删除。
