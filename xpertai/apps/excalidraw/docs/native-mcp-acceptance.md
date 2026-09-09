# Excalidraw 0.13.0 本地验收记录

验收日期：2026-09-06。插件工作区为 `xpert-plugins/xpertai/apps/excalidraw`；配套宿主为 `xpert`。本次交付包含源码、增量迁移、文档、构建资产与本地安装，没有执行 npm 发布或生产部署。

## 实施结果

- 原生 Provider `excalidraw_tools`、组件 `excalidraw-tools` 注册成功，已安装实例可发现 38 个工具。两个旧中间件分组及 Assistant 引用保留，业务实现集中到装饰器 Provider 和共享服务。
- MCP App `excalidraw_preview` 的实际资源为 `text/html;profile=mcp-app`，383,182 字节。支持中英文、主题、缩放、平移、适应画布、刷新和质量历史，通过授权工具读取 PNG。
- 场景修订、DiagramIR 修订与业务版本分开；持久化操作回执、预览缓存、任务状态和检查点使用增量表/字段，不更换原有 ID 或 Yjs 格式。
- 原生 PNG/SVG 导出和 Mermaid 转换通过插件 Sandbox Action、Managed Queue、Browser Runtime 执行；JSON、图片和导出读取支持无 Assistant/项目的当前用户 Workspace Files。
- 公开分享使用 Publication 授权和工具自身的 `host.input` 确认，保留 Artifact 固定版本、复用与撤销能力，并在真正创建链接前复查修订。

## 验证证据

| 项目 | 结果 |
| --- | --- |
| 插件 Nx 构建、类型检查、测试 | 20 个测试套件、145 项测试通过 |
| 配套 SDK | 完整 29 个套件、156 项测试通过；后续装饰器相关 9 项复验通过 |
| 配套宿主相关回归 | 5 个套件、58 项测试通过，涵盖协议、授权、Workspace Files、Artifact 和协作 |
| 打包 | `verify:dist`、真实 npm tarball 解包校验、Action 文件树哈希和资源检查通过 |
| 生命周期 | `plugin-dev-harness` 的启动、注册、销毁和关闭通过 |
| 原生协议 | 初始化、工具发现/调用、资源发现/读取和标准图片内容验证通过 |
| 绘图闭环 | 创建、批量元素、重复操作回放、冲突输入拒绝、检查点、修改、恢复、JSON 导出、PNG 预览通过，全程无需 Workbench |
| 并发与后台任务 | 并发相同操作只创建一次；不同元素修改保留；旧修订拒绝；相同预览并发去重；Mermaid 冲突保留输出和当前画布；取消结果可重放且不会被迟到结果覆盖 |
| 输出边界 | 旧预览被标记为 stale；原生 SVG 导出及读取通过；无效 Mermaid 转换持久化为 failed，并可读取失败状态 |
| 重启 | 收到 queued 回执后重启选定 API；重启后同一任务为 succeeded，PNG 可读取 |
| 技术图 | 模板实例化、IR 校验/渲染、图片读取、质量历史和视觉复核通过。首次复核发现旧字体问题，修复后同一质量流程复核通过 |
| 分享 | 真实确认成功、拒绝、取消、修订变化、不支持确认的客户端、链接复用及撤销通过；确认超时由宿主协议回归覆盖 |
| 组织权限 | Provider 无隐式项目/工作区过滤；宿主/Provider 覆盖租户、组织和缺失上下文拒绝；本地非成员组织初始化被拒绝；MCP 可编辑同组织 Workbench 创建的图形 |
| 实际 UI 资产 | 安装后的 App 读取真实 MCP 图片；Workbench 接收 MCP 变更，并保留真实编辑器手工新增元素。页面异常计数为 0 |
| 本地安装 | `plugin:deploy:local` 完成，已处理 `restartRequired`，严格环境检查为 ready |

机器可读结果和截图保存在本插件的 `test-output/mcp/`：

- `installed-protocol.json`、`live-workflow.json`：工具、资源和基本绘图闭环。
- `concurrency-workflow.json`、`restart-recovery.json`：并发、取消、冲突及重启后的任务结果。
- `output-edge-cases.json`、`cleanup.json`：输出边界与重复验收数据清理。
- `sharing-confirmation.json`、`quality-review.json`：确认分支和视觉复核历史。
- `installed-app.png`、`app-light-zh.png`、`app-dark-en.png`：MCP App。
- `workbench-collaboration.png`、`workbench-acceptance.json`：实际 Workbench 与 MCP 双向协作。
- `live-preview.png`、`live-quality-corrected.png`：实际场景预览和修复后的技术图质量预览。

## 验收中修复的问题

1. Resvg 无法使用原有 WOFF2 字体，导致质量 PNG 丢失全部文字。改为随包分发固定版本 OTF 字体，并验证英文和中文字符确实产生像素。
2. 并发预览的唯一键异常会使 PostgreSQL 事务失效。改为数据库原子插入去重。
3. 取消排队任务时 Sandbox 作业可能尚未创建。持久化取消后正确处理该状态，阻止后续输出回写。
4. MCP 新版本缺少父图形的工作区归属，Workbench 无法读取。新版本继承图形归属；授权父图形后统一读取其子记录，并兼容旧子记录。
5. 宿主缺少 MCP 请求身份恢复和全局文件/协作/Artifact 能力发现；多阶段确认无法续调；Artifact UUID 与 slug 共用 SQL 参数导致 PostgreSQL 类型错误。均已修复并回归。

测试浏览器为 Workbench 本地 WebSocket 显式授予了本地网络访问权限；这只属于测试浏览器上下文，没有关闭宿主权限或修改生产安全设置。

## 发布前置条件

Excalidraw 仍固定为 0.18.1，Mermaid 转换库固定为 2.2.2。依赖基线保持已发布 SDK 3.18.3、contracts 3.18.2。本地联调使用包含新接口的宿主 SDK 工作区构建。

**正式 npm 发布前，必须先发布包含 `resultFormat: 'tool_result'` 等接口的 SDK，并将插件依赖更新为实际包含接口的版本，同时部署本次配套宿主改动。** 当前的 3.18.3 发布包本身不包含全部新增宿主能力。关闭数据库自动同步的安装需先执行 `migrations/20260906-native-mcp.sql`。

本地验收复用了经授权的现有 PostgreSQL 与 Redis。所有文件均使用当前已认证用户身份，没有切换为其他主体；测试凭据只保留在 Node 进程内，不写入 App、截图或验收结果。

已归档 16 个重复的专用验收图形，保留最终协作图形、并发样例、基础闭环和技术图样例供查看。宿主启动生成的无关锁文件及 Knowledge Workbench 资产差异已还原。
