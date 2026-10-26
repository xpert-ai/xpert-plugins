# Spaces Spreadsheet 交付与验证记录

日期：2026-10-26。实现方案见 [PLAN](PLAN_spaces_spreadsheet_20261026.md)。

## 实现范围

复用现有 office-editor、Univer 0.25.0、OfficeDocument/OfficeSnapshot、Project 文件能力和 Office AI 工具，增加原生 Spreadsheet 资源实现。没有新增插件、升级 Univer、引入 Pro、添加数据回填或为 Spaces 写 Spreadsheet 特判。Docs、Slides 和 XLSX 文件模式保留原有路径。

- `src/lib/workbooks`：模型校验、受限原生表格操作、统一 CAS 写入服务、ContentResourceProvider、资源编辑器、Remote View 和测试。
- `remote-workbook`：共享 Univer 引擎、显式保存、冲突草稿保护、重新加载确认和本地 JSON 下载；复用共享 shadcn、i18n 和宿主主题桥接。
- Office 服务与 middleware：现有创建/读取/编辑工具转到同一资源写入协议；原有 Yjs/无版本快照/操作队列/XLSX 还原接口拒绝写入新模型。
- 公共 Chatkit 修正：宿主回传同一资源地址时，不再要求已挂载标签保存；替换资源、关闭和显式 reload 仍执行保存检查。修改位于 chatkit-js 的 `useHostedWorkbenchNavigation`，附回归测试及 patch changeset。未增加业务类型判断。
- 新增 office-editor minor changeset。未暂存、提交或推送；保留其他任务原有暂存内容。

## 数据、身份与协作

| 字段 | 值 / 语义 |
| --- | --- |
| typeId | `xpert.spreadsheet`，跨具体实现的通用类型 |
| modelId / schemaVersion | `office-editor.univer-workbook` / `1`，完整 Univer 0.25.0 原生 JSON |
| editProtocol | `office-editor.snapshot-cas@1`，整份快照版本比较与交换 |
| implementationKey | `office-editor.univer` |
| editorKey | `office-editor.univer-workbook`，resource editor protocol v2 |
| provider / view | `office-editor.workbooks` / `office.workbooks__office.workbook` |
| 权限 | 可信当前用户 + Project；读、写、管理分别服务端检查 |
| catalog 操作 | 发现、描述、创建、重命名、复制、回收、恢复、文本提取与源文件修复 |

`contentId` 是平台目录身份；`resourceId` 是 OfficeDocument/Univer workbook ID。平台解析后携带两者、编辑器和 Project 上下文，在当前 Workbench 内打开。打开不重复导入、不重新创建工作簿。

唯一可写权威为已提交的 OfficeSnapshot 与 OfficeDocument head。Project 文件保存每次提交的完整 JSON：

```text
.xpert/spreadsheets/<resourceId>/revisions/<revision>-<sha256>.json
```

事务锁定资源并检查 expectedRevision，先写不可变文件，再提交快照、head 和幂等操作记录。文件写失败则不推进数据库版本；文件成功但数据库未提交只留下未引用文件。相同请求重试复用相同内容。catalog reconciliation 能恢复缺失文件；同路径被修改会报冲突而不会覆盖。数据库与项目文件需一起备份，本期没有从任意 JSON 覆盖现有资源的恢复入口。

创建、复制使用稳定 UUID；请求身份与意图绑定。人类与 Assistant 保存都使用同一版本检查和行锁；过期写入返回 409。干净客户端每 10 秒读取新版本；有本地编辑的客户端保留草稿并提示冲突。新模型不使用原有 Yjs 整份 snapshot register，**不宣称实时单元格协作、自动合并、离线编辑或实时光标**。

XLSX 是另一条已有文件编辑链路，本次没有将新资源转成 XLSX 再保存。现有转换不能保证图表、图片、透视表、宏、数据校验、外部连接和复杂格式无损；不得以 XLSX 导出作为原生资源无损备份。AI 原生工具支持值、公式、清除范围和新增工作表；工作表重命名/删除以及共享/数组公式组需通过 Univer 编辑，避免破坏引用。AI 修改后的计算缓存可能过期，由 Univer 打开后重算。

## 自动验证

| 检查 | 结果 |
| --- | --- |
| office-editor `pnpm test` | 11 suites / 46 tests 通过，含服务端和 Remote View 类型检查、生成 bundle 一致性检查 |
| office-editor `pnpm build`、`pnpm typecheck` | 通过；复用当前本地平台 contracts/plugin-sdk 构建 |
| metadata checker | 通过 |
| plugin-dev-harness | 注入加载、onStart、onPluginBootstrap、onPluginDestroy、onStop 完整通过 |
| Chatkit 导航定向测试 | Node 24.22.1 / pnpm 10.11.0，8 tests 通过，包含同资源地址回传与显式 reload 的区别 |
| Chatkit 类型检查、Vite app build | 通过，保留已有大 bundle 警告 |
| Chatkit 根 `pnpm test` | UI 299/300 suites、2197/2198 tests 通过；现有 PptxEditor 测试出现一次找不到 Text 输入框的失败，单独复跑 4/4 通过；完整运行不能记为全绿 |
| Nx 统一入口 | 被 workspace 中无名称的 vendored 项目配置阻断，使用上述包脚本完成检查 |

没有宣称远程 CI 已通过。Office 检查使用 Node 22.22.0；Chatkit 公共改动按其 CI Node 24 运行。未改动 package lock 或 Univer 依赖。当前注册资源 API 尚需平台本地 SDK 版本；正式发布前应同步发布包含这些接口的 SDK，不能只安装旧 registry `3.21.0` 后宣称可独立构建。

## 真实环境验证

本地隔离 API `localhost:3000`、前端 `localhost:4200`、PostgreSQL `spaces_phase1`。使用已有测试账号正常登录，权限调整走 Project API 并在 finally 恢复；没有伪造 JWT 或直接写数据库业务数据。

测试 Project：`8ae4bf12-ffa1-447b-820f-f19568176a03`。

真实 AI 验收在本地测试 Assistant 的既有配置中增加了 OfficeEditorMiddleware 并通过正常发布接口生效，使用已有 qwen3.7-plus 模型配置；原配置备份保存在隔离环境的 `office-workbook-assistant-before.json`。没有修改模型密钥或扩大项目成员权限。

| 验收项 | 实际证据与结论 |
| --- | --- |
| 分类发现、创建、内部打开 | 浏览器 Spaces 显示“电子表格”，新建菜单发现 Univer 实现；创建后在当前 Chatkit 打开 Office workbook。manifest 使用通用 projectResource activation |
| 值、公式、工作表、保存/刷新 | 浏览器输入 A1=12、B1=30、C1=`=SUM(A1:B1)`，显示 42；添加第二张“工作表1”，写入中文文本与 88；保存到 revision 2，刷新重开同一 ID，内容保留 |
| 资源与文件一致 | 实际读取 Project JSON 的 sha256、documentId、revision、完整 workbook 与 DB 服务返回一致；目录 contentId 指向同一资源 |
| 创建幂等 | 同一请求并发重试得到同一 contentId；同一 requestId 改标题返回 409 |
| 保存幂等与旧版本 | 同请求重试无额外版本；旧 revision 及改意图重试返回 409 |
| 双人版本协作 | 两个真实成员通过各自 Assistant 同时提交同一 revision，实际结果 201/409，保留唯一成功提交 |
| 只读/非成员 | 实际只读成员读出 canWrite=false，写入 403；非成员 403；仍能访问 Assistant 但撤销 Project 成员后读取也 403，之后恢复成员 |
| 文件失败与恢复 | 真实暂时禁止测试 revision 目录写入，保存失败且 head 不变；恢复权限后相同请求成功；移走已提交源文件，catalog 报 failed 后后台恢复相同字节及原 revision |
| 生命周期 | 实际复制幂等且身份独立；重命名、回收、恢复通过，回收状态拒绝编辑器读取 |
| 真实 Assistant | qwen3.7-plus 调用已有 Office read/edit 工具，将第一本 B2 改为 77，revision 2→3，公式和第二张工作表保留；旧的人类保存实际 409 |
| 人类冲突处理 | 浏览器保留 A2 本地草稿，显示“已有新版本，本地修改已保留”；确认重新加载后见 B2=77；重新填写 A2 并保存到 revision 4，API 再读确认两者及公式同时保留 |
| 两本身份/标签 | 浏览器同时出现两本不同标题的 Workbench 标签与独立空白编辑器；API 对第二本修改不会改变第一本快照或 revision。完整双标签未保存草稿复测尚未完成，见下文 |

第一本“Spreadsheet 浏览器验收 20261026”：resourceId `0dd2d489-af97-4d71-b30a-9e005ac4c7c5`，contentId `76f7f00d-6391-4491-bd07-d577bf8600f1`。第二本“Spreadsheet 双标签隔离验收”：resourceId `91515d74-5126-4aa6-91a2-ec92fc60d029`，contentId `bfa11b42-7292-4849-97bd-95cd6098c88d`。

本地原始证据在 GitHub 工作区下 `.xpert-local-environment/spaces-phase1/`（未入库）：`office-workbook-api-results.json`、`office-workbook-acl-results.json`、`office-workbook-recovery-results.json`、`office-workbook-agent-results.json`、`office-workbook-browser-final.json`、`office-workbook-isolation-results.json`；冲突截图为 `evidence/office-workbook/assistant-conflict.png`。真实 AI 调用流和测试脚本亦保留在该隔离目录。截图与认证信息不进入插件提交。

## 尚未完成的验收与限制

1. 最后一轮浏览器控制连接中断，重置和重连仍失败。公共导航修正已构建并部署，但修正后的浏览器回归、同本重复打开定位已有 dirty 标签、两本同时保留未保存编辑、第二本浏览器保存与双标签刷新恢复尚未完成。不能用 API 或单测代替这些 UI 验收。
2. 测试项目目录刷新曾超过远程视图超时；第二本创建实际成功，但创建对话框未完成打开。随后通过电子表格分类找到并打开了同一资源，没有重复创建。需在浏览器恢复后复测创建→刷新目录→打开的稳定性，并定位公共目录耗时。
3. 双账号权限和并发为真实认证 API 验证；尚未在两套浏览器登录上下文完成只读 UI 与双人 UI 同时操作。人与 Assistant 的浏览器草稿冲突已实际验证。
4. 未完整验收暗色/所有 density/radius/语言组合、巨型工作簿性能、故障发生在数据库提交后的进程崩溃、全量灾备恢复或知识库索引查询。已有 Docs/Slides/XLSX 自动回归通过，本轮没有重新完成这些类型的全套浏览器验收。
5. 本期不提供原生 Spreadsheet 的 XLSX 导入导出、单元格实时合并、未保存刷新恢复或自动冲突合并。

浏览器恢复后的最小复测：刷新前端加载新的 Chatkit bundle → 第一本文档编辑 A3 不保存 → 从 Spaces 打开第二本并编辑保存 → 再点第一本目录项确认只定位原标签且 A3 保留 → 保存后刷新 → 核对两本分别的值、公式、工作表及 contentId；最后重复新建并确认无需再次点击目录项即可打开。

## 顶部信息压缩与真实页面复验（2026-10-26）

工作簿顶部改为单行：标题、简短状态、保存和更多操作。共享 shadcn HoverCard 展示完整标题、版本、协作语义及错误详情，支持鼠标悬停、键盘焦点和点击；下载 JSON、重新加载收进 DropdownMenu。重新加载仍使用 AlertDialog 确认丢弃草稿。所有新增文案集中在中英文语言资源，控件使用共享组件默认尺寸，布局间距沿用宿主密度变量。

插件通过现有 Remote View `notify` 协议发送错误。Chatkit Workbench 将宿主和插件通知统一呈现为 shadcn/Sonner Toast，不再插入占用高度的横幅。每个 Workbench 使用独立通知 outlet；旧 Toast 的延迟关闭不能清掉新消息。同一持续轮询错误不会反复弹出，错误详情及未保存/新版本状态仍可从工具栏访问。

本轮已部署到本地隔离环境并真实验证：

- 当前宿主根字体保持 14 px。原工具栏与协作说明合计 67.375 px，调整后 31.5 px；出现保存冲突或关闭未保存标签的错误 Toast 时仍为 31.5 px。
- HoverCard、更多菜单、重新加载确认均可操作。第二本工作簿在浏览器新增临时工作表，另一真实成员通过同一保存 API 提交新 revision，浏览器旧版本保存被拒绝并显示 Toast，临时工作表和 dirty 标签标记保留。
- 点击关闭 dirty 标签触发宿主“文档尚未保存”Toast，未关闭标签。最终通过确认重新加载丢弃本轮临时草稿；服务端快照与测试前完全一致，仅增加一次版本验收提交。
- 第一本文档重新定位后值 12、30、42、77 及两张工作表可见。截图在隔离目录 `evidence/office-workbook/compact-toolbar-details.png` 和 `compact-toolbar-conflict.png`，测量与结果见 `compact-toolbar-results.json`，均不进入插件提交。
- Office 46 项测试、类型检查、构建、metadata checker 与生命周期 harness 通过；Chatkit 13 项定向测试、类型检查、Vite app build 通过。通知测试覆盖多 Workbench 隔离、过期回调及 light/sharp/compact → dark/round/spacious 主题切换。本轮未重跑 Chatkit 根完整测试套件，前述全量结果仍按其原范围记录。

本轮浏览器连接已恢复并完成以上界面验证，但不能据此将前述所有待验收项标记完成。JSON 下载按钮已触发，浏览器工具等待下载回执超时，未核验下载字节；本次未改动下载实现。

## 单行 Bar 与统一组件风格（2026-10-26）

标题、菜单页签、状态、保存及更多操作合并为一行。外围控件统一使用共享 shadcn Tabs（line 变体）、Button、HoverCard 和 DropdownMenu；整行字体、字号、字重、颜色及布局密度继承主题变量，保留组件默认交互样式。

通过 Univer 的公开 `CUSTOM_HEADER` 插槽组合页眉，使用 React portal 保留插件的国际化和状态上下文。`workbook-ribbon.ts` 从公开 `IRibbonService` 订阅菜单、激活状态和上下文页签，从 `LocaleService` 获取翻译；没有硬编码“开始/公式/数据”列表。下方格式工具栏继续使用公开的原生 `Ribbon` 组件。Univer 0.25 通过服务切换页签时不会清空内部工具宽度缓存，因此仅按激活页签重建 Ribbon，导航栏、工作簿、画布和编辑草稿保持挂载。其他 Office 编辑器沿用原来的默认配置。

真实浏览器验收：

- 宿主根字体 14 px 时，原来的两行合计 63 px，合并后 31.5 px。标题、页签、状态和按钮均为 12.25 px、500 字重，字体来自宿主变量。
- 1083 px 全宽和 480 px 分栏均保持单行；窄栏收起状态文字，完整状态仍可访问。没有元素重叠或页签区域的多余滚动条。
- 鼠标切换、连续方向键切换及焦点保持通过。480 px 下“开始→公式→数据→开始”前后的原生格式工具图标完全一致，修复了旧组宽度缓存引起的错误收纳。
- 浏览器将 A1 再次输入原值 12，切换页签后仍保留待保存状态；真实保存成功到 revision 6，HoverCard 显示该版本。更多菜单及重新加载通过，值 12、30、42、77 和两张工作表保持可见。
- Office 47 项测试、类型检查、构建、bundle 一致性、App 配置、metadata 检查和插件生命周期 harness 通过。新增菜单适配测试覆盖动态/上下文菜单、双向激活、语言切换及销毁后取消订阅。

本轮最终截图和几何测量位于隔离环境的 `evidence/office-workbook/unified-bar.png`、`unified-bar-narrow.png` 和 `unified-bar-results.json`，不进入插件提交。本轮不扩大前文对暗色/所有密度组合、其他 Office 类型完整浏览器验收的覆盖声明。
