# Office Ops

<img src="assets/icon.png" alt="Office Ops" width="96" height="96">

类别：企业运营 · 纯文件 Agent Plugin · [系列目录](../../catalog/assistant-series/README.md)

纯文件 Agent Plugin：Office Ops Assistant 模板、7 个技能、5 个 JSON 台账、3 个默认暂停的例行任务。无需 NestJS Module、npm 包或服务端插件注册。

通过 Agent Plugins 的 ZIP/Git 导入流程安装到组织，再从 Web/Desktop 模板市场选择 **Office Ops**，设置工作空间与模型。首次引导填写语言、IANA 时区与办公室，产生本地概览。目录复制用于分发，使用前仍须完成平台导入校验。

`plugin.json` 采用 Agent Plugins 1.0.0；`extensions.xpertai.version: 2` 的 `templates` 是 Xpert 扩展，引用包内 `templates/office-ops.json`。能力、初始化文件、偏好、例行任务和操作策略声明在 Assistant DSL 中。Skill 依赖通过 `source.kind: agent-plugin` 和包名引用，安装时锁定内容摘要。

旧 Xpert Plugin 实例使用“模板发布与升级 → 选择模板来源 → Office Ops”比较并保存升级草稿，再显式发布。实例身份、会话、文件、偏好和绑定保留；可恢复上次内容。无需重建 Assistant。平台仍支持 Native Xpert Plugin 的模板贡献。

本地台账与草稿可独立使用。08b–g 真实 Notion、Slack、Linear、Sheets、Gmail、Calendar 供应商实测仍单列待验收。外部同步只使用实例中实际存在且已授权的工具。

在 `agent-plugins` 目录运行 `corepack pnpm test` 和 `corepack pnpm test:lifecycle --platform-root /path/to/xpert`。参见 [使用与验收](docs/usage.mdx)。

## 仓库位置与系列结构

Git 导入子目录为 `agent-plugins/assistants/office-ops`。与系列其余模板一致，本包包含 `plugin.json`、`templates/`、`skills/`、`assets/icon.png`、`assets/avatar.json` 和 `docs/provenance.json`。包名 `office-ops`、模板 key `office-ops` 与主智能体 key `office-primary` 保持稳定，目录迁移不会创建第二套 Office Ops 身份。7 个业务技能、3 个默认暂停任务及台账保持原有能力。

来源归属见 [docs/provenance.json](docs/provenance.json)，头像记录见 [assets/avatar.json](assets/avatar.json)。生成器维护系列目录与路径，不改写本包的业务配置。
