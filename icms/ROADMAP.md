# 项目路线图

2026-10-03 按现有源码和配置校正。阶段状态区分“实现存在”和“验收通过”；本轮只整理本地文档，详细交接见 [TASKS](docs/TASKS.md)。

| 阶段 | 内容 | 当前状态 |
|---|---|---|
| PHASE 0 | 指定开源项目研究 | 已整理至 `docs/OPEN_SOURCE_RESEARCH.md` |
| PHASE 1 | 架构与领域文档 | 已完成第一版，须结合实现持续校正 |
| PHASE 2 | PostgreSQL、Redis、MinIO、FastAPI、Next.js 本地环境 | 已搭建，需本机启动验收 |
| PHASE 3 | 登录、RBAC 与组织隔离 | 已完成主路径，需验证多角色权限边界 |
| PHASE 4 | Organization、Department、Process | 已完成主要 API 和页面 |
| PHASE 5 | Risk、Control、RCM | 已完成主要 API 和页面 |
| PHASE 6 | Evidence、Inspection、Finding | 已完成上传/下载和主工作流页面 |
| PHASE 7 | Issue、Remediation、复核、重测和 Close | 已完成主路径，需整套数据验收 |
| PHASE 8 | Dashboard 与汇总 | 已从组织范围内数据库聚合 |
| PHASE 9 | Walkthrough、抽样与控制测试 | 后续本地阶段 |
| PHASE 10 | Audit、Investigation | 后续本地阶段 |
| PHASE 11 | AI Assistant | 已有助手、公司配置/额度及制度分析实现；实际服务商与权限路径需专项验收 |
| PHASE 12 | 本地完整测试与优化 | 核心验收通过前未完成 |
| PHASE 13 | Linux/云生产部署 | 已有独立 Compose、Docker/Nginx/TLS 和部署/健康检查脚本；当前现网状态需独立核验 |

PHASE 12 需验证的业务闭环、拒绝条件和阶段边界见 [详细路线图](docs/ROADMAP.md)。后续增加的 AI 和生产配置不代表 PHASE 12 已验收通过；本地与生产配置继续分开维护。
