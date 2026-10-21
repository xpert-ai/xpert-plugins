---
title: "MVP 历史验收"
---

> 历史验收记录：本次分批提交审核未重新执行其中的模型、SSO、部署或源数据变更场景；当前本地检查见 [构建与验证](verification)。

# Live Dashboard MVP 实现与验收

验收日期：2026-10-15。以下记录当时的实现与测试状态。

后续的真实模型“一句话生成”专项、业务正确性检查和本轮修复见 [Agent 专项验收](agent-acceptance.md)；下文是此前 MVP 范围的记录。

## 已实现的分层

| 所属仓库 / 模块 | 交付内容 |
| --- | --- |
| xpert / contracts | `AnalyticsBinding`、`AnalyticalDataset`、字段、参数、完整性、时间及执行来源 |
| xpert / plugin-sdk | `AnalyticsQueryProvider`、注册器、`platform.datasource.analytics`、标准化与浏览器安全入口 |
| xpert / server/data-source | 当前 actor 授权、组织内数据源解析、provider 分发、超时、限额、执行后来源复核 |
| xpert / server/data-source-type | 支持插件贡献非 SQL 数据源配置，不要求数据库 runner |
| xpert / Artifacts | 复用原实体、Workspace Files、版本；新增通用 CAS 和资源前缀过滤能力 |
| plugins / analytics-postgres | 使用平台已有 PostgreSQL Workbench adapter，参数化只读查询及 OID 类型映射 |
| plugins / analytics-data-xpert | 当前用户 Actor Token、版本化本体 Action 参数、结果及审计映射 |
| plugins / live-dashboard | 定义、保存、筛选、刷新、并发控制、Workbench 视图、Agent middleware 工具 |
| plugins / data-analytics | 提取原有 renderer 加载函数供复用，原渲染资产不变，MCP 保持兼容 |
| data-xpert / agent-workbench | 新增只读 analytics 入口，复用资源绑定、显式 viewer policy、Action allowlist 和审计 |

平台没有引入 Dashboard 专用表、data-xpert 客户端或 Python/JS 运行逻辑。可替换的三个实现均为独立插件。

## 接口与存储

- 平台发现：`GET /api/data-source/analytics/sources`。
- 平台查询：`POST /api/data-source/analytics/query`，请求为 `{ binding, controls }`；身份与凭据来自服务端。
- data-xpert：`POST /api/agent-workbench/analytics/query`，要求 OIDC、Assistant/resource 绑定及当前 viewer 的显式读取许可。
- Dashboard 沿用 `/api/view-hosts/:hostType/:hostId/...`，视图 key 为 `live-dashboard__live-dashboard`，Action 为 `save` / `query`；不建立第二套认证 API。
- 保存 `xpert.live-dashboard/v1` JSON 定义，不保存查询结果。Artifact 的 resourceType 为 `live-dashboard`，namespace 为 `live_dashboard`，MIME 为平台支持的 `application/json`。
- 每次刷新重新授权并执行。Artifact 版本使用 SHA-256 和 CAS；读取再次校验文件内容 SHA，防止可编辑 Workspace 文件冒充原版本。

## 真实安装验收

测试平台为独立 xpert-pro，API 3001、前端 4201；data-xpert API 3002、前端 5174。平台代码以增量补丁复制，保留 pro 原有扩展。SDK/contracts 已构建，插件通过官方本地安装流程登记并在 API 重启后验证。

本地管理员密码按用户授权重置，保存到专用 Keychain 条目，未写入代码或验收文件。修复了本地前端 `/oidc` 代理；本地 HTTP OIDC 使用 `SameSite=Lax`。正常授权码 SSO 成功，两个应用识别同一用户与组织。data-xpert ChatKit 指向该 xpert-pro 的 `/chatkit/`。

RDF 验收使用 data-xpert 自带的 `LocalRdfOntologyPublisher` / `LocalSparqlOntologyQueryBackend`。外部 Fuseki 镜像下载未作为本次验收前提；没有伪造发布状态、绕过资源策略或 mock 查询服务。

| 场景 | 实际结果 |
| --- | --- |
| 插件注册和来源发现 | 两种 provider 均由已安装插件提供；data-xpert 无数据库 runner |
| PostgreSQL → Dataset | east=120、west=80；筛选 west 后只有 80 |
| data-xpert → Dataset | 已发布 SQL 语义模型 → 本体资源 → `sql.query_cube_slice`；返回相同结果 |
| 图表解耦 | 两份定义的 `charts` 完全一致，仅 Binding 的原生 payload / 字段映射不同 |
| Artifact 保存 / 重载 | 两种来源各保存一个看板；真实 UI 编辑生成版本 2，跨应用重载保留默认筛选 |
| 筛选 / 刷新 | 真实 UI 筛选 west=80；刷新保留筛选，平台 executionId 与 data-xpert upstreamExecutionId 均变化 |
| 并发保存 | 使用旧版本保存返回 HTTP 409；版本 2 未被覆盖 |
| 权限撤销 | 临时将专用测试 policy 改为 deny；已保存看板查询被拒绝且没有返回缓存行；随后恢复原 allow |
| 渲染 | xpert-pro 与 data-xpert SSO Workbench 均显示同一个真实 Artifact，使用原 Data Analytics 柱图和表格 |

可在本地打开：

- xpert-pro：`http://localhost:4201/chat/x/live-dashboard-acceptance/c?view=live-dashboard__live-dashboard`；若工作区折叠，点击“显示工作区面板”。
- data-xpert：`http://localhost:5174/?assistantCode=live-dashboard-acceptance&view=live-dashboard__live-dashboard`。
- 选择“区域销售”或“本体区域销售”。本体看板当前为版本 2，默认 west。

截图和不含凭据的查询回执位于本插件被 Git 忽略的 `output/playwright/`。测试数据源、已发布语义模型、Assistant、限定当前用户的 policy 和两个 Artifacts 为本次明确命名的本地联调数据；未修改其他环境账号、数据源或服务。

## 自动验证

- SDK：9 项 Dataset / Binding 边界测试，涵盖空结果、语义字段、精度、类型、grain、完整性及参数。
- 平台：4 项真实 Nest HTTP 管道与执行边界测试，4 项 Artifact CAS / 前缀转义测试。
- 插件：PostgreSQL 2 项、data-xpert 3 项、Dashboard 5 项；另有真实 PostgreSQL 集成测试，覆盖参数化、注入值作为数据、截断及只读拒绝。
- data-xpert：3 项 analytics HTTP 测试、2 项 cache policy 测试、3 项已有 AgentTools cache 回归测试。
- 三个插件通过 dist-first Nest 生命周期 harness；Dashboard `verify:dist` 核对源文件、远程 bundle 与原 Data Analytics 资产哈希。
- Data Analytics stdio MCP 回归：initialize、tools/list（5 个工具）、resources/read 均成功，widget HTML 正常返回。
- contracts/SDK、平台服务及插件 TypeScript 检查、data-xpert API 构建通过；改动仓库 `git diff --check` 通过。

## 复现所需前置条件

1. 使用包含本次新增协议和能力的 xpert contracts/SDK 构建产物。仅满足现有 peer semver 的旧发行包可能没有新接口，需要协调平台发布。
2. 安装 PostgreSQL 底层驱动及两个 analytics provider、Live Dashboard 系统插件，重启 API，然后同步数据源类型。
3. 在 Assistant 图中通过 `workflow` 连接绑定 `LiveDashboard` middleware。`options.middlewares.order` 只描述顺序，不能将插件配置数组塞入该字段。发布后检查实际视图清单。
4. 使用 examples 中的 JSON，替换真实 dataSourceId。data-xpert 示例的资源和 target 必须取自已发布资源发现，配置 Assistant/workspace 及 viewer policy。
5. 导入、保存，确认全量/筛选结果，然后刷新并核对新的执行记录。

## 明确未包含

本轮未实现调度刷新、跨源 Join、公开分享、可视化查询编辑器、团队共享缓存、Artifacts 画廊自定义实时 viewer，以及 LLM 自动生成看板的实际模型调用验收。Middleware 工具已实现并绑定，但本地验收聚焦用户要求的保存、筛选、刷新闭环。

Python / JavaScript Workspace 实时查询是后续可替换的 Script Provider：每次加载、筛选或刷新均执行脚本，脚本在本次运行中通过受控通道查询来源或读取文件，计算后直接返回标准 Dataset。Agent 创建/修改脚本，常规刷新不需要调用 LLM；相同脚本和参数也不能复用上次任务结果。执行中数据访问通道、查询期限与取消传播、脚本版本及 lineage 设计已记录于平台 `packages/plugin-sdk/docs/workspace-dataset-pipelines.md`。这些扩展尚未实现，现有 Sandbox Jobs 不包含完整的脚本数据访问通道。
