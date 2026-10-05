# 路线图

状态约定：文档、实现、测试、验收须分别记录；代码存在不表示阶段验收通过。

2026-10-03 校正：下表保留阶段与完成标准。当前代码已经包含可选 AI 和独立生产配置，原“生产后置”的计划不应解释为这些文件尚不存在；实际状态以 [TASKS](TASKS.md) 和 [项目上下文](PROJECT_CONTEXT.md) 为准。

| 阶段 | 工作 | 完成标准 |
|---|---|---|
| PHASE 0 | 开源项目研究 | 研究四个指定仓库，记录领域借鉴与许可证边界。 |
| PHASE 1 | 产品与架构 | 需求、架构、领域、ERD、RBAC、路线图文档评审通过。 |
| PHASE 2 | 本地开发环境 | Compose 基础设施健康；FastAPI、Next.js 可本机启动；迁移和 Bootstrap 成功。 |
| PHASE 3 | Authentication + RBAC | 登录/登出、公司成员角色、服务端组织隔离、关键写入审计。 |
| PHASE 4 | Organization + Department + Process | 页面和 API 可真实建立、查询、修改公司/部门/流程。 |
| PHASE 5 | Risk + Control + RCM | 同公司同流程的风险、目标、措施与 RCM，可 CRUD 且验证关系。 |
| PHASE 6 | Evidence + Inspection | MinIO 文件上传/下载带哈希；检查执行与发现真实入库。 |
| PHASE 7 | Finding + Issue + Remediation | Finding 转 Issue、分派责任人、版本提交、复核、重测、关闭状态机工作。 |
| PHASE 8 | Dashboard + Reports | 统计从当前组织数据库实时聚合；用业务流产生的记录核对结果。 |
| PHASE 9 | Walkthrough + Sampling + Testing | 设计 walkthrough、样本抽取和控制测试；规则可配置、证据链可追溯。 |
| PHASE 10 | Audit + Investigation | 审计项目、调查记录、工作底稿与独立复核历史。 |
| PHASE 11 | AI Assistant | 可选 AI 服务；无配置时关闭；建议内容需用户确认才写入业务记录。 |
| PHASE 12 | 本地完整测试和优化 | 在 macOS 本地完成端到端验收、拒绝用例、性能和恢复检查。 |
| PHASE 13 | 生产部署 | 独立 Linux/Docker/Nginx/TLS 配置、备份恢复和监控；具体发布需核对版本、迁移、健康及目标业务功能，不替代 PHASE 12 验收。 |

## PHASE 12 核心验收路径

管理员登录 → 建公司、部门、流程、风险、控制目标、措施及 RCM → 上传 RCM Evidence → 建检查并记录失败 → 形成 Finding 并转换 Issue → 分配独立责任人 → 建整改计划并上传实际 MinIO 文件 → 责任人提交 → 审计员复核 → 审计员重测 → 关闭 → Dashboard 即时统计关闭数增加、未关闭数减少。

## 明确约束

- PHASE 0–8 为原第一版核心；Walkthrough、自动抽样平台、审计调查和完整优化继续按实际需求安排，不能把已有检查项等同于后续独立模块完成。
- 可选 AI、Docker/Nginx/TLS 和健康检查已有代码/配置；高可用、CDN、Kubernetes 与备份恢复验收没有本轮完成证据。
- 生产部署必须独立配置，不得改变本地 Compose 开发路径。
- 本轮按用户要求先完成本地协作整理，不执行外部同步或生产操作；后续发布与 GitHub 连接分别安排。
