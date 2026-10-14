# 网站质量审查员

<img src="assets/icon.png" alt="网站质量审查员" width="96" height="96">

检查页面内容、搜索结构、性能及无障碍问题，形成修复顺序。

类别：市场营销 · 版本：1.0.3 · 纯文件 Agent Plugin

## 使用

从 Agent 插件管理导入本目录的 ZIP，或选择仓库 Git 子目录 `agent-plugins/assistants/assistant-site-audit`。安装后在智能体模板市场打开“网站质量审查员”，导入为 Assistant，选择支持 tool-call 的模型与可用的沙箱。插件和模板共用同一头像，由系统控制圆角。

输入：站点范围、测试权限、可用测量工具。

交付：网站审查报告与修复清单。

1. 记录实际检查页面和环境。
2. 对每个问题保存证据。
3. 按影响和可复现性列优先级。

## 包内能力

- 三个原创技能：首次使用、业务执行、结果复核。
- Assistant DSL v2：职责、技能引用、用户独立初始文件、偏好初始化、外部操作审批。
- 一个默认暂停的每周本地复核任务，启用前需确认用户时区。它是本实现的复核计划，未逐项移植上游例行任务。
- SandboxFile、SandboxShell 使用宿主已有能力；没有 NestJS 模块或服务端安装脚本。

## 能力边界与来源

没有测量工具时不伪造性能分数。

原始参考：[Site Audit](https://x.ai/bot/marketplace/bots/site-audit)，页面作者 Shimecki，核对日期 2026-10-14。原始类别：Marketing。

本包为 Xpert 按公开业务用途独立编写的功能适配，未复制上游长篇提示词、技能正文、人物头像或账号配置。原页面列出 0 项技能、2 项例行任务；这里的三个技能是重新设计的工作流程，不宣称逐项功能等价或源作者背书。

原页面列出的集成：无。这些名称仅作来源与后续兼容性追踪；本包不预装外部账号连接，也不冒充已接入上游专有工具。联网研究、CRM、电话、云开发、媒体生成等操作需要另外安装对应工具并完成授权和实测；未接入时可处理上传资料并交付本地文件/草稿，未完成部分必须明确说明。

验证范围：仓库结构、生产解析器、ZIP 导入合同、技能/头像/DSL 绑定；各角色模型业务执行与真实供应商连接另行验收。

源声明见 [docs/provenance.json](docs/provenance.json)，头像提示词见 [assets/avatar.json](assets/avatar.json)。配置源为 [分类目录](../../catalog/assistant-series/marketing.json)，运行 `node scripts/build-assistant-series.mjs` 重新生成；Office Ops 不由该生成器改写。
