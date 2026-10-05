# 项目上下文

更新日期：2026-10-05。本文依据本地 README、现有文档、前后端源码、数据库模型/迁移、生产发布记录及本日 GitHub 首发核验整理。

## 项目识别与目标

项目为 **ICMS 企业内控管理系统**，生产部署资料使用 **Contrlio** 名称。工作目录：`/Users/honyou/Documents/ChatGPT/企业内控管理系统/icms`。

识别依据：目录名称包含企业内控；README 描述公司、风险、控制、检查与整改；前端包名为 `icms-web`，后端为 `icms-api`；模型包含 RCM、Inspection、Finding、Issue、Remediation 等真实领域实体。优先检查的本机 Documents 目录中只发现这一组匹配 COSO/内控名称的项目目录。

产品面向企业内控团队，围绕“企业目标 → 制度搭建 → 流程设计 → 风险识别与控制 → 整改 → 验证 → 制度调整”形成可追溯管理闭环。当前已实现的核心集中于流程、风险、控制矩阵、检查、证据和整改；企业级目标建模及制度修订审批闭环仍需明确，见 [需求与边界](REQUIREMENTS.md)。

## 技术栈

| 层 | 当前实现 |
|---|---|
| 前端 | Next.js 15.5、React 19、TypeScript 5.8、App Router，中文业务页面 |
| 后端 | Python ≥3.11、FastAPI、Pydantic、SQLAlchemy 2、Alembic、uv；生产镜像使用 Python 3.12 |
| 数据与文件 | PostgreSQL 16 保存业务记录和元数据；MinIO 保存证据和制度原件；Redis 参与会话撤销等状态 |
| 鉴权 | Argon2 密码哈希、JWT、HttpOnly cookie、公司 membership 与 RBAC |
| AI | 公司配置的外部模型服务商；加密凭据、普通成员默认每月 2,000,000 Token 配额、系统管理员不限额、制度 AI 分析 |
| 部署 | 本地基础服务 Compose；生产独立 Compose、Docker 镜像、宿主机 Nginx、Let's Encrypt |

版本描述来自 `apps/web/package.json`、`apps/api/pyproject.toml` 和 Compose/Dockerfile，精确依赖以各 lock 文件为准。

## 当前状态

- 源码已有公司/成员/部门、业务流程、控制目标、风险台账、控制措施、RCM、证据、检查、发现、整改提交/复核/重测/关闭和仪表盘。
- 已扩展流程配置草稿与发布版本、流程制度关联、行业参考库、风险模板、法规索引、AI 助手与制度分析、内控报告和账户收费管理。
- 制度合规菜单已增加公司制度库、AI 单份审阅、制度间 AI 分析三个工作区；交叉分析可选制度与活动流程草稿，保存来源哈希/版本/报告。2026-10-04 已发布到生产，数据库迁移 `20261004_0016` 已应用，API/Web 容器运行正常，线上交叉分析路由及前端菜单文案 bundle 已核实。生产页面当前无登录会话，认证态页面交互、AI 实际调用、跨公司拒绝场景仍待验收，不记为端到端业务验收。
- 普通成员月度 AI Token 限额设为 2,000,000；系统管理员绕过额度限制但继续记账。迁移 `20261004_0017` 已于 2026-10-04 发布到生产，迁移头、服务健康与首页已核验。普通成员额度行聚合值和认证态额度 API/UI 尚未复核，详见 [TASKS](TASKS.md)。
- 报告由前端读取业务 API 后生成 Word 或通过浏览器打印保存 PDF；不是独立后端报告导出服务。
- `apps/api/tests/` 有权限、流程配置、模板、法规、AI 等测试文件；本次整理文档没有运行这些测试，也没有将代码存在标为整体验收通过。
- 项目已有腾讯云生产配置和发布脚本，文档目标为 `https://contrlio.com`、服务器目录 `/opt/contrlio`。现网版本、最新功能和健康监控安装状态需另行核验。

## 关键目录与入口

| 入口 | 用途 |
|---|---|
| `README.md`、`Makefile` | 本地初始化、迁移、启动与账号说明 |
| `apps/web/app/page.tsx` | 主页面、公司选择、导航与基础业务页面 |
| `apps/web/app/*Page.tsx`、`ProcessConfiguration.tsx`、`InspectionDetail.tsx` | 风险/RCM、行业/法规、制度分析、AI、报告、流程配置和检查详情 |
| `apps/api/app/main.py` | FastAPI 入口、认证、资源 API 与业务工作流 |
| `apps/api/app/models.py`、`schemas.py`、`security.py` | 数据模型、请求规则和授权 |
| `apps/api/app/process_configuration.py`、`risk_management.py` | 流程配置发布与风险模板/评估逻辑 |
| `apps/api/alembic/versions/` | 数据库迁移，现有文件覆盖初始化及后续功能扩展 |
| `docker-compose.yml` | 本地 PostgreSQL、Redis、MinIO |
| `compose.production.yml`、`scripts/deploy-tencent.sh` | 独立生产构建、启动与部署 |
| `docs/TENCENT_DEPLOYMENT.md`、`infrastructure/nginx/` | 生产地址、反向代理与证书配置 |

本地入口：Web `http://localhost:3000`，API `http://localhost:8000`，Swagger `http://localhost:8000/docs`，MinIO Console `http://localhost:9001`。这些是配置入口，不代表本次已确认服务正在运行。

## Git 与共享现状

2026-10-03 读取结果：Git 根目录是 `/Users/honyou/Documents/ChatGPT/企业内控管理系统`，业务工程是其下的 `icms/`；当前分支 `main` 尚无首个提交，没有配置 remote。保留这一范围；父级新增 AGENTS/README 入口，忽略规则排除发布包、媒体、缓存和本地环境秘密，文件仍保留在磁盘。

已核对应用中的本地项目“contrlio企业内控管理系统”指向 Git 根，ChatGPT 项目“企业内控管理系统”也已存在。父级指引转入工程文档，避免从现有项目启动任务时漏读规则；用法见 [项目交接](PROJECT_HANDOFF.md)。

截至 2026-10-05，Git 根仍为本目录，远端 `origin` 指向私有仓库 [honyou/contrlio-icms](https://github.com/honyou/contrlio-icms)。本地首发准备提交为 `af97ee2`，随后文档记录提交为 `2348bac`。根目录 `docs` 是指向 `icms/docs` 的符号链接；业务工程和文档仍保持原目录结构，收款二维码未纳入版本。

用户已明确授权上传完整项目，并授权 ChatGPT Codex Connector 仅访问该仓库。2026-10-05 完成 GitHub App 安装 `168080528`，仓库选择为仅 `honyou/contrlio-icms`；此前 Connector 仓库列表为空、目标读取 404 的连接阻塞已解决。通过 Connector 的 Git 数据 API 完成首发，远端提交为 `1a17ca1e6664d09d937a92ef48bfab066d698d87`，树 SHA 为 `8dc0119f1f2154b9be681ef22102fca97a81d7ee`，与上传前本地源树完全一致。远端完整树已核对 153 个 blob、13 张展示截图、根 `docs` 符号链接（模式 `120000`）及两份可执行脚本（模式 `100755`）；仓库保持私有。

Git 数据 API 生成了新的远端提交，提交 SHA 不同于本地准备提交；验证依据是完整树 SHA 及逐项路径、模式和 blob SHA 一致。GitHub 首发只同步经筛选的代码、配置示例、文档与截图，不同步 PostgreSQL、MinIO 业务数据或环境密钥。本任务没有部署生产，也没有运行项目业务测试。

本地已导入并校验远端提交对象，`main` 跟踪 `origin/main`；原本地准备历史保存在 `codex/local-before-github-publish` 分支。GitHub 首页已显示 Private、README、管理链 Mermaid 和 `docs` 的目录符号链接。用户追加要求在展示说明加入线上地址及专用演示账号，便于 HR 查看；线上入口为 [https://contrlio.com](https://contrlio.com)。用户最终指定 `demo@contrlio.com` 并授权刊登其提供的密码；2026-10-05 线上登录 API 返回 200，认证成功且用户邮箱匹配。README 和作品说明刊登最终凭据，本次未改动账号或密码，未写入业务数据。

## 日常协作

1. 在 ChatGPT Project 讨论并确认业务要求，把结论交给能访问本地目录的 Work 任务，写入 `REQUIREMENTS.md` / `DECISIONS.md`。
2. Work 和 Codex 使用上述同一 `icms` 路径，先读 `AGENTS.md` 和五份核心文档，再继续工作。
3. 开发完成后更新 `TASKS.md` 和受影响文档，记录验证结果，形成下一次任务可直接读取的交接。
4. 配置 GitHub 远端后，在获得明确授权的提交/推送流程中同步代码和文档；其他设备或工作区先拉取最新版本。

上传到 ChatGPT Project 的文件副本也需要主动更新并注明版本。这套约定共享项目文件与决策，不会自动合并聊天历史，也不会同步 PostgreSQL/MinIO 业务数据。
