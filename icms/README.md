# ICMS 本地开发

本项目以 Apple Silicon macOS 本地开发为先。PHASE 0–8 是第一版范围；业务记录全部保存在 PostgreSQL，Evidence 文件实际存储在 MinIO。网页和 API 使用本机开发进程，Docker Compose 仅启动数据库、缓存和对象存储。

开始协作先读 [AGENTS.md](AGENTS.md) 及其指定的五份核心文档；ChatGPT / Work / Codex 的现有项目入口和交接指令见 [项目交接](docs/PROJECT_HANDOFF.md)。当前实现状态以 [PROJECT_CONTEXT](docs/PROJECT_CONTEXT.md)、[REQUIREMENTS](docs/REQUIREMENTS.md) 和 [TASKS](docs/TASKS.md) 为准。

AI Token 由公司自行采购并在「系统设置 → AI 内控助手」中按公司配置；加密、服务商接入和数据发送说明见 [AI 助手使用文档](docs/AI_ASSISTANT.md)。

## 首次启动

需要 Node.js 20.9+、Python 3.11+、uv，以及可用的 Docker CLI 和 Compose。先初始化仅本机使用的密钥，再用 Compose 启动基础服务：

```bash
cd icms
make init-local
docker compose up -d
```

`make init-local` 在 `.env` 中生成随机数据库密码、MinIO 密钥、JWT 密钥和管理员密码；管理员密码保存在该文件中，不输出到终端。`.env` 具有仅当前用户读取权限且已被 Git 忽略。当前本地 MinIO 容器使用 Bitnami Legacy 镜像，PostgreSQL/Redis 使用 Google 的 Docker Hub 镜像缓存地址，方便网络无法访问 Docker Hub 时启动。

安装并启动 API：

```bash
cd apps/api
uv sync --group dev
uv run alembic upgrade head
uv run python -m app.bootstrap
uv run uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

再开一个终端安装并启动前端：

```bash
cd icms/apps/web
npm install
npm run dev
```

打开 `http://localhost:3000`，使用 `.env` 中的 `ADMIN_EMAIL` 和 `ADMIN_PASSWORD` 登录。系统管理员或已加入启用公司且担任经理的成员可以创建新公司；创建者自动成为该公司的经理。公司删除为可恢复停用，保留业务资料和文件，并可由公司经理或系统管理员恢复。

新的本地用户可从登录页注册，但须先获得系统管理员签发的一次性邀请码；邀请码在系统管理员的“用户管理”页面生成。注册即创建公司经理账号。既有账号继续直接登录，不受邀请码要求影响。注册或创建公司时可选行业和实践阶段，导入真实的公司范围基础记录；也可登录后在“行业参考库”预览并应用样例。当前覆盖 13 个垂直行业和通用企业，共 42 套实践参考；餐饮扩展到 8 条端到端流程，其余行业扩展到 5 条起步流程。参考库已扩展为组织框架、岗位 RACI、通用/行业制度范本、12 周实施方案、官方资料、公开案例和明确标注的模拟案例，可导出为 Markdown；来源、司法辖区和适用边界见 [行业参考库说明](docs/INDUSTRY_REFERENCE_LIBRARY.md)。新增的“法规与流程合规”菜单提供 14 个行业法规索引、官方来源、适用边界，并把法规关注点映射到行业流程、风险、控制、测试样本和证据；它也读取当前公司的实际业务流程。维护约束见 [法规与流程合规说明](docs/COMPLIANCE_LIBRARY.md)。

## 服务地址

| 服务 | 本机地址 |
|---|---|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| Swagger | http://localhost:8000/docs |
| PostgreSQL | `localhost:5432`，数据库 `icms` |
| Redis | `localhost:6379` |
| MinIO S3 API | http://localhost:9000 |
| MinIO Console | http://localhost:9001 |

MinIO Console 用 `.env` 的 `MINIO_ROOT_USER` 和 `MINIO_ROOT_PASSWORD` 登录。为简化纯本机启动，ICMS 本地 API 也使用这组 MinIO 凭据；生产使用独立环境配置，见文末部署说明。`make bootstrap` 完成迁移和管理员初始化后，会创建证据 Bucket。

首次登录邮箱是 `.env` 中的 `ADMIN_EMAIL`（默认 `admin@icms.dev`）；随机密码保存在 `.env` 的 `ADMIN_PASSWORD` 字段。

## 快速启动命令

```bash
make infra-up      # docker compose up -d
make bootstrap     # 数据库迁移及管理员初始化
make api           # 本机 uvicorn 热重载
make web           # 本机 Next.js 热重载
make infra-down    # 停容器，保留数据卷
```

## 数据安全和重置

正常停止服务使用 `docker compose down`，PostgreSQL、Redis、MinIO 命名卷会保留。**不要执行 `docker compose down -v`，除非确实要清除本地数据库和上传文件。**迁移文件位于 `apps/api/alembic/versions/`。管理员初始化可重复运行，已有账号密码不会被重置。

登录后按顺序创建部门、流程、风险、控制目标、控制措施与 RCM，向 RCM 上传 Evidence，创建内控检查和检查执行项；失败检查项可创建 Finding 并转换 Issue。在 Issue 详情指定责任人并填写整改计划。责任人上传文件证据、提交；经理或审计员独立复核与重测，全部通过后关闭。Dashboard 根据数据库统计自动更新。

「业务流程 → 配置流程」可维护办理表单、任务/审批/条件步骤、责任人员、办理时限、证据及风险/控制关联，支持保存草稿、发布前检查、流程预览和发布历史。已有档案可按实际关联资料生成起步草稿。配置、版本和当前清单状态均来自 PostgreSQL；操作及接口见 [流程配置说明](docs/PROCESS_CONFIGURATION.md)。

「风险管理」提供按流程查看的风险台账和 14 个行业的基础风险模板，覆盖具体风险事项、固有及剩余风险等级、控制措施、核查方法、抽样建议和证据清单。经理可选择适用流程并映射到公司已有流程，导入时同步建立风险、控制目标、控制措施和 RCM；重复应用跳过已导入风险。模板评分可按公司实际修改，剩余风险需另行评估。使用及升级见 [风险管理说明](docs/RISK_MANAGEMENT.md)。

公司经理或内控审计员可从「制度合规分析」上传 PDF、DOCX、TXT、Markdown 制度。原文件进入 MinIO；开始 AI 分析前需确认将制度全文和系统行业法规索引摘要发送给公司配置的模型服务商。每次报告和 Token 用量会留在 PostgreSQL，可回看历史分析。扫描版 PDF 暂不支持 OCR；报告使用官方来源法规索引和链接，不会自动读取法规全文或实时核验现行状态，采纳前需由法务/内控人员复核。

更多产品边界与迭代计划见 [产品需求](docs/PRODUCT_REQUIREMENTS.md)、[架构](docs/ARCHITECTURE.md)、[领域模型](docs/DOMAIN_MODEL.md)、[ERD](docs/ERD.md)、[RBAC](docs/RBAC.md) 和 [路线图](ROADMAP.md)。

AI 可选启用，核心业务不依赖 AI。生产部署目前不在本地开发 Compose 中。

腾讯云生产部署使用独立的 `compose.production.yml` 与宿主机 Nginx/Let's Encrypt；公网仅开放 80/443，数据服务不暴露端口。部署脚本及密钥初始化方式见 [腾讯云部署说明](docs/TENCENT_DEPLOYMENT.md)。本地配置继续使用原来的 `docker-compose.yml` 和 `.env`。
