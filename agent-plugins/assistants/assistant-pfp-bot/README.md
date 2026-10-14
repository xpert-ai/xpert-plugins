# 卡通头像设计师

<img src="assets/icon.png" alt="卡通头像设计师" width="96" height="96">

根据用户授权照片提炼外观特征，设计适合小尺寸显示的头像。

类别：个人事务 · 版本：1.0.3 · 纯文件 Agent Plugin

## 使用

从 Agent 插件管理导入本目录的 ZIP，或选择仓库 Git 子目录 `agent-plugins/assistants/assistant-pfp-bot`。安装后在智能体模板市场打开“卡通头像设计师”，导入为 Assistant，选择支持 tool-call 的模型与可用的沙箱。插件和模板共用同一头像，由系统控制圆角。

输入：授权图片、人物偏好、用途与风格。

交付：头像图像与导出规格。

1. 确认可使用的照片与特征。
2. 通过真实图像工具生成原创图像。
3. 检查小尺寸可读性与圆角裁切。

## 包内能力

- 三个原创技能：首次使用、业务执行、结果复核。
- Assistant DSL v2：职责、技能引用、用户独立初始文件、偏好初始化、外部操作审批。
- 不预置自动运行的例行任务。
- SandboxFile、ViewImageMiddleware 使用宿主已有能力；没有 NestJS 模块或服务端安装脚本。

## 能力边界与来源

无图像工具时输出设计说明，不假装已生成图片。

原始参考：[Pfp Bot](https://x.ai/bot/marketplace/bots/pfp-bot)，页面作者 Shub Gaur，核对日期 2026-10-14。原始类别：From Grok Bot Team / Personal。

本包为 Xpert 按公开业务用途独立编写的功能适配，未复制上游长篇提示词、技能正文、人物头像或账号配置。原页面列出 8 项技能、0 项例行任务；这里的三个技能是重新设计的工作流程，不宣称逐项功能等价或源作者背书。

原页面列出的集成：X。这些名称仅作来源与后续兼容性追踪；本包不预装外部账号连接，也不冒充已接入上游专有工具。联网研究、CRM、电话、云开发、媒体生成等操作需要另外安装对应工具并完成授权和实测；未接入时可处理上传资料并交付本地文件/草稿，未完成部分必须明确说明。

验证范围：仓库结构、生产解析器、ZIP 导入合同、技能/头像/DSL 绑定；各角色模型业务执行与真实供应商连接另行验收。

源声明见 [docs/provenance.json](docs/provenance.json)，头像提示词见 [assets/avatar.json](assets/avatar.json)。配置源为 [分类目录](../../catalog/assistant-series/personal.json)，运行 `node scripts/build-assistant-series.mjs` 重新生成；Office Ops 不由该生成器改写。
