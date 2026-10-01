# DB Studio Agentic App 开发交接

更新日期：2026-09-15。本文对应用户要求暂停本轮开发并交接给另一个 Codex 时的工作区状态。

## 1. 当前结论

已经完成跨三个仓库的第一版代码实现：共享数据源工作台契约、宿主授权入口、Doris／MySQL／PostgreSQL 适配、DB Studio 服务与 Remote View、三个 Agent 中间件和 Assistant 模板。

**这不是已经完成验收的成品。** 工作台在模拟宿主、真实构建资源及禁止 Web Storage 的 iframe 中跑通过；尚未安装到实际平台，尚未完成 Assistant 初始化／发布图核验，也没有连接真实 Doris 做验收。最新补充的驱动测试存在 TypeScript 编译错误，当前测试总入口不通过。最后几处源码修改也尚未重新构建所有产物。

所有改动保留在原工作区，未提交 Git、未推送、未发布 npm。不要重置工作区或覆盖已有无关修改。

## 2. 用户要求和不可突破的测试限制

目标项目：`/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio`。

- 包名：`@xpert-ai/plugin-db-studio`；当前版本 `0.1.0`。
- 系统级 Agentic App，稳定命名空间 `db_studio`。
- 首期数据库：Doris 2.1／3.x／4.x、MySQL、PostgreSQL。
- 参照 LibreDB 的工作区和数据库开发管理能力，接入 Xpert 原生 Agent 对话，以 Agent middleware tools 调用与人工界面相同的业务服务。
- 实施顺序：共享契约与执行边界 → Doris → MySQL／PostgreSQL → 工作台 → Agent 模板 → 打包、安装和验收。
- 不包括：集群节点管理、配置调优、用户授权、备份恢复和集群监控中心。

**真实库测试只能使用 `http://localhost:5174/` 中的“BI数据源”。该连接已确认类型为 Doris，并已授权给当前 DataX 工作空间。**

**真实库禁止任何写操作**：DML、DDL、导入、ANALYZE／OPTIMIZE 等维护、会话终止、权限修改；也不能通过回滚事务包装写入测试。只能读取元数据、执行有限 SELECT、估算 EXPLAIN 和 Agent 只读问答。其他引擎及所有写入场景必须用模拟驱动验证，不得把模拟通过表述为真实数据库通过。

FortiClient 最后检查仍未连接，选中 HSAC，客户端要求输入密码。此前已请用户在客户端完成 VPN／MFA 并提供必要 DNS 配置，尚未收到连接成功回复。不要查找、读取或代填保存的密码；不要把密码／MFA 发到聊天中。用户指出 VPN 连接后调用 LLM API 可能需要调整 DNS。

新增了两种服务端只读验收开关：插件配置 `{ "readOnlyTest": true }`，或者环境变量 `DB_STUDIO_READ_ONLY_TEST=1`。它们优先于连接策略。**目前只是源码已实现，尚未在已安装插件中验证生效。实际安装测试时必须启用并从 bootstrap／界面确认。**

## 3. 接手前必须阅读

用户指定技能：

- `/Users/xpertai05/.agents/skills/xpert-plugin-development/SKILL.md`
- `/Users/xpertai05/.agents/skills/xpert-agentic-app-developer/SKILL.md`
- `/Users/xpertai05/.codex/skills/xpert-assistant-dsl-builder/SKILL.md`

本轮还使用了本地平台环境和界面开发相关技能。接手时按任务需要阅读，不必无差别重复读取所有参考文档。

遵守三个仓库各自的 `AGENTS.md`。尤其是：每个修改过的插件都必须通过 `plugin-dev-harness` 生命周期测试；Remote View 不得访问 localStorage／sessionStorage；SDK 保持 peer dependency；不得把另一个 checkout 的 UI 代码作为运行时依赖；维护源码超过 1,000 行需要审视职责并拆分。

当前任务没有用户授权的子 Agent 并行分工。本轮未使用子 Agent。

## 4. 仓库与本地环境

| 用途 | 路径／地址 |
|---|---|
| LibreDB 参考源码，未修改 | `/Users/xpertai05/tiwen/libredb-studio` |
| 插件仓库 | `/Users/xpertai05/tiwen/xpert-plugins` |
| 插件 pnpm 工作空间 | `/Users/xpertai05/tiwen/xpert-plugins/xpertai` |
| Xpert 宿主 | `/Users/xpertai05/tiwen/xpert-pro` |
| DataXpert | `/Users/xpertai05/tiwen/data-xpert` |
| 必须使用的验收前端 | `http://localhost:5174/`，DataXpert |
| DataXpert API | `http://localhost:3001/` |
| Xpert API | `http://localhost:3000/` |
| 原生 ChatKit | `http://localhost:4200/` |

当前 DataX 工作空间为 Default Workspace，ID：`374d3226-df3c-4987-950d-09560c10c64f`。不要把这个 DataX 工作空间 ID 与 Xpert Assistant 的宿主 workspaceId 混为一谈。`StudioAccess.resolve()` 已通过 DataX 的 AI context 接口解析规范工作空间。

服务由已有开发进程运行，watcher 会重启 API；进程号不稳定，接手时重新用端口和 cwd 核实。不要直接启动重复实例。

### 原有无关改动，必须保留

- `xpert-pro/apps/cloud/package.json` 和 `xpert-pro/pnpm-lock.yaml` 在本轮开始前已经修改。
- `data-xpert/docker-compose.override.yml`、`docs/bw-stock-model-manual-assets/`、`docs/scripts/` 和两个 BW 手册 DOCX 为本轮之前的未跟踪内容。
- `xpert-plugins` 最初干净；当前该仓库中的上述数据库及 DB Studio 改动属于本任务。

## 5. 已核实的 LibreDB 架构

上游版本 `0.16.0`，提交 `9a66cd9ada53c05eb759f58aefce194ea833bb35`，MIT，Copyright (c) 2025 LibreDB。

- Next.js 16、React 19、Tailwind／shadcn，Monaco、TanStack table／virtual、React Flow／ELK、Recharts。
- `src/components/Studio.tsx` 组合工作区；hooks 管理连接、查询、标签页等，但仍耦合路由、固定 API 和浏览器存储。
- `src/lib/db/types.ts` 定义 Provider、能力与结果对象；工厂按数据库类型选择驱动。
- 不能原样嵌入 opaque-origin iframe。本实现参考其布局与交互，使用本仓库 React／shadcn／Tailwind 和平台桥接重新实现，运行时不引用 LibreDB checkout。
- LibreDB 没有现成 Doris Provider；Doris 不能直接套用 MySQL 的事务与表更新语义。

**尚未补齐正式架构说明、README 和上游 MIT／来源声明。** 本文仅为交接记录，不能替代这些交付文档。

## 6. 已修改的宿主与数据库适配

### 6.1 xpert-pro SDK

新增：

- `packages/plugin-sdk/src/data-workbench.ts`
- `packages/plugin-sdk/src/lib/data/datasource/workbench.ts`
- `packages/plugin-sdk/src/lib/data/datasource/workbench-sql.ts`
- `packages/plugin-sdk/src/lib/data/datasource/workbench-adapter.ts`

修改 SDK 的 datasource 导出、`DBQueryRunner` 可选 `getWorkbenchAdapter()` 和 `project.json` 构建入口。

提供 `@xpert-ai/plugin-sdk/data-workbench` 子路径，包含：

- database／schema／engineCatalog、对象、列、键、能力、结果和导入回执类型。
- 独立列 ID 和二维行数组，保留重复列名；驱动将大整数／小数保留为字符串。
- 每个实例绑定独立物理连接的 `SqlDatabaseWorkbenchAdapter`。
- 保守 SQL lexer：识别注释、引号、美元字符串和分号；仅允许可证明只读的语句走自动读取；未知函数、数据修改 CTE、EXPLAIN ANALYZE、维护和权限语句等被阻止。
- SELECT 包装分页，默认 100／最高 1,000 行；默认 30 秒，单次最高 120 秒；驱动另有限制结果字节数。
- MySQL／PostgreSQL 非手动事务的读取使用原生只读事务。
- Doris 读取 `@@version_comment`，不能把协议兼容值 `VERSION() = 5.7.99` 当作真实引擎版本；未知版本关闭写入与导入能力。
- 取消通过关闭本次独立连接实现，不发送 KILL／会话终止 SQL。

最后新增的“拒绝带命名空间函数调用／非 ASCII 未引用 token”和“导入重复列检查”等源码改动尚需重新构建 SDK；不要认为现在 dist 与源码完全一致。

### 6.2 xpert-pro 服务端

新增 `packages/server/src/data-source/data-source-runtime.service.ts`，注册 `platform.datasource.workbench` runtime capability。

- 按当前 RequestContext 验证 tenant／organization／user 和 DATA_SOURCE_VIEW／EDIT。
- 向插件只提供安全连接摘要；凭据解析和 runner 创建留在宿主。
- 按数据库上下文创建独立 runner；Proxy 每次调用复查权限。
- 新增 updatedAt 校验，连接配置变化后关闭旧 session。
- `data-source.service.ts` 的按 ID 解析补上 tenant／organization 范围校验。

已在源码 watcher 产物中看到新增服务；完整运行时贡献及安装后的能力解析尚未验收。

### 6.3 MySQL／Doris 插件

目录：`xpertai/databases/mysql`。

新增 `mysql-workbench.ts`、`doris-stream-load.ts`，修改 `mysql.ts` 和 `doris.strategy.ts`。

- Doris 保留 `mysql` 协议驱动，MySQL 使用 `mysql2`，工作台使用独立连接。
- 解码时收集列值，避免重复 alias 被对象映射覆盖；TLS 校验、大整数、小数、日期保真。
- 参数执行前检查 `@@session.sql_mode`，`NO_BACKSLASH_ESCAPES` 时拒绝文本协议参数路径。
- 旧 runner 的 runQuery 传递 params；旧连接按 catalog 分开缓存并统一 teardown。
- Stream Load 使用稳定 label、受限大小和严格过滤策略；区分 Success／Publish Timeout／Label Already Exists／unknown。
- 307 重定向仅向配置允许的主机、相同协议和路径转发凭据。
- `streamLoadHosts` 已在实现中读取，但尚未加入完整的 Doris 连接配置表单／schema。
- 最新增加了可注入模拟 wire driver 的测试入口，需要修复对应测试类型并重新验证。

### 6.4 PostgreSQL 插件

目录：`xpertai/databases/postgres`。

新增 `postgres-workbench.ts`，修改 `postgres.runner.ts`。

- 独立 pg Client、schema search_path、参数化查询、array row mode、保真类型解析和有界结果。
- 估算 JSON EXPLAIN，事务、关闭连接取消。
- `pg-copy-streams` COPY 导入实现已写入，含超时与提交结果不确定处理。
- 需要补齐 COPY 的模拟驱动覆盖及 abort／COMMIT／ROLLBACK 边界验证。

**发布版本与 SDK peer 范围尚未最终调整。** 驱动包当前版本仍为 MySQL `0.0.7`、PostgreSQL `0.0.1`，部分 SDK peer 仍为旧范围。新子路径尚未发布，不能直接假定普通 npm 安装就具备工作台契约。

## 7. DB Studio 插件代码地图

### 7.1 服务端

| 文件 | 主要职责 |
|---|---|
| `src/index.ts` | 插件元信息、system 级别、唯一模板贡献、readOnlyTest 配置 |
| `src/lib/app-config.ts` | 类型化 Explore App 初始化配置 |
| `.xpertai-plugin/plugin.json` | bundle 元信息，含 appConfig、目标应用和命名空间 |
| `src/lib/constants.ts` | Provider／View／Feature／Middleware／Tool 名称 |
| `src/lib/plugin.ts` | Nest 模块、实体、View、中间件、Queue Processor 注册 |
| `src/lib/entities.ts` | StudioRecord 与 StudioPolicy，显式 PostgreSQL 列类型和范围字段 |
| `src/lib/types.ts` | 严格 Zod 输入 schema 和业务 DTO |
| `src/lib/access.ts` | 以服务端 actor token 调用 DataX 网关，解析工作空间并复核绑定 |
| `src/lib/studio.service.ts` | 查询、结果、草稿、策略、冻结计划、审批、执行、事务、快照、导出 |
| `src/lib/jobs.ts` | Managed Queue 入队、身份恢复、计划／快照执行；attempts=1 |
| `src/lib/view.provider.ts` | View manifest、数据请求、动作、文件上传、Remote View 资源 |
| `src/lib/middleware.ts` | 三个直接连接主 Agent 的中间件，工具集合互斥 |
| `src/lib/transfer.ts` | CSV／JSON 解析与导出 |
| `src/db-studio-assistant.yaml` | 一个主 Agent，三个直接 middleware 边，无固定模型实例 ID |

业务实体保存：草稿、收藏、图表、看板、结构快照、计划、执行、传输任务和事务记录。查询结果有 24 小时读取期限；**实际过期数据清理尚未完成**。

冻结计划包含目标、SQL／参数、动作、策略版本、过期时间和规范 JSON 哈希；修改后不能复用审批或 operationId。Agent 无审批／改策略工具。执行失联返回 unknown，不自动重放。

行编辑仅允许服务端保存的原始表浏览结果，重新读取真实唯一键并参数化生成 UPDATE，不信任前端传来的行定位条件。

手动事务是后加的实现，需要重点审查：

- 仅 MySQL／PostgreSQL、可写连接策略及变更权限允许开启。
- 按用户、工作空间、连接、数据库和 session 隔离，最多 5 分钟；全局最多 100 个、单用户范围最多 8 个。
- 同一物理连接执行；事务内写入必须先经过冻结计划，回执在 COMMIT 前保持 pending。
- 为避免 MySQL 隐式提交，事务计划仅允许 INSERT／UPDATE／DELETE；不允许事务内通用导入。
- 含 sessionId 的计划同步执行，不送到任意 Queue worker。
- **跨进程亲和性、重启恢复、退出回滚、取消后的状态归并仍需验证和完善。当前不要宣称事务能力已验收。**

### 7.2 前端

`src/ui/main.tsx` 为入口；已拆分为：

- `controller.ts`：状态与业务动作，约 516 行。
- `workbench.tsx`：主工作区，约 905 行；继续扩展前建议再拆分结果与记录面板。
- `connection-sidebar.tsx`：连接／对象树／导航。
- `editor.tsx`：Monaco、SQL 格式化、补全、选区和快捷键。
- `result-table.tsx`：虚拟化结果网格、字段过滤、单元格详情及受控编辑入口。
- `analysis-panels.tsx`：柱／折线图、透视、真实外键 ER。
- `dashboard.tsx`：保存图表的组合看板。
- `policy-dialog.tsx`：只读策略和限定对象／动作的预授权。
- `schema-tools.ts`：文档、快照差异、迁移草稿。
- `bridge.ts`：requestData／executeAction／executeFileAction／原生命令与主题。
- `i18n.ts`：类型化中英目录；后加文字仍需检查完整性。
- `debug.ts`：默认关闭的协议级调试，只记录允许的元信息。

已实现工作区布局、SQL 多标签、结果分页、草稿保存／自动保存、历史／收藏、表结构／定义、EXPLAIN、图表保存／看板、透视、ER、快照／比较、文件导入计划、结果导出、操作计划面板、策略、主题和窄窗口。

这些是第一版能力，不等于 LibreDB 全量交互完成：图表与透视基于已加载结果；ER 当前页最多 50 个对象；画像查询最多抽样 1,000 行；快照上限 1,000 个对象；查询、导入等均有明确上限。

连接管理调用宿主 `db-studio.connections.manage` 命令，进入 DataX 数据源页面处理凭据。没有在 iframe 维护密码表单。

Agent 上下文通过 `assistant.context.set` 发布草稿引用；中间件 `wrapModelCall` 重新验证已持久化草稿，仅注入精简引用。**完整的已安装 ChatKit → configurable.context 链路还没有验收。**

## 8. DataXpert 改动

仅本轮修改两个文件：

1. `apps/api/src/features/data-analytics/gateway/data-source-proxy.controller.ts`
   - `workbench-connections` 只返回已授权连接的 id／name。
   - `:id/workbench-access` 和 `:id/workbench-write-access` 复查工作空间绑定。
   - 分别使用 SemanticModelView／SemanticModelEdit 和已有认证、工作空间、数据权限 Guards。
2. `apps/web/src/pages/agent/workbench/assistant-workbench/use-workbench-commands.ts`
   - 注册 `db-studio.connections.manage`。
   - 检查来源插件后导航到当前 DataX 工作空间的数据源管理页面。

已有控制器测试通过过，但**尚未增加这三个新网关入口的专门 DTO／越权测试**。

## 9. 测试事实，区分历史通过与当前状态

| 验证 | 状态 |
|---|---|
| SDK Nx 构建 | 通过多次；最后几处 SDK 修改后尚未重建 |
| xpert-pro server TypeScript | 通过，`/tmp/db-studio-host-types.log` 无错误 |
| DB Studio 服务端／UI 类型检查 | 前一轮通过；最新全部改动需重跑 |
| DB Studio 完整 build | 前一轮通过；后加 debug／SQL guard 等存在产物新鲜度待检查 |
| 原 51 项契约／治理测试 | 曾全部通过 |
| 最新 `pnpm test` | **失败在新增 driver.test.ts 的类型检查，测试未进入执行** |
| Remote UI 测试 | 已用真实构建资源、模拟宿主、opaque iframe 通过 |
| 三个插件生命周期 | 较早版本全部通过；新 Queue／配置／驱动变更后需全部重跑 |
| DataX 前端类型检查 | 通过过 |
| DataX API 生产配置类型检查 | 通过过；包含所有 spec 的 tsconfig 有原有无关错误 |
| DataX 已有控制器测试 | 原 3 项通过 |
| DSL 源码与构建模板校验 | 较早版本通过；新增 opener 后需重跑 |
| 实际插件安装与运行描述 | 未完成 |
| Assistant 初始化、发布图 | 未完成 |
| 5174／BI数据源／真实 Doris | 未验收，无写操作 |
| 真实 MySQL／PostgreSQL | 未验收 |

### 最新需要首先修复的编译错误

`tests/driver.test.ts`：

- 模拟 `EventEmitter` 的 `on()` 签名与 `mysql-workbench.ts` 中 `QueryEvents` 的 `(...args: never[])` 回调不兼容。应修正边界类型／构造有类型的模拟适配，不用 `as any` 掩盖。
- 模拟 `MysqlAdapterOptions`／`DorisAdapterOptions` 缺少必填 `port`、`username`、`password`。使用明确的假值补齐，绝不能引用真实凭据。

最新失败日志：`artifacts/contract-tests.log`。此文件已覆盖早先的 51 项成功输出；不能只看旧结论。

新增了驱动测试和事务／执行 ID 覆盖／撤权治理测试；修复类型后可能还有行为失败，需逐一处理。

### 界面证据

以下均为模拟数据，位于插件目录：

- `artifacts/workbench-light.png`
- `artifacts/workbench-dark.png`
- `artifacts/workbench-narrow.png`
- `artifacts/ui-validation.json`

`artifacts/`、`dist/`、`.test-build/`、`node_modules/` 被忽略。界面验证覆盖连接树、Monaco、结果、精度、图表、透视、ER、草稿、原生上下文命令、主题、窄窗口和无写动作。不要将这些图片描述为“BI数据源”截图。

## 10. 本地构建与测试入口

SDK 已发布的 `3.18.3` 不含本次新增子路径，所以本机使用明确的开发链接。不要编辑 `.pnpm` 存储目录，不要将本机绝对路径写进正式依赖声明。pnpm install 可能覆盖链接，之后重跑链接脚本。

```bash
cd /Users/xpertai05/tiwen/xpert-pro
corepack pnpm nx build plugin-sdk --skip-nx-cache

cd /Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio
node scripts/link-local-sdk.mjs /Users/xpertai05/tiwen/xpert-pro/packages/plugin-sdk/dist

cd /Users/xpertai05/tiwen/xpert-plugins/xpertai
corepack pnpm exec tsc -p databases/mysql/tsconfig.lib.json
corepack pnpm exec tsc -p databases/postgres/tsconfig.lib.json

cd /Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio
corepack pnpm run typecheck
corepack pnpm test
corepack pnpm run build
node scripts/build-ui.mjs --check
corepack pnpm run test:ui
```

`test-ui.mjs` 使用 Playwright 创建独立模拟宿主，只允许请求本地 fixture，不访问真实数据库。Chromium headless shell 已安装；若运行时缺失，使用该包的 Playwright 安装命令。

生命周期入口按 `plugin-dev-harness/README.md`：

```bash
cd /Users/xpertai05/tiwen/xpert-plugins
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-mysql
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-postgres
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-db-studio
```

如 harness 缺少宿主提供的 peer/transitive 包，按技能检查依赖源，必要时使用仅本次进程的 NODE_PATH；不要为了 harness 向插件加入错误依赖。

## 11. 安装与账号状态

- 本轮尚未安装任何新插件版本。
- 已检查 macOS Keychain：`xpert-local-plugin-username` 和 `xpert-local-plugin-password` 项存在。只做了存在性检查，没有读取、展示或复制秘密。
- `xpert-pro` 的 `plugin:deploy:local` 支持正常 Keychain 登录、scope tenant、代码刷新和运行描述验证。应使用该脚本，不要手工修改 staging 目录。
- 曾执行 dry run：识别到 Keychain 凭据，但因没有显式 tenant-id 退出；dry run 不登录，无法推断 tenant。实际普通登录路径可从登录结果推断，接手时先核对脚本逻辑。不要为此查询数据库或浏览器存储中的凭据／租户数据。
- 仓库 AGENTS 还要求遵循 `community/.env` 的本地安装配置。接手时协调现有配置和新版安全登录脚本，不要输出整个 env 或配置。
- 发布／本地升级顺序：宿主兼容契约 → MySQL/Doris 插件 → PostgreSQL 插件 → DB Studio 插件 → Assistant 初始化／原位升级 → 发布图验证 → 5174 只读验收。
- DB Studio 安装配置必须启用 `readOnlyTest: true`，直到用户明确结束本轮只读验收约束。
- 不要从浏览器 localStorage、Cookie、网络 Authorization 头或 ChatKit bootstrap hash 提取 JWT。已登录界面用于操作，不能用于绕过凭据流程。

## 12. 尚未完成及建议优先级

### P0：先恢复可验证状态

1. 修复最新 driver.test.ts 编译错误；运行全部新增测试，修复行为问题。
2. 重建 SDK → 两个数据库插件 → App，重新链接本地 SDK，并检查资源新鲜度。
3. 全面验证后加事务逻辑：同物理连接、序列化、审批过期、策略撤销、取消、提交失联、重启、TTL、跨进程亲和性、pending 到最终状态。
4. 验证只读验收配置确实进入运行中的 StudioService／Queue 路径，而非仅出现在 manifest 或 UI。
5. 对新宿主范围校验、DataX 授权网关和 session 权限增加专门测试。

### P1：补齐原计划中的功能和安全闭环

- 元数据：PostgreSQL 完整索引／约束、Doris 分区／分桶／索引的结构化表示，以及真实版本／表模型分支。当前部分信息仅在原始 DDL 中。
- SQL／传输：继续审查旧 runner 元数据 SQL 的标识符和参数处理；COPY 的取消／提交不确定路径；Stream Load 重定向 allowlist 配置表单。
- 计划：明确失败前未提交与提交不确定的回执；受控行更新复核；幂等不能替代数据库提交确认。
- Queue：队列取消、长任务恢复、失败状态归并、排队记录失联与主动回执；已保存 queueJobId，但恢复闭环未完整验收。
- 导出：平台文件句柄已接入服务端；Agent 目前只有分页读取工具，尚无完整导出文件工具。核验 user-xperts 文件范围和 UI 下载。
- 数据生命周期：真正清理过期结果；避免只禁止读取而无限保留行数据。
- 导航：草稿自动保存与切换竞态、关闭标签后不自动重开、重命名标签、导航返回状态和初始 query 恢复。
- 事件同步：现在主要给出“Agent 完成”的提示，未完成按目标／executionId 仅刷新受影响面板的完整实现。
- 收藏：已有导出备份，尚未做完整备份恢复。
- 结构比较：当前只对新增表／字段生成基础 SQL，类型／约束变更仍主要是提示；需完善同引擎迁移草稿，跨引擎保持差异报告。
- UI：计划确认采用可访问的明确确认交互；核验能力不可用原因、主题 token、真实宿主导航／ChatKit 上下文、键盘和窄屏；整理拆分后遗留的无用 import。
- DSL：技能快照与当前宿主契约有漂移，必须先按当前宿主校准，再验证源码、构建、贡献、安装草稿、发布图一致。模型由安装选择，不写死实例。

### P2：安装与真实只读验收

- 完成三插件最终 lifecycle、打包检查、README、架构说明和 LibreDB MIT 来源声明。
- 核对 SDK 导出版本／peer 约束，不能发布一个默认可安装到缺少 data-workbench 子路径的旧宿主上的包。
- 按既定顺序部署，确认实际加载源码版本和插件贡献。
- App 初始化需要 dedicated workspace；“BI数据源”当前绑定在 Default Workspace。新工作空间是否已有授权不能假设，需要走平台合法绑定流程并保留用户指定连接，不读取／复制凭据。
- 从 5174 完成初始化／入口、模板／模型、发布图、View／ChatKit 全链路检查。
- VPN／DNS 条件满足后，仅执行允许的 Doris 元数据、有限 SELECT 和估算 EXPLAIN；记录真实版本与执行依据。

## 13. 给下一个 Codex 的直接任务说明

请继续实现用户原来的完整 DB Studio 方案，不要从零创建另一套应用。先阅读本文和指定技能，检查三个仓库的 git diff，保留已有无关修改。从最新测试编译失败着手，重建并验证所有源码及产物，然后补齐 P0／P1 的闭环，再安装和进行指定环境只读验收。未经实际验证，不要宣称完整 LibreDB 功能对等、生产可用或真实数据库验收通过。
