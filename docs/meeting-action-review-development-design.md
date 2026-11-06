# 会后行动项核对与确认工作台：开发设计

- 文档版本：0.6，2026-11-01；对应插件 0.1.5 的实现与审查记录。
- 需求依据：[需求与开发方案](meeting-action-review-plan.md)，重点为第 4～9 节。
- 数据契约：[数据库设计](meeting-action-review-database-design.md)，字段、索引、JSON 格式与事务规则以该文档为准。
- 已完成首版实现，0.1.5 会话同步已安装联调。本地验证情况见[插件验证记录](../community/apps/meeting-action-review/docs/verification.md)；0.1.4 已完成真实平台安装、AI 提取、保存确认与刷新恢复；未覆盖专项见验证记录。

新增聊天联动设计的事实依据见[聊天联动能力验证](meeting-action-review-chat-sync-validation.md)。本轮按用户确认仅修改插件，实现提交后同步和历史同步；宿主不改动。旧版 0.1.4 的探针结论保留为依据，交付状态以新版本联调记录为准。

## 1 设计结论与边界

沿用已确认的方案：一个整理者角色、一个主 Agent、一个业务中间件、一个工作台、两张业务表。用户提交会议文本后，服务端后台提取；工作台负责核对、编辑、保存与整份清单确认。

右侧工作台在列表、新建、详情之间切换。详情采用纵向布局、折叠原文、条目内展开依据，不增加固定的三栏。左侧新增目标为打开本次后台分析已有的执行会话；提取继续使用独立会话，不把当前普通聊天历史混入原文，也不启动第二次分析。历史记录切换需对应最近尝试，新建表单先保留左侧，提交提取并获得实际执行引用后再同步。

业务结果以插件数据库为准。聊天回复、任务回执、队列完成都不能替代“结果已通过业务校验并写入数据库”。只有人工 View action 能确认清单，Agent 不能调用确认、修改人工草稿或启动重试。

不增加子 Agent、Project Pipeline、独立任务管理、MCP 服务、外部数据库、额外 Redis、文件上传、沙盒和任务派发。技术恢复逻辑服务于当前后台流程，不形成新的用户功能。

## 2 当前源码与 SDK 核对结果

### 2.1 本次核对基线

| 项目 | 实际核对结果 | 使用边界 |
| --- | --- | --- |
| 插件仓库 | 个人 Fork 的 `xpert-plugins`；功能分支 `feat/meeting-action-review`；开发基线 `60794aa72edb1fddffebd5e5d071619b8c29014b` | 不把旧示例的依赖版本直接复制为本插件基线 |
| 平台源码 | 通过 SSH 访问的本地 WSL 部署；提交 `83e0d4ce9462996e7a4c24517f63559bedf23b7e` | 本文引用固定提交，未声称它就是验收时最新 main |
| 运行宿主 | Docker API 容器；镜像 revision 与上述提交一致；版本 `3.29.1` | 该行记录最初源码核对；后续插件升级按 pending_restart 重启 API，未改宿主源码 |
| 实际运行依赖 | 容器内 `@xpert-ai/plugin-sdk` 与 `@xpert-ai/contracts` 都为 `3.29.1` | 开发依赖按此目标版本构建；npm 可获得性与 frozen lock 校验已有证据，完整主流程在实际平台验证 |
| 构建工具 | community 工作区声明 `pnpm@8.15.8`；平台声明 `pnpm@10.24.0` | 各自遵循所在工作区，不混用锁文件 |

这里的“核对”指阅读 SDK 定义、宿主实现以及运行版本。本段仅记录源码核对；实际宿主任务、工具上下文、安装与主界面已在 0.1.4 联调验证。本地数据库、构建产物和 UI 测试结果另见插件验证记录，不能把源码审查写成运行验收通过。

### 2.2 采用的公开接口

| 能力 | 当前接口 | 本插件用途与限制 |
| --- | --- | --- |
| View | `IXpertViewExtensionProvider`：`getViewManifests`、`getViewData`、`executeViewAction`、`getRemoteComponentEntry` | 统一承载查询、人工操作和 React 页面，不自建前端鉴权 API |
| View 身份 | `XpertResolvedViewHostContext`：tenant、organization、user、assistant、application 等 | 客户端参数仅用于定位资源；权限取宿主解析后的上下文 |
| 工具 | `XpertToolProvider`、`XpertTool`、`XpertBusinessToolContext` | 只启用 middleware 暴露，`mcp: false`；每次调用读取实际身份和执行上下文 |
| 平台能力 | `XPERT_RUNTIME_CAPABILITIES_TOKEN` → `AssistantTaskRuntimeCapability` | 通过公开 registry 取能力，不导入宿主私有 Service，不跨包派发 CQRS 类 |
| 后台任务 | `startTask`、`getPublishedContext`、`getTaskStatus`、`cancelTask` | 后三者在 SDK 中可选，当前宿主有实现；启动前仍做能力检查 |
| 托管队列 | `MANAGED_QUEUE_SERVICE_TOKEN`、`PluginJobProcessor`、`enqueue`、`getJob`、`getExecutionPoolHealth` | 复用平台队列与执行身份恢复，任务载荷只携带稳定业务 ID |
| 数据 | TypeORM、插件实体注册、`pluginArtifactTableName` | 两张命名空间表；实体列类型显式声明；安装前由宿主执行限定命名空间的 schema preflight |
| 远程页面 | `renderRemoteReactIframeHtml` 与平台 remote-component bridge | 通过宿主桥接请求数据/操作，不给 iframe 传 token |

### 2.3 源码揭示的接入约束

联调补充：包 exports 同时提供 import/default，适配宿主安装检查；View 声明页码与游标分页；顶层 dataSource.cache.enabled=false，成功写入 action 返回 refresh=true，保证后台结果、保存与确认后读取最新状态。HTTP 局域网 iframe 用 crypto.getRandomValues 生成 UUID，不依赖 secure-context 限定的 randomUUID。这些是平台兼容修复，不增加业务功能。

1. **允许单主 Agent。** `AssistantTask` 的 `agentKey` 是当前 Assistant 的入口 Agent，不要求必须是子 Agent。使用 `getPublishedContext().primaryAgentKey`，不为了后台调用新增角色。
2. **任务参数必须区分。** `clientMessageId` 是本次调用幂等键；`taskId` 指平台 Task 聚合，不能填会议 ID 或分析尝试 ID。本应用不提供 `taskId`，也不把回执中的该字段作为业务主键。
3. **队列控制与 Assistant 控制不同。** 当前 `ManagedQueueService.enqueue` 传入 `controlPolicy` 时会要求父控制上下文。从 View 发起的独立业务队列默认省略它。Assistant Task 使用服务端固定的 `detached` 策略，防止意外附着前台对话；其无父执行行为仍需接入实测。不存在名为 `independent` 的合法策略。
4. **`interrupted` 是暂停，`unknown` 是未知。** 都不能直接解释为失败或成功；继续核对到业务截止时间。失败、无有效结果结束、超时按本应用规则收敛。
5. **取消请求不是终止证明。** 过期尝试先在数据库失效，再尽力调用取消；即使宿主仍在执行，写入也必须被拒绝。
6. **工具上下文是逐次调用的。** 当前适配器从调用配置读取 `executionId`，从宿主中间件上下文读取 conversation、assistant、user。不可把创建中间件时的可变状态长期保存在闭包里供多个会议共享。
7. **安装作用域不等于资源权限。** `PluginContext.scopeKey` 是安装路由键；tenant、organization、owner 是业务隔离字段，两者不可互相替代。
8. **当前安装不是自动执行插件 migrations 目录。** `PluginSchemaSyncService` 创建临时 DataSource，明确设置 `migrations: []`、`migrationsRun: false`，在 PostgreSQL schema lock 下按插件实体元数据同步自身命名空间。首版以实体 metadata 表达表、约束和索引，不虚构自动迁移入口，也不调用宿主私有同步服务。

## 3 插件结构与职责

目标目录为 `community/apps/meeting-action-review`，包名暂定 `@xpert-ai/plugin-meeting-action-review`，稳定 artifact namespace 为 `meeting_action_review`。

根据当前仓库支持实体插件的规则，采用 `tenant` 级插件，实际业务限定组织上下文，缺失 organization 时拒绝创建。它不代表所有租户用户能访问其他人的会议。元数据版本、level、namespace 从本包 package.json 派生；不照搬旧技能中“有实体只能 system”的概括。

以下为规划路径，不表示文件已经创建：

```text
community/apps/meeting-action-review/
  src/index.ts                         插件导出与元数据
  src/lib/meeting-action-review.plugin.ts
  src/lib/entities/                    两个实体
  src/lib/types.ts / schemas.ts        共享 DTO、状态与校验
  src/lib/meeting-record.service.ts     创建、查询、保存、确认
  src/lib/analysis.service.ts           尝试状态、接收结果、重试
  src/lib/analysis-background.service.ts  队列处理与有期限的恢复扫描
  src/lib/meeting-tools.ts              两个 Agent 工具与一个中间件
  src/lib/meeting-view.provider.ts      View manifest、查询、人工 actions
  remote/                             React 页面、bridge、样式、locales
  blueprints/                         一个 Assistant 模板
  scripts/                            构建与产物检查
  README.md
```

目录按职责拆分，不再增加泛化工作流引擎、独立网关或通用仓储框架。共享 schema 同时约束服务端和前端；平台公开类型直接引用，业务边界使用明确 DTO，不用大面积类型断言绕过接口差异。

## 4 权限、Assistant 与工具绑定

### 4.1 服务端统一隔离范围

每次查询或修改均限定：`tenantId + organizationId + ownerUserId + assistantId`。前两者和当前用户来自宿主可信上下文；Assistant 来自宿主解析的 View 身份以及已校验发布上下文。会议 ID 是定位符，不是访问凭证。

第一版历史限定当前用户、当前 Assistant；不同会议每次尝试使用新的平台 conversation，不承接其他会议的原文或工具结果。Assistant 更新版本时保持可解析的实例身份，单次尝试另行固定发布版本。

后台 enqueue 保存实际操作者的 tenant、organization、user 与安装 scopeKey，平台 worker 恢复其身份并复验权限。不能用安装者或管理员身份代替操作人。用户被停用、组织访问被撤销或 Assistant 不再可访问时，执行应失败，不能自动提权补跑。

### 4.2 模板与 Feature

一个 Assistant 模板，只含主 Agent 和本插件的业务中间件。建议 Feature 名为 `meeting-action-review`；View manifest 声明相同的 required feature，模板显式启用。提交前核对可访问的发布版本、主 Agent、Feature 和模型配置；未发布或能力未就绪时给可操作提示，不创建假的成功记录。

第一版启用路径固定为：安装插件 → 使用配套模板创建助手 → 配置主模型并发布 → 打开 Feature 对应工作台 → 新建会议。插件注册表、工具和模板；用户通过平台完成助手创建、模型选择和发布，不新增应用市场一键初始化。普通聊天收到提取请求时引导用户在右侧工作台新建；不得借用聊天会话绕过分析尝试。

不要求用户在插件里填写模型 API Key。模型使用平台 Assistant 已配置的主模型。普通聊天不能伪造一次有效的业务分析调用：没有对应数据库尝试及可信会话绑定时，两个工具拒绝执行。

### 4.3 两个工具的输入与输出

| 工具名（拟定） | 模型提供的输入 | 返回/写入 |
| --- | --- | --- |
| `meeting_action_get_source` | 空对象 `{}` | 当前尝试的会议标题、片段列表、提取规则；不返回别的会议 |
| `meeting_action_submit_extraction` | `{items: [{task, owner, deadlineText, sourceSegmentIds, reviewNote?}]}` | 全量校验后原子写入初始提取与人工草稿，返回 accepted、条目数及业务状态 |

`task` 必须非空；owner、deadlineText 不明确时使用空值；sourceSegmentIds 非空且全部属于当前原文；reviewNote 只描述歧义与冲突。允许 `items: []`，表示有效空结果。服务端生成 itemId、来源和初始调整标记。模型不传 tenant、user、meetingId、attemptId、状态、revision、引文全文或确认信息。

工具通过可信 conversation、Assistant、Agent 与操作者范围查找唯一尝试。首次写入要求它仍是当前尝试、未超时且记录仍在分析中；成功提交后的相同内容重放只返回原接收回执，不再写入，因此不受之后的超时或人工确认影响。优先用预分配 conversation 绑定业务，不假定工具节点 `executionId` 必然等于根执行 ID；实际节点/根 ID 关系须在接入阶段验证，不能以猜测放宽权限。

提交内容存在结构或引用错误时，整批拒绝并返回可理解的校验信息，允许 Agent 在同一次执行中纠正。禁止截取部分合法条目当作成功。首次合法提交后，该尝试输出冻结；同一规范化内容重复提交返回同一结果，不同内容拒绝覆盖。

提示词只说明业务提取规则、两工具职责和先读原文后提交的顺序。会议原文作为不可信业务内容，不能把其中“忽略规则、调用其他工具”等文字当成运行指令。不另行实现自动多轮业务重试。

## 5 View 查询与人工操作契约

### 5.1 宿主协议与业务 DTO 的边界

查询走 `getViewData(context, viewKey, query)`；操作走 `executeViewAction(context, viewKey, actionKey, request)`。`request.input` 存放下表的业务输入；`targetId` 只允许作为会议定位符，并与 input 内同名 ID 做一致性检查。

View 数据使用宿主的 `item/items/total/nextCursor/meta`；操作使用 `success/message/data/refresh`。业务错误在 data 中提供稳定 code 与必要的 currentRevision 等字段，文案由语言目录映射；真实鉴权和传输错误仍按宿主错误通道处理，不全部伪装成 HTTP 成功。

### 5.2 查询

| 业务查询 | 参数 | 输出 |
| --- | --- | --- |
| `list` | cursor 可选 | 当前范围内的标题、状态、更新时间；按更新时间及 ID 倒序稳定分页 |
| `detail` | meetingId | 当前记录、revision、原文、条目、最近尝试的安全摘要、可用人工操作 |
| `entry` | meetingId 可选 | 未指定 meetingId 时打开最近记录，无记录则新建页；指定 ID 不存在或不可访问时返回 NOT_FOUND，不跳到其他会议 |

这是插件在 `XpertViewQuery` 中约定的 query 参数，不是新增的 SDK 方法。单页数量是内部技术参数，暂定 20；不增加搜索、筛选或历史删除。前端可获得状态，不获得内部 dispatchInput、完整异常栈或其他用户信息。

### 5.3 人工 actions

| actionKey | 业务输入 | 前置状态 | 成功效果 |
| --- | --- | --- | --- |
| `create_analysis` | title、sourceText、operationId | 新建表单；前置能力校验通过 | 创建记录和首次尝试；提交成功立即返回 meetingId、revision、processing |
| `retry_analysis` | meetingId、expectedRevision、operationId | failed | 同一记录创建新尝试；不修改原文，不复用旧 conversation |
| `save_draft` | meetingId、expectedRevision、operationId、items | review_ready | 原子替换人工草稿，revision 增加；不启动 AI |
| `confirm` | meetingId、expectedRevision、operationId、items | review_ready | 同一事务保存当前编辑并确认；返回 confirmed 和确认时间 |

items 的人工输入只包含稳定 id、task、owner、deadlineText。AI 原有条目的依据和原始来源由服务端保留；新增 id 由前端生成 UUID 用于编辑和请求重放，服务端校验唯一性并标为 manual。客户端不能修改 AI 依据、伪造 origin 或自行清除调整标记。

确认请求必须提交当前完整清单，不能先 save 再 confirm 造成中间窗口。空清单允许确认；负责人和时间缺失给提示但不阻止；空事项、重复 id、非法来源等结构问题阻止保存和确认。

### 5.4 主要错误与前端处理

| code | 处理 |
| --- | --- |
| `VALIDATION_FAILED` / `SOURCE_REFERENCE_INVALID` | 显示字段/依据问题；保留本地输入，不部分写入 |
| `NOT_FOUND` | 对越权和不存在使用相同安全结果；不泄露会议内容 |
| `VERSION_CONFLICT` | 保留本地编辑，提示记录已变化；不静默覆盖，允许重新读取后放弃本地改动 |
| `ALREADY_CONFIRMED` | 读取并展示已确认快照，不能重新保存或覆盖 |
| `OPERATION_CONFLICT` | 同一 operationId 配了不同内容，拒绝；不能以重试为名覆盖 |
| `ASSISTANT_NOT_READY` / `BACKGROUND_UNAVAILABLE` | 提示发布、模型或后台能力问题；提交前失败保留表单 |
| `ANALYSIS_FAILED` / `ANALYSIS_TIMEOUT` / `NO_VALID_RESULT` | 原文保留，显示“重新分析”；由用户发起新尝试 |
| `ATTEMPT_EXPIRED` | 旧工具结果被拒绝，不覆盖当前记录；只记安全诊断 |

明确失败与响应未知必须分开：明确未提交的失败允许恢复编辑；响应未知保留 pendingOperation（原 operationId、expectedRevision 与提交快照），先核实原操作，不能直接以新键重发。首次创建可用同键同内容重放取回原记录；保存/确认先读 detail，结合 lastSaveOperationId/confirmOperationId 与 revision 核实。确认按原方案先查询，再决定是否原样重试。无论哪种，都不能触发 AI。详细去重边界见数据库设计第 5 节。

## 6 服务端后台执行与恢复

### 6.1 一次正常提取

创建入口先校验当前身份并查同 operationId：已有记录则返回原结果，不再要求模型健康；只有确实需要创建的新操作才做模型/队列前置检查。恢复原操作不等于重新启动分析。

1. View 校验输入和当前用户的 Assistant 发布能力。事务中保存不可变原文、编号片段和第一条 queued 尝试，记录置 processing，提交后返回前端。
2. 事务外向平台默认执行池投递 dispatch。job payload 只带 meetingId、attemptId；安装范围和执行身份通过平台队列字段传递。
3. worker 重新读取当前尝试并校验身份。conversationId、根 executionId 和 clientMessageId 在创建尝试的事务中一次生成；worker 只读这些标识，在短事务中固定本次 dispatchInput 与发布版本；随后事务外调用 `startTask`。
4. startTask 的 prompt 是固定任务指令；工具按可信会话读取数据库原文。context/correlation 仅用于诊断，不能作为模型可控的授权凭证。
5. 回执与执行标识写入尝试；另投递短小的 reconcile 任务查询状态，不让单个 worker 一直等待模型完成。
6. Agent 读取原文并提交完整结果。结果校验通过后，在一个事务中把尝试置 succeeded、记录置 review_ready，并同时写入 immutable AI 初始清单和人工草稿。
7. 前端下一次轮询取得完整清单。平台执行稍后结束不改变已经接收的有效结果；后续工具写入仍受冻结规则限制。

SDK 接受预分配的 conversationId/executionId，当前实现使用它们创建后台会话与执行；它们必须与业务 attemptId 分开。该做法解决“工具先于 startTask 回执到达”的绑定窗口，但仍须用真实调用证明宿主保留预分配会话，且工具可取得它。此检查未通过前，不进入完整业务开发。

### 6.2 队列投递与崩溃窗口

两张业务表中的尝试记录就是持久化的待投递意图，不增加 outbox 表。数据库提交和 Redis 入队不是同一事务，因此必须补偿。

- dispatch/reconcile 的投递 jobId 使用 `mar-<jobName>-<attemptId>-<时间片>`，以便补投已失败队列任务；Assistant 的 clientMessageId 和预分配会话始终不变，避免 BullMQ 自定义 ID 的冒号问题。
- 插件启动时扫描所属安装范围内未结束尝试；运行期间启动可释放的短周期恢复扫描，初始周期 10 秒、每批 50 条，均为待测技术参数。停止/卸载时释放计时器；扫描器只做到期状态收敛和队列补投，不直接调用模型。
- 扫描按数据库 nextCheckAt/leaseUntil 竞争领取，允许多个 API 实例同时运行；最终正确性依赖事务、当前尝试条件与 Assistant 调用幂等，不依赖单进程计时器或队列 concurrency。
- 未入队、worker 丢失、回执落库失败等情况，均从已有尝试恢复。保留相同 clientMessageId 与完全相同的 dispatchInput，不创建新尝试或新会话。
- 状态不确定时优先查预分配根 execution/conversation；确需重复 startTask 也只能提交原幂等调用。当前宿主对模糊崩溃后的 claimed invocation 不保证重新启动，不能声称“必然自动续跑”；无法恢复则到期失败并让用户重试。
- 入队失败如果明确可诊断，可将本次置 failed；短暂投递异常可在原尝试、原期限内补偿。后台服务不可用到截止时间时，数据库仍必须收敛失败。

恢复扫描是插件内部的投递补偿，不是新的业务调度平台。首次实现只做这一个固定周期扫描，不新增通用 cron 配置、监控面板或无限技术重试。所有外部调用在事务之外，不能持有数据库锁等待模型。

### 6.3 平台状态如何转换为业务状态

| 观察结果 | 本插件行为 |
| --- | --- |
| 已有合法结果提交 | 以数据库 succeeded/review_ready 为准；不因迟到的结束回执改成失败 |
| queued / running | 继续核对，保留 processing |
| interrupted / unknown / 暂未找到执行 | 记录观察值，继续有期限核对；不能擅自创建新执行 |
| 平台 succeeded，但没有合法结果 | 持有记录锁复查后，以 `NO_VALID_RESULT` 失败；不解析最终聊天文本兜底 |
| 平台 failed，且无已接收结果 | 本次失败；保留原文 |
| 达到 deadlineAt，且无已接收结果 | 原子置 timed_out / failed，阻断旧工具写入，再尽力取消旧执行 |

业务截止时间从尝试创建开始计算，包含排队和恢复时间，重放不能延长。120 秒是当前待测初值。若实际模型无法在合理期限内完成，应调整参数并记录证据，不增加隐式第二次模型调用。

reconcile、扫描器、工具提交都锁同一记录，再锁对应尝试，按同一顺序转换；成功和超时并发时只能有一个合法终态。超时后才到达的有效结果也不能重新打开记录。

## 7 前端实现约束

页面状态分为路由状态（list/new/detail）、服务端快照、本地编辑副本、请求状态四类。只有 detail 的草稿部分允许本地编辑；不把 UI 的 loading 或 dirty 保存为业务状态。

| 场景 | 实现要点 |
| --- | --- |
| 新建 | 输入保留在内存；点击分析期间防重复；无保存输入草稿按钮；数据库提交成功才切详情 |
| 分析中 | 显示真实状态与等待提示，不显示虚构百分比；可切换记录；约 2 秒轮询为待测初值 |
| 切换/刷新 | selection 经宿主 View query 和 Workbench 导航恢复；iframe 不读写 localStorage/sessionStorage；真实刷新恢复选中项属于接入验证项 |
| 待核对 | 纵向条目；查看依据只展开条目内片段；定位原文展开全文并定位编号片段 |
| 编辑 | 维护 baselineRevision 与 editableItems；轮询不覆盖 dirty 数据；AI 原始依据只读 |
| 删除 | 直接移除，内存保留最近一次删除及原位置；保存成功/丢弃改动后清空撤销；保存失败仍可撤销 |
| 保存/确认请求中 | 暂停影响本次 payload 的编辑和重复提交；失败恢复编辑并保留内容 |
| 离开未保存详情 | 保存并切换 / 放弃并切换 / 继续编辑；保存失败留在原页；新建输入只提供放弃/继续 |
| 确认 | 一次整份确认弹窗；提交当前编辑快照；成功后显示正文与确认信息，无撤回修订按钮 |
| 已确认 | 普通只读文本；不是一组灰色 disabled 输入框 |
| 请求竞态 | 每次查询绑定 meetingId + 请求序号；旧页面响应不得覆盖新选中记录 |

分析详情可见时轮询该记录；列表可见且当前页有分析中记录时轮询列表，全部结束或离开列表即停止。重新进入列表立即刷新；其他记录后台完成不抢焦点、不覆盖当前编辑。停止轮询不会停止服务端处理。网络错误先展示读取失败与重载，不据此把业务任务改成失败。

复用 `@xpert-ai/plugin-shadcn-ui` 的 Button/Input/Textarea/Dialog 等组件与主题，不重建原生交互控件。文案放 `remote/locales/<locale>.json`；宿主语言变化不能清空草稿。页面只有主体纵向滚动，底部操作区预留空间；窄宽度下字段换行，不压成横向多列。

bridge 验证宿主消息、协议与请求 ID；原文和 AI 文本按文本渲染，不拼入未经处理的 HTML。仅显示安全错误摘要；调试默认关闭，日志不打印原文、模型密钥或 token。

### 7.1 左右联动协调

1. 以 meetingId + activeAttemptId 作为配对身份；由服务端授权查询给出可打开的执行引用，禁止按聊天标题或列表顺序猜测。
2. 用一个导航意图序号串行处理历史选择、新建和重试后的打开；先完成保存/放弃/继续编辑，再影响任一侧。忽略旧意图回执，避免迟到任务抢回焦点。
3. 用公开 workbench.navigation.open 分别选择工作台记录和 assistant.execution，会话参数来自真实平台回执。preserveView 只作为保留视图请求，不能推断内存草稿一定保留。
4. 命令回包可能因上下文变化丢失；结合合法 view.context.changed 中的目标 conversationId 与完整 View query 后置核对，不以 DOM 文本或私有 URL 作为身份依据。超时后先核实，不无限重发。
5. 原有 remote app 初始化会因 scopeRevision 变化清空编辑，需修正；同一已授权业务记录的上下文更新不应直接丢弃 dirty 副本。安全范围改变或宿主文档无法保留时，必须按受支持的保护流程处理，不能跨权限缓存。
6. 未保存的输入草稿仍不持久化；左侧切换失败不触发重新分析，已创建任务继续按原尝试运行。

### 7.2 插件边界与状态保护

新建仅打开右侧空表单，提示提交后切换会话；不清空左侧、不发送占位消息。未就绪的会话不导航，缺少引用时显式提示。原生停止/恢复保持原样，固定 deadline 不延长，不增加业务暂停态。

插件 requestGo 先完成保存/放弃/继续，再更新 View query 并同步对应会话。导航期间禁用重复切换，用户切走后清除自动同步意图；用户已开始编辑时不自动导航，保留手动同步入口并复用编辑保护。业务读取只接受当前序号，旧响应不得覆盖新选择。

桥接层验证消息来源、实例、单调递增 scopeRevision；由本次执行导航引发且 projectId 不变、conversationId 匹配的公开上下文变更可作为成功回执。其余范围变更拒绝旧请求并重新加载，不跨权限保存草稿。匹配的变更仍取消旧数据请求，重新授权查询后按同记录/同 revision 保留编辑，读取被拒绝则清空。重复 init 或语言变化不重置草稿。

左侧原生菜单、关闭页面等平台级离开保护不在本次范围。不隐藏平台按钮、不访问私有对象、不新增平台接口。

### 7.3 会话引用与恢复

详情 DTO 派生 analysisSession，状态为 pending/unavailable/ready；ready 才包含 conversationId、executionId，可选 threadId 及尝试序号。沿用两张表，不新增 DDL。已接收启动回执（startedAt）或已接受工具结果（outputHash）可证明执行存在；预分配 ID 本身不算就绪。

启动回执晚于业务完成时，仅补齐同尝试执行元数据，禁止把 succeeded/failed/timed_out 改回 running。历史按 activeAttempt 返回最新引用。左侧内容是原分析会话；人工草稿和确认仍以右侧为准。本次不改 Agent 模板或额外增加摘要生成任务。

## 8 构建、安装与测试安排

### 8.1 第一阶段先做接入验证

以下为接入检查清单：原生安装、实体注册、View 与工具、真实队列/模型、独立会话、保存确认及刷新恢复已通过。模糊崩溃、实际在途重启与取消专项仍未完整执行，具体结果以插件验证记录为准：

1. 对齐 3.29.1 SDK/contracts，确认所需公开导出和干净依赖安装；不以本地旧 3.29.0 示例依赖代替。
2. 证明 tenant 插件实体能通过宿主 schema preflight 注册并创建表、部分索引和复合外键，重启后不会重复建表；明确升级/保留数据的卸载行为。register 阶段只声明元数据，不能解析运行服务或启动恢复扫描；待真实运行初始化后才启动扫描。
3. 证明 View feature 激活、query 导航、选中记录刷新恢复、remote bridge 和主题正常。
4. 证明队列 handler 能按安装 scopeKey 找到，恢复真实用户；不能以管理员身份“测通”。
5. 证明主 Agent 后台调用不依赖左侧聊天，预分配 conversation 能在工具上下文匹配，区分根执行和节点 executionId，核对发布实例/版本 ID 映射。
6. 证明原幂等键的重复派发不会重新调用模型；关闭页面/API 重启/回执丢失后可核对或有期限失败；同时验证恢复扫描生命周期。

若缺少所需公开能力，应记录准确阻断再调整局部接入方案，不能通过宿主私有 import、修改生产数据或前端直连模型绕过。

### 8.2 后续四阶段

| 阶段 | 主要产物 | 出口 |
| --- | --- | --- |
| 数据与规则 | 两表实体与安装建表检查、服务、schema、事务和行为测试 | 保存确认原子性、越权、幂等、旧结果隔离通过 |
| 工作台 | 列表/新建/详情、编辑与导航保护 | 按需求第 4/5 节验证宽窄布局、未保存保护和请求竞态 |
| 真实 AI | Assistant 模板、两工具、后台任务与恢复 | 真模型完成提取，结果可人工编辑，失败可重试 |
| 验收交付 | 构建包、README、截图/录像、验证记录、PR | 需求第 8 节 A01～A29、H01～H07 和第 9 节七项交付逐项有证据 |

### 8.3 测试与包的边界

代码预留非生产 testFailAttemptId：可在指定尝试的派发边界产生 TEST_INJECTED_FAILURE，无普通用户按钮，不能通过 View/tool 输入启用。已归档的平台失败重试没有使用此开关，而是在专用助手上临时限制输出预算为 1，触发 NO_VALID_RESULT 后恢复为 8192，再对同一会议重试成功；没有改全局模型配置。验收材料分别说明设计测试入口与实际执行的故障方式。

- 业务行为测试覆盖状态转换、重复提交、并发确认/超时、跨用户/组织/会议隔离和保存失败；不以单纯 mock 调用次数代替业务断言。
- PostgreSQL 集成检查覆盖 JSONB、部分唯一索引、复合外键与事务竞争；内存数据库不能证明这些行为。
- 按 `plugin-dev-harness/README.md` 跑真实构建产物的生命周期、middleware 与 View 注册测试。该层不证明模型与真实平台成功。
- 用打包后的 remote 产物验证交互，再在实际 Xpert 上执行主流程与一次可复现失败重试。至少保留一个会议两次尝试的证据。
- 构建包含 server dist（含实体元数据）、remote 产物、Assistant 模板、必要元数据与 README；执行 metadata/table-name 检查并核对压缩包文件清单。不能只压缩源码目录当作可安装产物。
- 安装使用平台支持的上传/安装流程。是否需要重新加载 API 按实体注册与宿主返回状态判断，不能承诺“上传即全部热生效”，也不提前要求无依据重启。
- 连接配置沿用 community/.env，凭据不入库、不入包、不入日志。本文未读取或修改模型凭据。

## 9 尚待定稿与运行验证

| 事项 | 当前状态 |
| --- | --- |
| 输入 10,000 字符、结果 30 条 | 按第 9.1 节作为实施初值；实际验收后记录调整；不静默截断 |
| 标题/单字段最大长度、分页/扫描批量 | 统一按第 9.1 节与内部常量定义，不增加用户配置面板 |
| 120 秒超时、2 秒页面轮询、10 秒恢复扫描 | 技术初值，需真实模型和运行环境验证 |
| 后台能力接入 | 已验证实际队列、会话绑定、真实提取落库与工作台流程；在途重启/取消等专项保留待测 |
| 平台上游 main 对齐 | 已记录本地与镜像 SHA；正式验收前再核对任务书要求的上游基线 |

已确认的业务范围不因这些数值和接入检查重新扩张。任何确实需要改变交互的技术限制，应先同步需求方案，再修改开发和数据库设计。

发布接口能核对模型是否可选，但不返回完整上下文/输出预算；预算配置由安装步骤和真实模型验收核对，不能伪称当前 preflight 已精确计算 token。

### 9.1 第一版实现参数与模型预算

为开始实现，采用集中定义的初值：标题 120 字符、原文 10,000 字符、事项 500 字符、负责人和时间各 100 字符、歧义提示 200 字符；AI 和人工编辑后的清单总数均最多 30 项。计数统一按 Unicode 码点，片段偏移仍按 UTF-16；超限整次拒绝。以上是实施初值，实际模型验收不通过时调整并同步文档，不静默放宽或截断。

模板配置图执行步数上限；输入预算要覆盖原文、提示词和工具结果，输出预算需覆盖完整清单。首轮验证目标为支持工具调用、上下文至少 32K、单次输出预算 8K 的模型，模板使用宿主实际支持的 recursionLimit=20 限制图步骤，提示词要求最多三次提交尝试；图步骤不等于模型轮次，提示词次数也不作为安全边界，硬截止时间仍由服务端执行。字符数不等于 token 数；这是保守准入初值，不是精确 token 测算。不得自动修改用户模型提供器；不满足时明确提示配置问题。校验失败只在同一次执行和原截止时间内纠正，不新建隐式分析尝试。

再审查结论：上述 7 项已补充；没有新增业务页面、表、角色或外部集成。主流程接入实测已完成，剩余专项按插件验证记录列明，不把局部通过扩大为全部验收完成。

### 9.2 聊天联动验证结果

已完成 A→B→A、刷新恢复、运行中切回历史、原生新对话、未保存丢失复现和真实停止验证。结论为部分支持，详见[聊天联动能力验证](meeting-action-review-chat-sync-validation.md)；本次用户已选择收敛范围，处理插件导航及回执，其余保持平台现状。原探针阶段未改业务代码或宿主代码。

## 10 源码依据

以下均为本次实际阅读的源码；链接固定到核对提交，便于后续比较版本变化。

- [SDK Assistant Task 契约](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/plugin-sdk/src/lib/agent/middleware/capabilities/assistant-task.ts)：入口 Agent、幂等标识、状态及公开能力。
- [Assistant Task 宿主实现](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server-ai/src/xpert-agent-execution/runtime/assistant-task-runtime.service.ts)：发布校验、后台会话/执行创建和状态查询。
- [Assistant Task 调用适配器](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server-ai/src/agent-invocation/assistant-task-adapter.ts)、[Invocation Runtime](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server-ai/src/agent-invocation/invocation-runtime.ts)：调用键、checkpoint、控制策略和模糊崩溃处理。
- [Managed Queue SDK](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/plugin-sdk/src/lib/managed-queue/index.ts)、[入队实现](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server/src/managed-queue/managed-queue.service.ts)、[worker 实现](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server/src/managed-queue/managed-queue.processor.ts)：scope、身份与父控制上下文。
- [View 契约](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/contracts/src/view-extension/model.ts)、[Provider 接口](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/plugin-sdk/src/lib/view-extension/provider.interface.ts)：query/action/result 与宿主可信身份。
- [业务工具类型](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/plugin-sdk/src/lib/tool-provider/types.ts)、[工具适配器](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/plugin-sdk/src/lib/tool-provider/adapters.ts)：middleware 暴露、MCP 可关闭、逐次调用上下文。
- [插件安装管理](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server/src/plugin/plugin-management.service.ts)、[Schema preflight](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server/src/plugin/plugin-schema-sync.service.ts)、[DDL 范围限制](https://github.com/xpert-ai/xpert/blob/83e0d4ce9462996e7a4c24517f63559bedf23b7e/packages/server/src/plugin/plugin-schema-scope.ts)：安装级别、命名空间、建表和运行初始化的边界。
- [当前仓库约束](../AGENTS.md)、[实体命名检查](../scripts/check-plugin-entity-tables.mjs)、[Factory 示例](../community/apps/factory-operations/src/lib/factory-middlewares.ts)、[Meetings bridge 示例](../xpertai/apps/meetings/remote-components/meetings/src/bridge.ts)：仅参考接入、身份与桥接方式，不复制多角色业务。

智能维保继续作为列表/详情交互参考；旧示例不作为本插件 SDK 版本和后台能力契约的依据。

## 11 本次实施结果

插件 0.1.5 已安装且 loaded；仅插件代码变更，无 DDL、助手模板或平台源码变更。27 项自动化测试与真实双栏按钮联调通过。具体版本、截图、异常分支与平台边界见[聊天联动验证](meeting-action-review-chat-sync-validation.md#8-插件-015-实现与安装验收)。
