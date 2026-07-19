# Cut M1–M8 目标完成审计

> 审计日期：2026-07-16  
> 目标：按 Cut AI 产品路线图完成 M1–M8，并持续通过单测、构建、prepack、插件生命周期及相关 4300 宿主验证。

## 审计结论

**M1–M8 已完成，目标可以标记完成。**

代码、文档、包产物、插件生命周期和真实 4300 宿主均已有直接证据。最终真实宿主验证从 Cut Workbench 提交 revision-bound 后台 MP4，依次经过 Managed Queue、Cut processor、Sandbox Job、`cut.render-mp4@1.0.0` Action 和 Workspace Files，得到可持续读取的 MP4 与报告；Sandbox 临时目录清理后，输入媒体和输出文件仍然存在。

工具面边界固定如下：

- Cut Assistant 的项目发现/持久化、剪辑、字幕、媒体分析、提案和导出全部使用 Xpert middleware tools；
- `cut-ir` MCP 只面向外部客户端，处理调用方显式传入的无状态 Cut IR；
- Cut Assistant 不连接 `cut-ir` MCP，不允许借 MCP 绕过 tenant/org 上下文、`baseRevision` CAS、审阅或目标化宿主事件。

## 逐里程碑证据

| 里程碑 | 必须成立的结果 | 完成证据 | 判定 |
| --- | --- | --- | --- |
| M1 Schema Safety | 共享 `CutProjectDocument` Schema；高级字段往返不丢失 | `src/lib/cut-project.ts`；测试覆盖 transform/effects/mask/transition/audio/text/bookmarks | 完成 |
| M2 Atomic Editing | 窄原子工具、整批验证/应用、revision CAS、目标化宿主事件 | `cut.middleware.ts`、`cut.service.ts`、`cut-host-event.ts`；Workbench 脏编辑保护与增量刷新 gate | 完成 |
| M3 Caption MVP | Server STT、字幕草稿、审阅编辑、SRT/VTT/ASS、取消/重试 | `cut-transcription*`、`cut-caption*`、Managed Queue processors 及对应测试 | 完成 |
| M4 Local Caption | 浏览器 Whisper Worker、缓存、分块进度、取消、草稿复用 | Workbench Worker/WASM、确定性 gate 与真实 Hugging Face JFK smoke | 完成 |
| M5 Intelligence | transcript/audio/shot 证据、精确时间片段搜索与读取 | `cut-media-intelligence.service.ts`、`cut-media-analysis.ts`；4300 实际保存 `Shot 1 00:00.00–00:16.68` | 完成 |
| M6 Rough Cut | 证据绑定 proposal、风险下限、diff/预览/逐项审阅、CAS 应用/安全回滚 | `cut-proposal*`、Workbench proposal UI、服务测试和 `agenticProposalReview` gate | 完成 |
| M7 Production | revision-bound Headless H.264/AAC、模板/变体、Managed Queue、Sandbox Job、产物追踪 | 真实 4300 job `37b7a345-2b99-4a5e-8a6f-ace67a972bed` 一次成功；MP4、报告、checksum、runtime/action evidence 均持久化 | 完成 |
| M8 Ecosystem | 外部 MCP 复用核心 IR/编辑逻辑；不伪造 OpenCut 未发布契约 | 真实宿主初始化 `cut-ir` Toolset；四个 allowlisted tools 全部调用成功；OpenCut adapter 保持 evidence gate | 完成 |

## 真实 4300 宿主证据

### 插件与 Workbench

- 通过“安装插件 → 本地工作区”重载 `@xpert-ai/plugin-cut`；插件页显示 Cut `0.1.0`、6 个 contents、1 个 skill、1 个 MCP server。
- Cut Assistant 打开真实 Workbench 项目“30 秒产品剪辑”，revision `r3`，包含两段视频素材。
- 浏览器媒体理解结果已持久化并重新加载；字幕页显示本地 Whisper、字幕导入和 Sandbox Runtime health。
- Browser 插件最终视觉确认最新两个后台任务均显示 `complete · 100% · 已保存`。

### MCP 外部服务面

- 从 manifest 初始化 `cut-ir` MCP Toolset，`${PLUGIN_ROOT}` 正确解析。
- 真实调用成功：`cut_ir_create_project`、`cut_ir_validate_project`、`cut_ir_apply_operations`、`cut_ir_compare_projects`。
- MCP 服务只返回调用方文档的纯转换结果，没有访问 Cut 数据库、Workspace Files 或平台身份。

### 后台 MP4 闭环

最终成功任务：

- Managed Queue job：`37b7a345-2b99-4a5e-8a6f-ace67a972bed`；`scopeKey=system:global`；`completed`；`attemptsMade=1`；无 `failedReason`；
- Cut domain job：`succeeded`、`progress=100`、无 `errorMessage`；
- Cut export：`0dc12eaa-2ea9-490f-8717-cdf19e9183a4`；source revision `3`；renderer `sandbox-job:cut.render-mp4@1.0.0`；
- MP4：1,216,859 bytes，SHA-256 `f226fd90a1331d5db1d31054714cd24b1894ba4f2b8e4ce6fa4175aebf92bcd6`，识别为 ISO Media MP4；
- 报告：264 bytes，记录 `browser/playwright-1.61/v1`、Sandbox Runtime `1.0.0`、Action `cut.render-mp4@1.0.0`、attempt `1`；
- Sandbox 清理后，MP4、报告和两份输入媒体仍在 Workspace Files；端口 3000/3333 的文件 URL 均返回 HTTP 200 和完整 1,216,859 bytes。

调试过程中发现并修复了真实平台链路中的五个问题：

1. Cut 错把业务资源键放入 Managed Queue `scopeKey`；现改为插件安装 scope `system:global`，tenant/org/user/project 继续使用 envelope 独立字段；
2. 队列失败未回写 Cut domain job；现加入 queued/running 与 BullMQ physical state 对账，暴露 `queue-failed` 和原始失败原因；
3. 历史媒体 reference 缺 tenant/user；现注册时 canonicalize，渲染时安全修复已在当前 tenant-scoped DB 查询中找到的 legacy reference，并拒绝显式跨租户引用；
4. 本地插件热重装替换 runtime 目录后，Sandbox Action cache 仍指向旧路径；现读取失败会使 action identity cache 失效，下次 attempt 从最新 `LoadedPluginRecord` 重新解析；
5. 扁平开发 Volume 把 durable catalogs 与 `runtime-jobs` 共用 `~/data` 根目录，job cleanup 会误删媒体和输出；现即使在 flattened dev layout 中也固定隔离到 `runtime-jobs/<jobId>`。

应用内 Browser 不支持文件选择器上传。为恢复被上述第 5 个缺陷删除的本地测试 fixture，使用本机原文件按数据库记录的精确 size/SHA-256 恢复同一 Workspace Files 路径；最终成功任务及清理后的持久性验证不依赖浏览器缓存。

## 最终门禁

- Cut `pnpm test`：19 个测试套件、71 项测试全部通过；
- Cut `pnpm prepack`：TypeScript、remote component、Sandbox Action、包输出校验和真实 stdio MCP smoke 全部通过；
- Sandbox Action tree SHA-256：`99275677d31fa8953bc5f21fd89bf3234bf0c5b11820b40000d3d97c3f7bac2c`；
- Node 20 `plugin-dev-harness`：register/start/bootstrap/load/destroy/stop/close 全生命周期通过；
- 平台 Managed Queue：5 个测试套件、17 项测试通过；
- 平台 Sandbox Action cache 与 Volume isolation：2 个测试套件、10 项测试通过；
- `pnpm nx build server-ai`：连同 `plugin-sdk`、`server` 等 11 个依赖任务成功；
- 4300 Workbench、真实 Managed Queue/Sandbox Provider、MCP Toolset 四工具和持久化 MP4 均通过。

## 后续非阻塞项

以下属于 M1–M8 完成后的产品演进，不阻塞本目标：

- timestamp-capable STT Provider、speaker/word confidence；
- OCR、画面描述、多模态 embedding 与对象/人物识别；
- 自定义字体、更广编解码器、硬件矩阵与长视频压力基线；
- 粗剪离线评测集、目标时长达成率、信息保留率和人工接受率；
- OpenCut Rewrite 发布稳定 Editor API/MCP/Headless 契约后的正式 adapter。
