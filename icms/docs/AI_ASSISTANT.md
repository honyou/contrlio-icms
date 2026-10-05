# AI 内控助手（本地开发版）

AI 功能由公司自行采购并配置服务商 API Token。contrlio 不提供 Token，也不代付模型费用。

## 启用

1. 在项目根目录执行 `make init-local`，首次初始化会在本机 `.env` 中生成 `AI_ENCRYPTION_KEY`。不要删除或更换该密钥；更换后此前保存的服务商 Token 将无法解密。
2. 如 API 已经运行，重启 API 让它读取新的密钥。
3. 使用公司经理账号打开「系统设置 → AI 内控助手」，选择服务商、Base URL 和模型 ID，粘贴自行采购的 Token，保存后可执行一次连接测试。实际对话和流程建议仍从「AI 内控助手」菜单发起。

Token 按公司分别保存，在 API 服务端用 Fernet 加密后写入 PostgreSQL；管理页面永不回读明文，更新其它设置时可留空保留已保存 Token。经理可删除当前公司的 Token 配置。审计记录保留服务商、模型和任务类型，不保存 Token、完整问题或模型答复。

设置页提供按地区和用途分组的预设：OpenAI、Anthropic、Google Gemini、Mistral、Groq、OpenRouter、DeepSeek、阿里云百炼、Moonshot/Kimi、智谱、火山方舟/豆包、百川、硅基流动、Together AI、Fireworks AI 和本机 Ollama，也可以选择自定义网关。协议与服务商分开配置，当前支持 OpenAI Responses API、OpenAI Chat Completions 兼容接口、Anthropic Messages 和 Google Gemini 原生 `generateContent`；其中中国服务商和聚合网关按其兼容接口预填 Base URL。Base URL 与模型 ID 按服务商账号实际提供的信息填写；区域、账号类型、可用模型可能不同。服务端要求远程 HTTPS，且在调用时会阻止解析到内网的远程地址；HTTP 只允许本机回环地址用于本地兼容服务。

## 当前助手任务

- **流程设计指导**：把所选公司流程、相关风险、控制目标、控制措施、RCM 以及对应行业流程/法规索引作为上下文，生成岗位分离、控制设计、抽样总体、测试程序和例外处理建议。
- **法规更新分析**：结合公司行业、现有法规索引条目和用户粘贴的官方原文/材料，生成影响分析与待核验清单。当前版本不会自动打开网页、搜索互联网或直接修改法规索引；仅粘贴 URL 不会让模型访问该页面。
- **公司制度合规分析**：「制度合规分析」支持 PDF/DOCX/TXT/Markdown 原件上传，按行业法规索引生成制度风险点、准确原文摘录、控制缺口、修改建议和官方链接；每次分析作为独立版本保存，可回看历史结果。单文件最多 20 MB、正文 60,000 字；扫描 PDF 暂不支持 OCR。

AI 请求由用户逐次点击触发。调用前页面会说明发送范围并要求勾选确认。调用权限限于公司经理和内控审计员。制度原件存于 MinIO，提取正文不写入 PostgreSQL；在用户确认分析后，完整制度正文和最多 15 条系统法规索引摘要会发送到该公司配置的第三方模型服务。输出仅为待复核草案，不会自动写入正式业务记录；法规状态、适用范围及流程控制设计须由公司负责人核验。

制度报告的法律依据来自 `app/compliance_library.py` 当前按行业筛选的索引摘要及官方来源链接。该索引不是完整法规原文，API 不访问官方网页，也不声称完成实时法规检索；模型提出的法规 ID 由服务端限定到本次上下文并映射为系统中已知的官方链接。精确引文会与上传正文比对，不能匹配的引文不显示。部署到生产或处理高度机密制度前，应结合 AI 服务商的数据留存条款评估，并由法务/内控人员核实每条建议。

业务上下文会发送到公司所选的第三方模型服务，费用、留存和训练数据处理方式取决于服务商账号设置及其条款。调用前请脱敏，不要上传无权外传的个人信息、客户机密、证据原件或其他敏感材料。系统不承诺服务商零留存。

普通成员默认每人每自然月 2,000,000 tokens；已有普通成员额度通过迁移统一调整到该额度，公司经理仍可按成员修改。系统管理员不受系统内月度 Token 上限限制，但其模型调用仍计入使用记录，第三方服务商的费用与限制仍适用。

## API

- `GET /api/ai/settings?organization_id=...`：读取非秘密配置元数据。
- `POST /api/ai/settings?organization_id=...`：经理保存配置。请求字段为 `provider`、`protocol`、`base_url`、`model`、`api_key`；明文 Token 仅在写入时接收。
- `POST /api/ai/settings/test?organization_id=...`：经理手动测试连接。
- `DELETE /api/ai/settings?organization_id=...`：经理删除配置。
- `POST /api/ai/assist?organization_id=...`：经理或内控审计员逐次调用。法规任务支持 `task=regulatory_update`；流程任务支持 `task=process_guidance`，并需提供当前公司的 `process_id`。请求必须携带 `confirm_external_transfer=true`。
- `GET /api/policies?organization_id=...`：经理/审计员读取本公司制度及最近一份报告。
- `POST /api/policies/upload?organization_id=...`：经理/审计员上传并提取制度正文，文件字节真实存储到 MinIO；不触发 AI 调用。
- `POST /api/policies/{document_id}/analyze?organization_id=...`：需要 `{ "confirm_external_transfer": true }`，调用本公司 AI 服务、扣减发起成员 Token 配额并保存报告版本。
- `GET /api/policies/{document_id}/analyses?organization_id=...`：回看报告版本；`GET /api/policies/{document_id}/download?organization_id=...`：下载原件。

## 服务商文档

- [OpenAI Developer Quickstart](https://platform.openai.com/docs/quickstart/make-your-first-api-request)：服务端 API Key 与 Responses API 请求示例。
- [OpenAI API Reference](https://developers.openai.com/api/reference/overview)：官方 REST API 参考。
- [DeepSeek API Quick Start](https://api-docs.deepseek.com/quick_start/pricing-details-cny/)：OpenAI 兼容格式及官方 Base URL。
- [阿里云百炼 OpenAI 兼容接口](https://help.aliyun.com/en/model-studio/batch-interfaces-compatible-with-openai)：区域端点、Base URL 与 API Key 说明。
- [Anthropic Messages API](https://docs.anthropic.com/en/api/messages)：Messages 接口格式与鉴权头。
- [Google Gemini generateContent API](https://ai.google.dev/api/generate-content)：原生 `contents`、`systemInstruction` 和 `x-goog-api-key` 请求格式。
