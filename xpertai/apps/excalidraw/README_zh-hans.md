# Excalidraw for Xpert

[English](./README.md)

Excalidraw for Xpert 是面向 Xpert 的多人协作 Agentic 图表产品，将 AI 辅助创作、多人实时编辑、可编辑 Excalidraw 画布、安全 Artifact 分享、技术图模板、版本历史和人工审阅整合到同一个工作空间中。

用户与智能体操作的是同一份图形，而不是在静态图片之间反复传递结果。用户可以在 Workbench 中自由编辑，智能体则能够读取当前图形和选区、添加或修补元素、重新组织场景、创建版本，或者生成一份仍可在 Excalidraw 中继续编辑的结构化技术图。

## 在 Explore 中启用应用

0.14.0 随包提供实际工作台截图，用于 Explore 应用卡片和详情页的预览。

从 0.13.1 起，插件通过 `targetAppMeta.xpert.marketplace.contents` 注册 `excalidraw` 应用及类型化 `appConfig`，提供中英文介绍、功能说明和初始化入口。管理员在 Explore 中打开 Excalidraw 后，平台检查当前组织的语言模型，并创建专用的组织共享工作空间，安装 `excalidraw-assistant` 模板及其依赖，然后发布助手对话入口。绘图应用无需额外的知识库、嵌入模型或知识库视觉模型。

技术图助手模板 `excalidraw-technical-diagram-assistant` 继续独立提供，可按需安装。MCP 服务的 Publication 和凭据由平台单独管理；启用应用不会扩大 MCP 权限。已授权的 MCP 客户端可以访问当前组织内不同项目的图形，包括公开分享在内的工具按应用策略直接执行。

插件部署使应用配置生效；首次组织初始化和已有助手的模板升级由平台分别管理。重复初始化复用平台记录，升级健康的已有助手请使用“从模板更新”。

## 为什么使用 Excalidraw for Xpert

常见的 AI 图表生成结果往往难以修改、重复生成不稳定，或者与实际审阅中的文档脱节。本插件保留 Excalidraw 的自由编辑体验，并为技术图增加一套可选的质量工程流程：

- **通过自然语言创作** —— 描述流程、架构、交互、Agent 系统或白板想法，让 Assistant 生成第一版可编辑图形。
- **在熟悉的画布上继续编辑** —— 使用 Excalidraw 原生的选择、绘制、文本、样式、移动、缩放和直接操作能力。
- **多人实时共编** —— 多位用户通过 Yjs 同步共同编辑同一图形，并看到在线身份、选区和远程光标。
- **以受控 Artifact 对外分享** —— 将当前图形发布为自包含的只读 Excalidraw 页面，选择公开、组织或工作区访问，并可复制或撤销平台管理的链接。
- **让智能体理解当前上下文** —— Assistant 可获得当前图形、版本、选中元素和未保存状态，优先修改真正目标场景。
- **按任务选择结构化程度** —— 自由绘图使用 Excalidraw scene tools；需要稳定复现的技术图使用 DiagramIR。
- **从成熟模板开始** —— 使用 10 个内置模板快速创建常见系统图与 AI 架构图。
- **交付前完成质量检查** —— 确定性校验和 PNG 视觉审核能够发现重叠、裁切、连线路由和标签问题。
- **保留有意义的历史** —— 显式保存版本、恢复历史结果，并防止智能体静默覆盖人工修改。

## 产品体验

### Excalidraw Workbench

Workbench 是图形的主要可视化工作界面，提供：

- 图形搜索、筛选、归档和删除，以及统一“新建”菜单中的新图形/新版本操作
- Excalidraw 原生画布编辑
- 自动多人协作会话、协作者在线状态、远程光标和按元素独立合并
- 当前场景保存与显式版本检查点
- 版本历史、历史恢复和审阅状态
- Excalidraw JSON 导入，以及 JSON、PNG、SVG 导出
- 交互式 HTML Artifact 发布，支持应用授权的公开链接、组织/工作区访问、稳定链接复用和撤销
- 在支持的情况下将 Mermaid 草稿转换为可编辑场景
- 模板搜索、分类和标签过滤
- 模板参数表单、缩略图预览和“从模板新建”
- DiagramIR revision、校验问题、视觉审核和 synced/diverged 状态
- 当 Agent 或 IR 渲染可能替换本地改动时保护未保存场景
- Xpert 宿主主题和 Assistant 选区上下文集成

### Excalidraw Drawing Assistant

通用绘图 Assistant 面向灵活的图形创作，可以：

- 新建和搜索图形
- 分批添加便于审阅的 Excalidraw 元素
- 读取当前图形或指定场景元素
- 执行定向元素修补或保存完整场景
- 创建和优化 Mermaid 草稿
- 保存版本、更新图形状态并记录可恢复失败

该 Assistant 不强制使用 DiagramIR，适合流程图、线框图、标注、头脑风暴和自由白板。

### Excalidraw Technical Diagram Assistant

技术图 Assistant 默认启用一个 Technical Diagram Engine middleware 和一个 Technical Diagram Engineering Skill。该引擎将模板、DiagramIR 和质量工具合并到同一个对话开关中，并执行一条受控流程：

1. 搜索并检查内置模板。
2. 实例化模板，或将需求建模为 DiagramIR。
3. 执行确定性布局和正交路由。
4. 校验语义结构与解析后几何。
5. 渲染新的原生 Excalidraw 版本。
6. 创建 SVG 和 PNG 质量预览。
7. 记录视觉审核，并最多执行两轮定向修正。

它适用于架构图、数据流、时序交互、对比视图、RAG 系统、Agent 工作流、记忆系统和微服务平台。

## 两种绘图模式

| 模式 | 适用场景 | 工作方式 |
| --- | --- | --- |
| 通用 Excalidraw | 白板、线框图、快速流程、标注和创意布局 | 智能体直接操作 Excalidraw scene elements，用户可以在任意位置自由编辑。 |
| 技术图 DiagramIR | 架构、系统流程、时序图、Agent 系统和可重复生成的文档图 | 智能体先建立语义节点和边，再执行确定性布局、校验、渲染和视觉审核。 |

两种模式可以在同一个插件中按需使用，但 DiagramIR 不会将任意 Excalidraw 场景反向编译为 IR。用户手工修改 IR 渲染后的场景时，系统会将其标记为 `diverged`；只有用户明确确认替换后，才能再次从 IR 渲染。

## 内置技术图模板

首批模板包含 5 个通用结构和 5 个领域配方：

| 分类 | 模板 |
| --- | --- |
| 通用结构 | 分层架构、流程图、时序交互、径向概念图、对比矩阵 |
| AI 与系统配方 | RAG Pipeline、Agent Tool Loop、Multi-Agent Collaboration、Memory Architecture、Microservices Platform |

每个模板都包含中英文元数据、参数 Schema、安全默认值、缩略图、受信任的插件内构建器，以及中英文示例。模板数据不能执行表达式或脚本。

## 图表质量与视觉审核

技术图引擎检查的不只是场景能否打开，还会报告：

- 重复 ID 和失效引用
- 画布或分组越界
- 节点重叠和可能的文本溢出
- 箭头穿越无关节点
- 边标签和节点的碰撞
- 过多的连线交叉
- 无效或过期的 revision

SVG、PNG 预览与 Excalidraw elements 来自同一份解析后几何。PNG 使用 `@resvg/resvg-js` 和插件内置的 Noto Sans SC 渲染，因此中英文预览不依赖系统 Cairo，也不会请求外部字体。

视觉审核结果可以记录为 `passed`、`needs_revision` 或 `skipped`。需要修改时，必须指出目标节点或边 ID，并说明具体修正意图。两轮修正后仍未通过的 quality run 会进入 exhausted 状态，并交还用户审核。

## 版本与编辑安全

图形和 DiagramIR revision 按租户、组织、工作空间/项目和 drawing 隔离。

- 场景保存和显式检查点保留 Excalidraw 历史。
- 日常协作修改只更新平台权威的 Yjs working scene，不制造大量业务版本；“新建版本”仍是显式检查点。
- DiagramIR 修改通过乐观 revision 检查拒绝过期写入。
- 从 DiagramIR 渲染始终创建新的 Excalidraw 版本。
- Workbench 手工保存和直接 scene mutation 会把关联 IR 标记为 `diverged`。
- 重新渲染已分叉图形必须得到用户明确确认。
- 将模板应用到当前图时会创建新版本并整体替换，不支持模板合并。

## 多人协作与 Artifact 分享

插件直接使用 Xpert 平台能力，不维护第二套会话系统。平台负责协作文档、更新序列、Presence、浏览器短期凭据和 Socket 传输；插件负责版本化的 Excalidraw Yjs Schema、作用域授权、初始状态和到图形业务记录的物化。

协作文档以稳定 element ID 保存元素，显式保存元素顺序，并将 app state、内嵌文件和 Mermaid source 放在独立 Yjs 结构中。不同元素上的更新可以独立合并。创建版本、恢复、导出和分享等强一致操作，会先与平台权威文档完成同步。

Artifact 分享会物化权威协作场景，并发布一份包含原生只读 Excalidraw Viewer 的自包含 HTML 页面。页面支持平移、缩放和适应画布，不访问私有 API 或外部资源；随后写入限定作用域的 Workspace Files，并注册为交互式 Xpert Artifact。Workbench 不自行拼接分享地址，只使用平台返回的 URL。工具按应用策略授权公开链接；Workbench 保留显式分享界面。内容和访问策略未改变时会复用当前链接。

## 文件与输出

| 方向 | 格式 | 使用体验 |
| --- | --- | --- |
| 导入 | `.excalidraw`、Excalidraw JSON | 作为新图形打开，或确认后替换当前场景。 |
| 草稿输入 | Mermaid | 将 Mermaid 草稿转换为可审阅并可继续编辑的场景。 |
| 导出 | Excalidraw JSON | 保留可编辑场景数据。 |
| 导出 | PNG | 从当前画布生成便于分享的位图。 |
| 导出 | SVG | 从当前画布生成可缩放矢量图。 |
| 分享 | Excalidraw HTML Artifact | 发布可控访问、可撤销的交互式只读图形页面。 |
| 质量证据 | SVG、PNG | 将技术图质量预览写入 Xpert Workspace Files。 |

## 插件包含的能力

- Excalidraw Workbench Remote Component
- 支持 Presence 和 Excalidraw 原生协作者渲染的平台 Yjs collaboration provider
- 用于受控交互式 HTML 分享的平台 Artifact 与 Workspace Files 集成
- Excalidraw Drawing Assistant 模板
- Excalidraw Technical Diagram Assistant 模板
- Excalidraw Agent Skill
- Technical Diagram Engineering Skill
- 通用 Excalidraw Agent middleware
- 可独立选择的 Technical Diagram Engine middleware，统一提供模板、DiagramIR 和质量工具
- 带版本的图形和 DiagramIR 持久化
- 10 个内置技术图模板
- 可供其他文档插件参考的 artifact-template catalog 与 adapter contracts

## 典型工作流

### 灵活绘图

1. 打开 Workbench，或让 Drawing Assistant 新建图形。
2. 描述需要的内容，让智能体添加可编辑元素。
3. 直接在画布中调整，或继续要求智能体执行定向修改。
4. 在重要审阅节点保存版本。
5. 导出 JSON、PNG 或 SVG。

### 模板化技术图

1. 让 Technical Diagram Assistant 创建架构图或工作流图。
2. 选择建议模板并填写参数。
3. 审阅确定性生成的 Excalidraw 结果。
4. 检查校验报告和 PNG 质量预览。
5. 通过结果，或要求执行定向修正。
6. 结构化流程完成后，继续在画布中人工编辑。

## 开发与验证

在 `xpert-plugins` 仓库根目录执行：

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-excalidraw
pnpm -C xpertai exec nx build @xpert-ai/plugin-excalidraw
NODE_PATH="$PWD/xpertai/node_modules/.pnpm/node_modules" \
  node plugin-dev-harness/dist/index.js \
  --workspace ./xpertai \
  --plugin @xpert-ai/plugin-excalidraw
```

构建和测试会将固定版本的质量预览字体准备到 `dist/assets/fonts/`。首次运行下载并校验文件大小与 SHA-256，后续运行校验并复用缓存；Git 仅保存来源清单、许可证与说明。CI 可通过 `XPERT_EXCALIDRAW_FONT_CACHE` 指定绝对缓存目录，设置 `XPERT_EXCALIDRAW_FONTS_OFFLINE=1` 则要求预先存在校验通过的缓存。发布包包含字体，运行时无需下载。详见[字体来源与构建说明](assets/fonts/README.md)。

多人协作要求 Xpert Collaboration runtime capability；Artifact 分享要求 Artifacts 和 Workspace Files runtime capabilities；质量预览同样依赖 Workspace Files。

## 许可证与来源说明

本插件使用 [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) 许可证发布。

技术图分类和工作流规范参考了 [`yizhiyanhua-ai/fireworks-tech-graph`](https://github.com/yizhiyanhua-ai/fireworks-tech-graph)，具体来源 commit 记录在 `skills/NOTICE.fireworks-tech-graph.txt` 中，并遵循上游 MIT License。本插件使用 Excalidraw 原生主题和自有 TypeScript/Resvg 渲染链，不复制上游 Python/Cairo runtime。

## 原生 MCP 工具与交互预览（0.13）

在插件管理的 MCP 服务中启用 **Excalidraw**，通过 Xpert 提供的 Publication 地址和用户绑定组织凭据连接客户端。Provider 为 `excalidraw_tools`，组件为 `excalidraw-tools`。Publication 控制工具访问；每次调用还会校验租户、组织和调用主体。MCP 可以操作当前组织不同项目中的图形，无需打开 Workbench，也不依赖 Assistant 或对话上下文。

建议调用顺序：

1. 使用 `excalidraw_search_drawings`、`excalidraw_get_drawing` 获取图形摘要、场景修订和分页元素引用，再通过 `excalidraw_get_scene_item` 读取具体项。
2. `excalidraw_create_drawing` 仅创建元数据，再用 `excalidraw_add_elements` 小批量添加元素。MCP 操作已有图形必须明确传入 `drawingId`。
3. 每次修改传入稳定的 `operationId`。中断后用同一标识和相同输入重试；同标识不同输入会被拒绝。整体替换、删除和恢复需要读取当前场景并传入 `expectedRevision`。
4. 预览、无界面 Mermaid 转换和导出返回持久化 `jobId`、`cursor`。用 `excalidraw_wait_job` 有界等待，每次最多 45 秒，直到 `terminal`；重连后用 `excalidraw_get_job` 恢复，也可用 `excalidraw_cancel_job` 取消。不要通过重复提交来轮询。
5. 完成后用 `excalidraw_read_preview` 获取标准 PNG 图片内容。JSON、SVG、PNG 导出及冲突后保留的转换 JSON 通过 `excalidraw_read_export` 分页读取 base64，按 offset 顺序拼接、解码并验证 SHA-256。
6. `excalidraw_save_scene_version` 保持旧行为：更新当前工作场景。显式保存历史使用 `excalidraw_checkpoint_version`，历史列表和恢复分别使用 `excalidraw_list_versions`、`excalidraw_restore_version`。检查点保持冻结，其后首次修改会创建工作版本。

场景修订、DiagramIR 修订和业务版本号是独立计数器。`excalidraw_diagram_validate` 会写入新的 IR 修订，后续技术图工具应使用返回的 `irRevision`。技术图流程为：模板实例化或创建 IR → 编辑 → 校验 → 渲染 → 创建质量预览 → 读取 PNG → 记录视觉审核。每个质量任务最多允许两轮纠正。质量预览明确标注对应的 IR 修订，不能冒充当前人工编辑场景的预览。

`excalidraw_preview` MCP App 提供缩放、平移、适应画布、刷新、版本信息和质量结果，支持简体中文、英文与宿主明暗主题。App 不接收私有文件路径或凭据，也不使用 Web Storage。普通 MCP 客户端仍能使用工具、文本和标准图片结果；手工绘图继续使用 Workbench。

### 渲染、分享与宿主升级

原生预览及 Mermaid 转换由插件 `excalidraw.render@1.0.0` Sandbox Action 执行，运行时为 `browser/playwright-1.61/v1`。Action 固定 Excalidraw 0.18.1、Mermaid 转换库 2.2.2 和随包字体，浏览器不访问外部资源。需要可用的 Browser Runtime Binding 和 `sandbox-browser` Managed Queue 消费者；缺少运行时或认证文件身份时返回明确错误。JSON 导出不依赖浏览器。任务、输出引用、校验值和失败状态均持久化。预览缓存包含租户、组织、图形修订、渲染版本和调用主体；Mermaid 转换遇到场景冲突时保留输出，不覆盖期间的修改。

所有写工具及公开分享声明 `mcp.defaultApprovalMode: allow`。自动创建或同步 Publication 时，没有管理员显式覆盖的工具采用该默认策略；显式策略仍优先。工具不调用 `host.input`，公开分享通过可信 `publicLinkAuthorization: application_policy` 授权，不伪造用户确认。主体范围、修订检查、幂等、链接复用与撤销仍执行。无项目或 Assistant 时使用当前认证用户的 Workspace Files。

依赖基线为已发布 SDK 3.18.3、contracts 3.18.2。本次源代码还需要同步宿主 SDK 的 `resultFormat: 'tool_result'` 与严格对象交叉字段校验支持；本地联调使用宿主工作区构建。**npm 发布前必须把依赖版本更新为实际包含这些接口的已发布版本。** 旧宿主会在插件注册时收到明确升级错误。

关闭数据库自动同步的环境应先执行 `migrations/20260906-native-mcp.sql`。迁移只新增操作回执、渲染任务表和检查点字段，保留现有图形 ID、表名、历史及 Yjs 场景映射。Workbench 详细日志默认关闭，仅由宿主 `init.debug.enabled` 开启；中间件诊断可通过 `XPERT_EXCALIDRAW_DEBUG=true` 开启。

交付验证使用 Nx 构建和测试、`verify:dist`、实际打包及 `plugin-dev-harness`，随后通过 `plugin:deploy:local` 安装；出现 `restartRequired` 时重启选定宿主并验证真实 MCP 调用。npm 发布与生产部署是后续步骤。

本地宿主使用 MCP `2026-07-28`，同时接受旧版 `2025-11-25` 调用。Excalidraw 默认直接执行，两种协议均不依赖 elicitation。管理员显式设置 `confirm` 后才需要支持交互确认的客户端。`defaultApprovalMode` 和 Artifact 应用授权需要配套升级宿主 contracts 与 plugin SDK；已发布 SDK 3.18.3 尚未包含这些新增接口。

通过 MCP 调用 `excalidraw_diagram_render` 时需同时传入 `expectedRevision`（DiagramIR）和 `expectedSceneRevision`（画布）。替换前重新读取图形以获取画布修订。

宿主配套修改还包括用户身份恢复、Workspace Files/Collaboration/Artifacts 的全局运行时发现，以及 Publication 确认后继续进行工具自身确认的能力。技术图质量 PNG 使用随包分发的 Noto Sans CJK SC 2.004 OTF 字体（OFL 许可）；原生画布渲染仍使用固定版本 Excalidraw 字体。

本地验收脚本从宿主 Keychain 登录助手读取身份，不记录凭据。先启用当前组织的 MCP 服务，再设置 `XPERT_HOST_CHECKOUT`、`XPERT_API_URL`、`XPERT_ORGANIZATION_ID`。`scripts/smoke-native-concurrency.mjs` 验证真实并发、重复预览、Mermaid 冲突和取消；`scripts/smoke-installed-workbench.mjs <playwright-core目录>` 还需要 `XPERT_ASSISTANT_ID`，会创建专用验收图形并验证人工编辑与 MCP 同步。验收客户端不声明 elicitation，遇到确认请求即失败；分享验收同时覆盖旧协议连接。截图和脱敏结果写入 `test-output/mcp/`。

每个工具都在 `content.text` 与 `structuredContent` 中返回相同的精简 JSON，兼容只透传文本的客户端。保留 ID、修订号、URL、变更元素 ID 和可修正的校验问题。Schema 错误指出字段路径，DiagramIR 失败返回具体目标及原因。运行 `scripts/smoke-text-client.mjs` 验证完全不读取 structuredContent 的调用闭环。

工具返回 `resultStatus: "unavailable"` 时，表示详细结果未能完整返回。保留回执中的业务状态和标识，读取对应图形/任务，或使用相同参数和 `operationId` 重试；不要为补取结果创建新的写操作。输出转换统一由 SDK 校验和恢复，保留 MCP 协议校验。
