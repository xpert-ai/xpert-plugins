# Canvas

Canvas 是面向 Xpert 和 data-xpert 的 Agentic 可视化工作空间。它把 tldraw 无限画布、人工可编辑的 Workbench、Canvas Assistant 模板和 Agent middleware tools 组合在一起，让用户和 AI 可以在同一个画布里完成创意规划、图片生成、标注反馈、版本审阅和持续迭代。

当一次对话需要“可共同编辑的视觉载体”时，Canvas 就很适合使用：项目规划板、情绪板、线框草图、图片评审、AI 图片占位框，以及需要保留版本记录的白板协作，都可以沉淀在 Canvas 里，而不是散落在一次性的聊天附件中。

## 产品亮点

- 无限画布：适用于白板、视觉规划、情绪板、线框图和图片看板。
- Canvas Workbench：支持人工审阅、直接编辑、标注、版本浏览、版本恢复、导入和导出。
- Canvas Assistant：把当前画布、选中图形、插入目标和视口快照带入 Agent 对话，让 AI 理解用户正在看的内容。
- AI 图片占位框：用户可以先框定图片位置和比例，再让 Agent 生成图片并精准填入。
- Agent middleware tools：支持创建画布、补丁式更新 tldraw records、插入图片、保存版本、搜索文档、读取记录、更新状态和记录失败。
- 自动保存和显式版本：Workbench 会保存当前工作副本，关键节点可另存为可恢复、可审计的版本。

## 效果截图位

后续可以把产品截图放在这里。下方路径只是建议占位，替换成实际图片即可。

| 位置 | 建议素材路径 | 截图内容 |
| --- | --- | --- |
| Workbench 总览 | `assets/screenshots/workbench-overview.png` | 左侧画布列表、中间 tldraw 画布、顶部工具栏、右侧版本和日志面板。 |
| AI 图片占位流程 | `assets/screenshots/ai-image-holder.png` | 选中的图片占位框，以及 Agent 生成并插入后的图片效果。 |
| 标注评审 | `assets/screenshots/annotation-review.png` | 箭头、文字标注和批注意见如何成为 Agent 修改依据。 |
| 版本历史 | `assets/screenshots/version-history.png` | 已保存版本、恢复操作和当前版本状态。 |

## 典型流程

1. 从用户需求、模板提示词、导入的 tldraw 快照或 Workbench 操作创建画布。
2. 用户在 Workbench 中绘制、排版、标注，系统自动保存当前工作副本。
3. 用户选择图片占位框、批注、图形或页面区域，并让 Canvas Assistant 基于当前选择继续处理。
4. Agent 读取最新视口快照，理解画面布局和标注意图，然后生成图片、插入素材或补丁式修改指定 records。
5. 到达评审节点时保存显式版本，之后可以恢复历史版本或追踪修改记录。

## 在 Xpert 中的组成

- Workbench view：面向人的交互界面，用于创建、编辑、标注、导入导出、版本管理和审阅画布。
- Canvas Assistant：开箱即用的可视化工作流助手模板，适合图片生成、图片放置和基于标注的修改。
- Agent middleware tools：面向 Agent 的结构化自动化能力，用于安全地创建文档、更新记录、插入图片和记录失败。
- 可安装 skill：指导 Agent 正确使用 Canvas 上下文、选区数据、视口快照和图片插入目标。
- 工作区快照：当前视口图片保存到 `files/canvas/documents/{documentId}/snapshots/current.png`；显式版本的图片保存在 `files/canvas/documents/{documentId}/snapshots/versions/`。

## 适合场景

- 产品和项目团队把模糊想法整理成共享视觉计划。
- 设计和内容团队基于人工标注持续迭代 AI 生成图片。
- Agent 需要长期可编辑的视觉记忆，而不是一次性的聊天图片。
- 审阅流程要求每一次 AI 修改都可查看、可恢复、可追踪。

## 包含的插件能力

- 面向 Xpert 和 data-xpert 的 Marketplace app 元数据。
- Canvas Workbench 扩展视图。
- Canvas Agent middleware。
- Canvas Assistant 模板。
- 位于 `skills/` 下的 Canvas Agent Skill。
- 位于 `assets/` 下的 logo 和 composer icon。

## 验证

```bash
pnpm test
pnpm build
```
