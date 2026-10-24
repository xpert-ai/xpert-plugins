# 贵宾活动计划助理

<img src="assets/icon.png" alt="贵宾活动计划助理" width="96" height="96">

管理重点活动与席位提名的计划和状态，维护面向不同读者的材料。

类别：市场营销 · 版本：1.0.3 · 纯文件 Agent Plugin

## 使用

从 Agent 插件管理导入本目录的 ZIP，或选择仓库 Git 子目录 `agent-plugins/assistants/assistant-wtd`。安装后在智能体模板市场打开“贵宾活动计划助理”，导入为 Assistant，选择支持 tool-call 的模型与可用的沙箱。插件和模板共用同一头像，由系统控制圆角。

输入：活动与票额、提名表、负责人和分享边界。

交付：活动状态表与内部简报。

1. 核对席位、提名和期限。
2. 区分销售邀请责任与运营计划。
3. 只向共享材料输出获准字段。

## 包内能力

- 三个原创技能：首次使用、业务执行、结果复核。
- Assistant DSL v2：职责、技能引用、用户独立初始文件、偏好初始化、外部操作审批。
- 一个默认暂停的每周本地复核任务，启用前需确认用户时区。它是本实现的复核计划，未逐项移植上游例行任务。
- SandboxFile 使用宿主已有能力；没有 NestJS 模块或服务端安装脚本。

## 能力边界与来源

私人备注不得进入面向营销团队的共享页面。

原始参考：[WTD](https://x.ai/bot/marketplace/bots/wtd)，页面作者 Jenna Nanpei，核对日期 2026-10-14。原始类别：From Grok Bot Team / Marketing。

本包为 Xpert 按公开业务用途独立编写的功能适配，未复制上游长篇提示词、技能正文、人物头像或账号配置。原页面列出 6 项技能、1 项例行任务；这里的三个技能是重新设计的工作流程，不宣称逐项功能等价或源作者背书。

原页面列出的集成：Notion、Slack、Gmail、Google Drive。这些名称仅作来源与后续兼容性追踪；本包不预装外部账号连接，也不冒充已接入上游专有工具。联网研究、CRM、电话、云开发、媒体生成等操作需要另外安装对应工具并完成授权和实测；未接入时可处理上传资料并交付本地文件/草稿，未完成部分必须明确说明。

验证范围：仓库结构、生产解析器、ZIP 导入合同、技能/头像/DSL 绑定；各角色模型业务执行与真实供应商连接另行验收。

源声明见 [docs/provenance.json](docs/provenance.json)，头像提示词见 [assets/avatar.json](assets/avatar.json)。配置源为 [分类目录](../../catalog/assistant-series/marketing.json)，运行 `node scripts/build-assistant-series.mjs` 重新生成；Office Ops 不由该生成器改写。
