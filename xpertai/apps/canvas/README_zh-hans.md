# Canvas

Canvas 是面向 Xpert 和 data-xpert 的 Agentic 可视化工作空间。它把 tldraw 无限画布、人工可编辑的 Workbench、Canvas Assistant 模板和 Agent middleware tools 组合在一起，让用户和 AI 可以在同一个画布里完成创意规划、图片生成、标注反馈、版本审阅和持续迭代。

当一次对话需要“可共同编辑的视觉载体”时，Canvas 就很适合使用：项目规划板、情绪板、线框草图、图片评审、AI 图片占位框，以及需要保留版本记录的白板协作，都可以沉淀在 Canvas 里，而不是散落在一次性的聊天附件中。

## 产品亮点

- 无限画布：适用于白板、视觉规划、情绪板、线框图和图片看板。
- Canvas Workbench：支持人工审阅、直接编辑、标注、版本浏览、版本恢复、导入和导出。
- Canvas Assistant：把当前画布、选中图形、插入目标和视口快照带入 Agent 对话，让 AI 理解用户正在看的内容。
- AI 图片占位框：用户可以先框定图片位置和比例，再让 Agent 生成图片并精准填入。
- Agent middleware tools：支持仅创建画布元数据、用简化 DTO 分阶段创建 Shape、定向更新已有 records、插入图片、渐进式查询、更新状态和记录失败。Agent 工具只更新工作副本，不创建版本。
- 工具契约强制渐进式披露：`canvas_get_document` 只返回计数和 revision，`canvas_list_records` 每页最多返回 40 条摘要，`canvas_get_record` 只展开一个精确记录；Agent 写入前必须统计全部创建、更新和删除操作，超过 12 条硬上限时先拆成语义阶段，每阶段优先控制在 6–8 条，并获得供下一阶段继续使用的紧凑收据。新建 `text`、`geo`、`note`、`frame` 和 `arrow` 时只需提交简化 DTO，服务端负责生成 tldraw ID、父页面、合法索引、默认属性和 richText。
- 平台 Collaboration/Yjs 是实时内容的唯一权威：Workbench 和 Agent 的修改按 tldraw record 合并，并实时流入所有已打开的 Canvas 会话。
- 实时显示协作者和 Agent presence；关键节点仍可保存显式版本，视口快照继续写入 Xpert 工作区供视觉检查。
- 人工控制 Artifact 分享：把已同步的 tldraw revision/page 绑定后排队，在平台 sandbox-browser 池中渲染并发布自包含只读查看器；不会创建 Canvas 版本，也不会新增重复的发布模型。

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
2. 用户在 Workbench 中绘制、排版、标注，record diff 通过平台协作会话同步；后台自动保存只维护视口图片、选区和查询投影。
3. 用户选择图片占位框、批注、图形或页面区域，并让 Canvas Assistant 基于当前选择继续处理。
4. Agent 先读取摘要，只分页查询下一步需要的 records，再分阶段提交有界补丁；Yjs update 被接受后会立即出现在打开的 Workbench 中。
5. 到达评审节点时，由人工在 Workbench 版本面板点击“新建版本”，之后可以恢复历史版本或追踪修改记录。
6. 人工可在“分享”面板中发布固定 Artifact 快照，或让一个稳定链接跟随最近一次明确发布的 Artifact 内容；公开链接必须二次确认。

## 在 Xpert 中的组成

- Workbench view：面向人的交互界面，用于创建、编辑、标注、导入导出、版本管理和审阅画布。
- Canvas Assistant：开箱即用的可视化工作流助手模板，适合图片生成、图片放置和基于标注的修改。
- Agent middleware tools：面向 Agent 的结构化自动化能力，用于安全地创建文档、更新记录、插入图片和记录失败。
- 可安装 skill：指导 Agent 正确使用 Canvas 上下文、选区数据、视口快照和图片插入目标。
- 工作区快照：当前视口图片保存到 `files/canvas/documents/{documentId}/snapshots/current.png`；显式版本的图片保存在 `files/canvas/documents/{documentId}/snapshots/versions/`。
- Artifact 分享：Managed Queue 只传 export id；版本化的 `canvas.export` Sandbox Action 通过 Workspace Files 读取权威快照，在 Playwright 中使用 tldraw 渲染，并返回经过完整性校验的 portable file reference。Artifact、ArtifactVersion 与持久链接仍由平台持有；`CanvasArtifactExport` 只保存异步任务状态和执行证据。

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
