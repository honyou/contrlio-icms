# 开源项目研究

研究日期：2026-09-30。只研究公开仓库说明、项目结构与可访问的源码目录；研究用于提取领域与工程经验，不复制实现代码。README 与仓库根目录不是行为正确性的证明，具体版本和功能上线时仍需检查对应源文件。

## 1. intuitem/ciso-assistant-community

- 仓库：[GitHub](https://github.com/intuitem/ciso-assistant-community)，本次源码检视基线 `81b2b15…`（来源：本次固定 commit 的研究记录）；项目许可证为 AGPL-3.0（仓库列出 `LICENSE-AGPL.txt`、`LICENSE.md`）。
- 项目结构可见 `backend/`、`frontend/`、`docker-compose.yml`。README 将产品描述为 API-first，并强调复用、对象互联、风险及整改跟踪；快速启动脚本面向 Docker Compose。README 的“decoupling”说明将控制实施与合规评估分离，允许多个框架复用同一实现。
- 对 ICMS 的启示：RCM 连接流程/风险/控制，控制定义可复用；组织范围与业务关系须明确；本地环境以 Compose 启动有实际先例。
- 许可边界：只采用上述抽象概念，不复制 AGPL 源码、文本、界面或内置框架内容。

## 2. getprobo/probo

- 仓库：[GitHub](https://github.com/getprobo/probo)，本次在 `main` 分支检查（未锁定 commit）；仓库声明 MIT 许可。[README](https://github.com/getprobo/probo#readme) 描述自托管 GRC，涵盖风险、控制、审计、发现、证据，并提到策略 RBAC、不可变审计日志、审批与 evidence chain。README 列出 Go/PostgreSQL、GraphQL/MCP、React/TypeScript 技术栈，开发步骤先启基础容器栈、再生成本地配置和运行服务。
- 对 ICMS 的启示：以 API 合约贯穿 UI 和持久化；证据要有来源链；操作日志和审批是业务记录；开发文档要将依赖服务启动与应用调试分开。
- 许可边界：只借鉴产品能力与本地开发流程，不复制 MIT 源文件或依赖 Probo 实现其业务行为。

## 3. xactasolutionsai/grc

- 仓库：[GitHub](https://github.com/xactasolutionsai/grc)，本次检查 `main` README（未锁定 commit）。README 明确声明它是 CISO Assistant 的 fork，并称分发仍遵循 AGPL-3.0；其结构有 `backend/`、`frontend/`、`documentation/`、`tests/` 和 Compose 文件。
- README 描述审计范围与计划、Checklist 执行、工作底稿文件、审批历史及 Dashboard；技术栈是 Django REST、SvelteKit、PostgreSQL 可选以及本地文件或 S3-compatible 存储。项目允许 macOS/Linux 本地应用调试，并分别提供 Compose 启动和 backend/frontend 的开发运行说明。
- 对 ICMS 的启示：检查任务、现场测试与工作底稿应围绕同一条审计上下文关联；保留审核历史；把本地应用运行与基础设施容器化分层；macOS 可通过本地开发服务快速调试。
- 许可边界：这是 AGPL fork，不引用或移植其实现和文案；仅采纳通用工作流概念。

## 4. isagawa-co/sox-audit-spec

- 仓库：[GitHub](https://github.com/isagawa-co/sox-audit-spec)，公开 README 显示仓库只有一个 commit；本次只查 README 与其列出的规格文件结构。README 把它描述为给 Claude Code agent 使用的 SOX/ICFR 领域规格，并列出八步：范围与风险、RCM、walkthrough、抽样和控制测试、缺陷分类、整改与重测、管理层评价、报告与归档。它声明目标映射 COSO 2013/PCAOB AS 2201，并按执行门槛验证流程。
- README 列出 `workflow.md`、`gate-contract.md`、逐步规格和证据质量/缺陷分类指导。公开页面未声明明确的软件许可证；因此不移植其文件、测试夹具、流程文本或将其 gate 断言视作已独立验证的审计准则。
- 对 ICMS 的启示：把 walkthrough、抽样和测试保留在后续路线图；发现按严重度分类并关联整改与重测；关闭流程应有证据和明确校验条件。适用法规与样本量需业务确认，不能从该仓库直接推导为通用规则。

## 决策

第一版聚焦公司、部门、流程、风险、控制目标与措施、RCM、Evidence、Inspection、Finding、Issue、Remediation 和 Dashboard。采用 FastAPI + PostgreSQL、Next.js、Docker Compose 本地依赖。租户隔离、RBAC、证据对象存储、显式状态迁移和审计事件在服务端实现。将抽样、walkthrough、调查、AI 和报告排入后续路线图。本研究没有复用上述项目代码、文档内容、品牌、UI 或框架资料。
