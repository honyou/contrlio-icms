# ChatGPT / Work / Codex 项目交接

更新日期：2026-10-03。依据当前应用项目清单及本地目录核对。

## 现有项目对应关系

| 已有项目 | 当前作用与入口 |
|---|---|
| ChatGPT 项目“企业内控管理系统” | 讨论需求、资料与已确认决策；上传的上下文副本需主动刷新 |
| 本地项目“contrlio企业内控管理系统” | 保存的项目路径为 `/Users/honyou/Documents/ChatGPT/企业内控管理系统`，也是 Git 根 |
| ICMS 工程 | `/Users/honyou/Documents/ChatGPT/企业内控管理系统/icms`，维护代码及核心文档 |

父级 `AGENTS.md` 已连接到工程内协作规则及五份文档。从已有本地项目启动任务时，先读根指引即可定位工程，不需要重建项目或移动目录。

## 可放入 ChatGPT 项目指令的文本

```text
本项目为现有 ICMS / Contrlio 企业内控管理系统。
本地项目根：/Users/honyou/Documents/ChatGPT/企业内控管理系统
工程目录：/Users/honyou/Documents/ChatGPT/企业内控管理系统/icms

仓库是需求、实现、决策与任务状态的唯一事实源。开始工作前读取工程AGENTS.md和docs中的PROJECT_CONTEXT.md、REQUIREMENTS.md、ARCHITECTURE.md、DECISIONS.md、TASKS.md。
确认的需求写入REQUIREMENTS，取舍写入DECISIONS，进展和下一步写入TASKS；不要依赖另一种模式自动读取聊天历史。
能访问本地目录的Work或Codex使用同一工程；无法访问时依据最新上传的共享上下文副本，并注明版本和待核实项。
保留现有代码、目录和业务数据。仅在任务明确要求时修改业务实现。未经明确授权不要push或部署。
业务目标遵循：企业目标→制度搭建→流程设计→风险识别与控制→整改→独立验证→制度与流程调整；区分当前实现与规划能力。
任务结束时更新对应文档，报告实际改动和验证结果。
```

## 给 Work 或 Codex 的开始指令

```text
继续现有“contrlio企业内控管理系统”项目。
使用 /Users/honyou/Documents/ChatGPT/企业内控管理系统，业务工程在 icms/。
先读根AGENTS.md、icms/AGENTS.md及五份核心文档。
据实际代码和配置核对需求后执行本次任务，结束时回写相关文档及TASKS。
未经明确授权不要push或部署。
```

## 上下文副本的维护

本次提供一份合并核心文档的 Markdown 上下文快照，可上传到已有 ChatGPT 项目。快照注明导出时间和各来源 SHA-256；以仓库最新文件为准，源码/决策变化后重新导出并替换旧副本。

快照只包含明确列出的项目文档，不包含 `.env`、数据库、上传证据、制度正文、视频或发布包。不自动上传，也不保证 ChatGPT 项目文件副本即时更新。

本轮按用户要求先整理本地。项目指令文本和上下文快照已准备，尚未写入 ChatGPT 项目设置或上传。GitHub 连接登录名为 `honyou`，但连接没有返回可访问仓库，也未发现 local remote；目标链接和远端连接留待后续安排，不阻塞当前本地协作。
