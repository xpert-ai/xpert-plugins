# 智能体组织架构顾问

<img src="assets/icon.png" alt="智能体组织架构顾问" width="96" height="96">

梳理团队工作与智能体职责，发现重复任务和管理缺口。

类别：运营管理 · 版本：1.0.3 · 纯文件 Agent Plugin

## 使用

从 Agent 插件管理导入本目录的 ZIP，或选择仓库 Git 子目录 `agent-plugins/assistants/assistant-alfred`。安装后在智能体模板市场打开“智能体组织架构顾问”，导入为 Assistant，选择支持 tool-call 的模型与可用的沙箱。插件和模板共用同一头像，由系统控制圆角。

输入：组织目标、岗位分工、已有助手与自动化清单。

交付：职责矩阵与治理方案。

1. 把目标关联到人工负责人。
2. 比较现有能力与工作频率。
3. 先复用再提出最小新增方案并制定试点验收。

## 包内能力

- 三个原创技能：首次使用、业务执行、结果复核。
- Assistant DSL v2：职责、技能引用、用户独立初始文件、偏好初始化、外部操作审批。
- 一个默认暂停的每周本地复核任务，启用前需确认用户时区。它是本实现的复核计划，未逐项移植上游例行任务。
- SandboxFile 使用宿主已有能力；没有 NestJS 模块或服务端安装脚本。

## 能力边界与来源

仅输出方案，创建助手和调整权限须另行批准。

原始参考：[Alfred](https://x.ai/bot/marketplace/bots/alfred)，页面作者 Robin Delta，核对日期 2026-10-14。原始类别：Operations。

本包为 Xpert 按公开业务用途独立编写的功能适配，未复制上游长篇提示词、技能正文、人物头像或账号配置。原页面列出 6 项技能、3 项例行任务；这里的三个技能是重新设计的工作流程，不宣称逐项功能等价或源作者背书。

原页面列出的集成：无。这些名称仅作来源与后续兼容性追踪；本包不预装外部账号连接，也不冒充已接入上游专有工具。联网研究、CRM、电话、云开发、媒体生成等操作需要另外安装对应工具并完成授权和实测；未接入时可处理上传资料并交付本地文件/草稿，未完成部分必须明确说明。

验证范围：仓库结构、生产解析器、ZIP 导入合同、技能/头像/DSL 绑定；各角色模型业务执行与真实供应商连接另行验收。

源声明见 [docs/provenance.json](docs/provenance.json)，头像提示词见 [assets/avatar.json](assets/avatar.json)。配置源为 [分类目录](../../catalog/assistant-series/operations.json)，运行 `node scripts/build-assistant-series.mjs` 重新生成；Office Ops 不由该生成器改写。
