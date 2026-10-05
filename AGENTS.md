# 企业内控管理系统：项目根入口

当前 Git 根目录和已保存的本地项目“contrlio企业内控管理系统”指向本目录。业务工程位于 `icms/`；保留当前目录结构和 Git 根，不建立嵌套仓库。

本仓库是项目需求、实现、决策与任务状态的唯一事实源。开始任何内控项目任务前，必须先按顺序阅读：

1. `docs/PROJECT_CONTEXT.md`
2. `docs/REQUIREMENTS.md`
3. `docs/ARCHITECTURE.md`
4. `docs/DECISIONS.md`
5. `docs/TASKS.md`
6. `icms/AGENTS.md`：业务工程的实现约束。

根目录 `docs/` 是指向 `icms/docs/` 的相对目录符号链接，两条路径读取和修改的是同一份文件。保留这一映射，不复制出第二套文档；Git 保存根目录链接及 `icms/docs/` 中的实际文档。业务代码与专项文档继续保留在 `icms/`。

具体协作方式见 `docs/PROJECT_HANDOFF.md`。从 ChatGPT Project 交接需求时，将确认内容写入 REQUIREMENTS、取舍写入 DECISIONS，执行后更新 TASKS；实现、数据流和部署变化同步到 ARCHITECTURE。结论必须记录实际依据，待确认项不得写成已实现或已验收。

项目文件是跨 ChatGPT、Work、Codex 的事实源。确认的需求与决策必须回写对应文档，结束时更新任务和验证结果。文件交接不等于聊天历史合并，Git 不同步业务数据库或上传文件。

应用命令使用 `icms/` 作为工作目录，Git 操作使用本目录作为根；具体初始化与部署按 `icms/README.md` 和专项说明执行。检查既有改动，遵守公司隔离、整改版本及证据约束；保护环境密钥与数据卷。

当前任务只涉及协作、文档和版本范围准备。未经明确授权不要推送，也不要自行改 remote、移动 `.git` 或发布生产。
