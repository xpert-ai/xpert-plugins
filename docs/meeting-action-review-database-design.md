# 会后行动项核对与确认工作台：数据库设计

- 文档版本：0.6，2026-11-01；对应插件 0.1.5，结构不变。
- 业务依据：[需求与开发方案](meeting-action-review-plan.md)。
- 接入、流程与工具：[开发设计](meeting-action-review-development-design.md)。
- 本文定义结构与约束。首版已在独立临时 PostgreSQL 测试库验证建表、事务与约束；随后已通过宿主原生安装流程在实际平台注册两表，真实提取、保存与确认均已验证。验证记录见插件 docs/verification.md。

## 1 两张表的职责

| 表 | 用途 |
| --- | --- |
| `plugin_meeting_action_review_record` | 一份会议的不可变输入、AI 初始结果、人工草稿/确认结果、当前业务状态 |
| `plugin_meeting_action_review_attempt` | 每次用户触发的分析、投递意图、平台执行关联、截止时间及失败摘要 |

一份会议对应多次尝试，但同时最多一个未结束尝试。行动项使用 JSONB 数组，不另建任务表；人员、日期表达都是文本，不建人员目录或日程表。平台已有队列、conversation、execution 表由平台管理，不复制进本插件。

表名通过 `pluginArtifactTableName('meeting_action_review', ...)` 生成。字段以下采用 snake_case 作为数据库物理名，DTO 使用 camelCase，通过 TypeORM 显式映射。所有时间为 `timestamptz`，服务端以 UTC 写入，前端按 locale 显示；ID 使用服务端生成 UUID，平台返回的标识按不透明 text 存储。

## 2 会议记录表 record

| 字段 | 类型 / 空值 | 说明 |
| --- | --- | --- |
| id | uuid，主键 | 会议记录 ID |
| tenant_id | uuid，非空 | 可信租户 |
| organization_id | uuid，非空 | 第一版仅组织内使用；无组织上下文拒绝创建 |
| owner_user_id | uuid，非空 | 实际创建者；后续人工操作必须为该用户 |
| assistant_id | text，非空 | 经宿主验证的 Assistant 实例身份；不是模型自由填写的 ID |
| title | text，非空 | trim 后非空；首版上限 120 个 Unicode 码点 |
| source_text | text，非空 | 规范化换行后的原文快照；提交后不可修改 |
| source_segments | jsonb，非空 | 服务端生成的编号、偏移；结构见第 4 节 |
| source_hash | char(64)，非空 | 规范化原文 SHA-256，诊断及一致性校验；不作为跨用户去重键 |
| status | text，非空 | processing / review_ready / confirmed / failed |
| active_attempt_id | uuid，可空 | 当前或最近一次尝试；创建事务内先空后关联，正常提交时必须已关联 |
| initial_items | jsonb，可空 | AI 首次合法输出，成功后不可更改；NULL 表示尚无结果，`[]` 表示成功空结果 |
| review_items | jsonb，可空 | 已保存的人工草稿；确认后原位冻结，不另存第二份确认数组 |
| revision | integer，非空，初值 1 | 服务端每次业务可见变更递增；前端写操作携带 expectedRevision |
| create_operation_id | uuid，非空 | 首次提交幂等键 |
| create_payload_hash | char(64)，非空 | title + 规范化 sourceText 的规范序列化 hash |
| last_save_operation_id | uuid，可空 | 最近一次成功保存的幂等键 |
| last_save_payload_hash | char(64)，可空 | 对应保存请求的规范化 hash |
| confirm_operation_id | uuid，可空 | 成功确认请求的幂等键；之后不变 |
| confirm_payload_hash | char(64)，可空 | 对应确认 payload 的 hash |
| confirmed_at | timestamptz，可空 | 只有 confirmed 时非空 |
| confirmed_by | uuid，可空 | 必须等于 owner_user_id；预留可审计字段，不表示多角色审批 |
| created_at | timestamptz，非空 | 创建时间 |
| updated_at | timestamptz，非空 | 业务可见变更时间；后台轮询不反复刷新它 |

未保存的表单、编辑副本、最近一次删除撤销栈只在前端内存中，不存入本表。刷新恢复的是数据库已保存结果，不承诺恢复尚未保存的编辑。

## 3 分析尝试表 attempt

| 字段 | 类型 / 空值 | 说明 |
| --- | --- | --- |
| id | uuid，主键 | 一次人工触发的分析 ID |
| record_id | uuid，非空 | 所属会议 |
| tenant_id / organization_id / owner_user_id | uuid，均非空 | 与 record 保持一致，用复合外键约束 |
| attempt_no | integer，非空 | 从 1 递增；锁定 record 后分配 |
| request_operation_id | uuid，非空 | 初次创建或 retry 请求幂等键，同记录唯一 |
| request_payload_hash | char(64)，非空 | 防止同键不同请求；包含 action 与原始 expectedRevision（如有） |
| status | text，非空 | queued / dispatching / running / succeeded / failed / timed_out |
| installation_scope_key | text，非空 | 宿主 PluginContext 提供的安装路由；不充当业务权限 |
| published_version | text，可空 | 派发前解析并冻结的 Assistant 发布版本；未完成预检时可空 |
| agent_key | text，可空 | 派发时固定的主 Agent key |
| client_message_id | text，非空 | 本次 Assistant 调用唯一幂等键，例如 `mar-<attempt UUID>` |
| conversation_id | text，非空 | 创建尝试时预分配 UUID 字符串；独立于前台聊天和其他尝试 |
| root_execution_id | text，非空 | 预分配的根执行 ID；用于状态核对，不能冒充工具节点执行 ID |
| thread_id | text，可空 | 平台回执实际返回的 thread ID |
| dispatch_input | jsonb，可空 | 派发前一次性固定的完整 startTask 输入；后续重放逐字段相同 |
| output_hash | char(64)，可空 | 第一次成功输出规范化 hash，用于工具重放去重 |
| platform_status | text，可空 | 最近观察的 SDK 状态，供诊断；不直接作为业务状态 |
| error_code / error_message | text，可空 | 稳定错误码与脱敏摘要；禁止保存密钥、堆栈、完整模型请求 |
| deadline_at | timestamptz，非空 | 创建时固定，初始建议 created_at + 120 秒；待实测 |
| next_check_at | timestamptz，非空 | 下次投递/核对时间；用于恢复扫描，终态不再扫描 |
| lease_until | timestamptz，可空 | 恢复扫描或派发的短租约；崩溃后允许重新领取 |
| started_at | timestamptz，可空 | 获得实际启动/运行证据的时间，不等同创建时间 |
| finished_at | timestamptz，可空 | 终态时间；与 status 对应 |
| created_at / updated_at | timestamptz，非空 | 尝试创建与诊断更新，不影响历史会议排序 |

`dispatch_input` 不包含用户 token、模型 API Key 或整段重复原文。它保存固定 prompt、xpertId、agentKey、expectedPublishedVersion、conversationId、executionId、clientMessageId、controlPolicy 与有限 correlation 等；会议原文由工具按可信绑定读取。

它是服务端内部数据，不由前端或 Agent 传入，也不作为历史详情响应返回。无合法 dispatch_input 的 queued 尝试可重新预检；一旦开始派发就不能改发布版本或 prompt 后冒充同一个幂等调用。

## 4 JSONB 数据契约

### 4.1 原文片段

source_segments 形状示意：

```json
{
  "schemaVersion": 1,
  "offsetUnit": "utf16",
  "segments": [
    { "id": "S001", "start": 0, "end": 18 }
  ]
}
```

偏移采用 JavaScript 字符串 UTF-16 索引和 `[start, end)` 半开区间；示例数字只示意结构。先把 CRLF/CR 转为 LF，再保留该文本快照。按非空段落/行生成有序片段；空白仍留在 source_text，片段不交叠。初版不再实现语义分段或自动摘要分段。

工具返回编号及 `source_text.slice(start,end)`；提交时按编号重新取原文。前端“查看依据”和“定位原文”使用同一份片段映射，不接收模型编写的引文全文。引用存在证明可定位，不证明提取语义正确。

### 4.2 初始清单与人工清单

initial_items、review_items 均为数组，条目结构示意：

```json
[
  {
    "id": "服务端生成的 UUID",
    "task": "整理接口清单",
    "owner": "小李",
    "deadlineText": "周五前",
    "sourceSegmentIds": ["S003"],
    "origin": "ai",
    "humanAdjusted": false,
    "reviewNote": null
  }
]
```

| 属性 | 服务端规则 |
| --- | --- |
| id | 同一清单内唯一且稳定；AI 条目由服务端生成；人工新增 UUID 校验后接收 |
| task | 非空文本；不允许用户只增加空白条目后保存 |
| owner / deadlineText | string 或 null，空白统一为 null；不自动解析为用户 ID 或日期 |
| sourceSegmentIds | AI 条目必须引用本记录存在的片段；人工新增为 `[]`，显示“人工补充，无原文依据” |
| origin | ai / manual；由服务端依据初始清单和新增 itemId 判断，客户端不可改 |
| humanAdjusted | AI 条目当前可编辑字段与初始值不同则为 true；恢复初始值后为 false；manual 以人工来源展示 |
| reviewNote | AI 给出的歧义/冲突提示，纯文本只读；人工修改后保留作为初始提取提示，不冒充重新 AI 校验 |

“负责人未明确”“时间未明确”等缺失提示根据当前可编辑字段实时派生，补齐后消失，不额外保存一套容易过期的 warnings。AI 的语义歧义提示与这些实时字段提示分开显示。

人工提交只接受 id/task/owner/deadlineText。旧 AI itemId 对应的依据与 reviewNote 从初始清单取回；未出现于初始清单且符合新增规则的 ID 标为 manual。不能通过伪造字段将人工补充包装成 AI 有据提取。

服务端统一校验数组长度、字段长度、ID、引用和 JSON 形状。首版采用原文 10,000 字符、AI 与人工清单总数均 30 条，字段上限见开发设计 9.1；字符数按 Unicode 码点，任何超限都整次拒绝，不截断输入或输出。

## 5 索引、约束与幂等边界

### 5.1 数据库约束

| 对象 | 约束 |
| --- | --- |
| record | 主键 id；revision >= 1；title/source_text 非空白；status 值域检查 |
| record 创建幂等 | 唯一 `(tenant_id, organization_id, owner_user_id, assistant_id, create_operation_id)` |
| record 隔离引用 | 唯一 `(id, tenant_id, organization_id, owner_user_id)`，供 attempt 复合外键使用 |
| attempt 归属 | `(record_id, tenant_id, organization_id, owner_user_id)` 引用 record 对应四列，拒绝跨会议归属拼接 |
| attempt 次序/请求 | 唯一 `(record_id, attempt_no)`；唯一 `(record_id, request_operation_id)` |
| attempt 调用绑定 | client_message_id、conversation_id、root_execution_id 分别唯一，防止两个尝试意外共用执行 |
| 单一未结束尝试 | `(record_id)` 部分唯一索引，条件为 status 属于 queued/dispatching/running |
| 当前尝试绑定 | attempt 唯一 `(record_id,id)`；record 的 `(id,active_attempt_id)` 复合外键引用该组合，禁止指向别的会议 |
| 结果形状 | initial_items/review_items 非 NULL 时 `jsonb_typeof(...) = 'array'`；复杂条目结构由服务端 schema 校验 |
| 确认状态 | confirmed 必须具备结果、confirm operation/hash、confirmed_at/by，且 confirmed_by = owner_user_id；非 confirmed 不得带确认元数据 |
| 结果存在性 | review_ready/confirmed 必须两份 items 均非 NULL；processing/failed 在本版尚无成功结果，均为 NULL |
| 尝试终态 | succeeded/failed/timed_out 必须 finished_at 非空；非终态 finished_at 为空；成功必须有 output_hash |

循环关联通过事务顺序处理：先插 record（active_attempt_id 暂空），再插 attempt，再更新 active_attempt_id，最后提交；无需以关闭外键解决。第一版无删除入口，外键采用限制删除；卸载也不默认清空业务数据。

记录确认后不可写、原文成功提交后不可变、当前尝试与状态一致等跨字段/跨表规则由业务服务事务保证；数据库 CHECK 不能跨表检查，不能把服务约束误写成已经存在的数据库强制约束。

### 5.2 查询索引

- 历史列表：record `(tenant_id, organization_id, owner_user_id, assistant_id, updated_at DESC, id DESC)`。
- 恢复扫描：attempt `(installation_scope_key, next_check_at, id)`，仅覆盖未结束状态；deadline_at 辅助到期检查视真实查询计划再决定，不提前泛化索引。
- 单记录尝试：已有 `(record_id,attempt_no)` 唯一索引覆盖。
- 工具查找：conversation_id 唯一索引，再复核所属记录的完整身份范围、Agent 和当前尝试。

所有索引/外键名称带插件命名空间并控制在 PostgreSQL 标识符长度限制内，迁移时稳定命名。不能只用 recordId 查出数据后把前端隐藏按钮当成权限校验。

### 5.3 operationId 与 revision 分工

operationId 表示一次用户意图，revision 表示写入所依据的快照；两者都需要。客户端遇到响应丢失保持原 operationId、expectedRevision 和完整 payload，不自动生成新键。

处理顺序：先验证权限，再查同操作键的既有结果并比较 hash，最后对新操作检查 expectedRevision、状态并修改。这样确认已经提交但回包丢失时，不会仅因旧 revision 而误报失败。

- 创建：同键同内容返回原记录当前状态；同键不同内容拒绝。
- 重试：从 attempt.request_operation_id 找既有尝试；已创建就返回该尝试，不再创建第三次。
- 保存：记录最近一次成功保存键/hash。对最近操作可直接确认成功；更老保存键在发生后续保存后不保证历史回执重建，但因旧 revision 必须拒绝，绝不能重放覆盖。UI 重新读取并保留本地编辑供用户决定。
- 确认：confirm key/hash 永久保留；同键同内容返回已确认快照；不同请求面对 confirmed 一律只读，不重新执行。
- 模型提交：按 attempt.output_hash 去重，比较的是规范化输出字段，不包含随机生成 itemId；同内容返回已接收结果，不同内容拒绝。

hash 使用固定字段顺序的规范化序列化与 SHA-256；数组顺序有业务意义，保留原顺序；空白/null 规范化规则与 schema 一致。hash 不替代权限，也不把不同会议自动合并。

### 5.4 响应未知与前端恢复

前端保留未决请求的 operationId、原 payload 和 expectedRevision；不得将传输超时解释为数据库回滚。detail 仅向授权创建者返回 lastSaveOperationId、confirmOperationId 和 revision，供响应丢失后的核实；不返回内部派发配置。新建原样重放在身份检查后优先查创建键，再决定是否需要模型预检。未知请求核实前不复用原键提交修改后的内容。

条目对外统一使用 id，不再另设 itemId 字段。conversation_id、root_execution_id、client_message_id 在创建 attempt 的事务中一次生成；worker 与恢复过程不重新生成。仅 dispatch_input/发布版本在首次外部派发前固定。

## 6 状态与事务

### 6.1 记录状态

| 当前状态 | 操作/事件 | 新状态 |
| --- | --- | --- |
| 尚未存在 | create_analysis 事务成功 | processing |
| processing | 当前尝试提交合法全量结果 | review_ready |
| processing | 明确失败、无结果结束或截止超时 | failed |
| failed | 用户 retry_analysis | processing |
| review_ready | save_draft | review_ready，revision 增加 |
| review_ready | confirm，含当前编辑 | confirmed |
| confirmed | 任何修改/重新分析 | 拒绝，保持 confirmed |

不增加“部分成功”“逐行已确认”或“撤回确认”状态。有效空清单走正常 review_ready/confirmed，不能因为 `items.length === 0` 误判失败。

### 6.2 尝试状态

正常链路为 queued → dispatching → running → succeeded；工具可能先于回执返回，所以 dispatching 可直接 succeeded。未结束状态均可因明确异常进入 failed，或到期进入 timed_out。终态不可重新开启，用户重试新增一行。

platform_status 单独保存 queued/running/succeeded/failed/interrupted/unknown 等观察值。平台 interrupted/unknown 不直接改变业务 attempt.status 为失败；在期限内继续核对，到期才按超时收敛。

### 6.3 关键事务

| 事务 | 锁与更新 |
| --- | --- |
| 创建 | 插 record、attempt、关联当前尝试一次提交；同操作键竞争由唯一约束处理 |
| 重试 | 锁 record，先查同 operationId，验证 owner/status/revision；确认旧尝试终态，插新 attempt，切 active_attempt_id、processing、revision |
| 接收结果 | 先锁 record，再锁 attempt；检查会话身份与当前 attempt；已成功且同 output_hash 则只回原回执；首次写入检查 deadline、processing，整体写 initial/review、output_hash、成功终态、revision |
| 保存 | 锁 record，先幂等检查，再版本/状态检查；服务端重建只读元数据，整体替换 review_items、save key/hash、revision |
| 确认 | 同一锁中保存最新 items、确认键/hash、confirmed_at/by、status、revision，一次提交 |
| 失败/超时 | 锁 record 再 attempt；若已有成功结果则不回退；否则只终结仍是 active 的尝试并更新 record |
| 恢复领取 | 短事务领取已到 next_check_at 的未结束尝试并设置 lease_until；外部入队/状态查询放在事务外，后续按同一尝试条件落库 |

查询平台状态时读到的旧快照不能直接覆盖数据库。每次写回必须再次检查 current attempt、终态、revision 或等价 CAS 条件。所有涉及双表写入的路径统一按 record → attempt 的顺序加锁，降低死锁风险。

## 7 安装建表、升级与验证

当前宿主在安装/更新激活前运行 `PluginSchemaSyncService`：载入插件实体，在临时 PostgreSQL 连接中获取 schema lock，只同步本插件命名空间。该实现明确关闭 migration 自动运行，不能假设压缩包里放一个 migrations 目录就会被执行。依据见[开发设计源码索引](meeting-action-review-development-design.md#10-源码依据)。

首版将列、CHECK、唯一约束、部分索引与复合关联写入 TypeORM 实体 metadata，交给宿主安装 preflight 创建；通过真实 PostgreSQL 检查生成结构与本设计一致，尤其验证循环关联和部分索引。不新增全局 `synchronize: true` 配置，不直接调用宿主私有服务，也不在前端打开页面时建表。

register 会在 preflight 的受限上下文执行，此时不能 resolve 运行服务、查业务表或启动恢复扫描。运行初始化与实体声明分开。两表 schema 未完成或约束缺失时，安装验证失败，不能降级为内存存储继续宣称成功。

后续升级应先审查实体差异产生的 DDL、备份和保留现有数据；当前元数据同步机制不等于任意破坏性升级都安全。首版不另建迁移记录业务表；确有数据转换需求时再明确受支持的版本化迁移执行方式，不能自行假定平台已经提供。namespace 固定不改，卸载/回滚不主动 DROP 有数据表，测试清理由专用测试库承担。

必须验证：

1. 同用户双击首次提交只有一份记录；两个请求内容不同却同键时拒绝。
2. 同一失败记录重复 retry 只有一条新尝试；旧执行晚到不能写入。
3. 保存/确认回包丢失后使用原键重试能识别已提交，不再跑 AI。
4. 两个页面基于同 revision 保存时，后到者得到冲突，不能覆盖先到者。
5. 成功提交与超时竞争只有一个终态；取消失败也不能让旧结果重开记录。
6. 刷新看到已保存结果；未保存编辑不错误持久化；confirmed 数据不能再修改。
7. 不同 owner/organization/tenant/Assistant/会议之间不能读取或提交结果。
8. NULL 与空数组正确区分；人工修改来源标记、无依据的手工条目和原文定位一致。
9. DB 已提交但未入队、已启动但回执未保存、API 重启、队列不可用均可恢复核对或截止失败。
10. 安装/重复加载不重复建表、不误改其他命名空间，实际约束/索引与此文档一致；记录最终测试的宿主、SDK、插件 SHA。

隔离 PostgreSQL 中已执行的验证见插件验证记录，真实平台主流程与失败重试也已完成；在途重启、跨账号等专项仍待执行。数据库验证证据与真实 AI、UI 验证一起，按需求方案第 8/9 节归档，不用结构设计文档替代运行证据。

## 8 聊天联动的数据约束（本轮无 DDL）

对应目标与实测见[聊天联动能力验证](meeting-action-review-chat-sync-validation.md)。继续使用两张表；不新增聊天消息表、通知表或聊天编辑历史。聊天消息与执行流由平台持久化。

- 历史记录对应 record.active_attempt_id 指向的最近尝试，左侧引用该尝试的 conversation_id、root_execution_id、thread_id。重试建立新尝试及新会话，不覆盖旧记录。
- 预分配的 conversation_id / root_execution_id 不证明平台对象已经存在；View 的可打开状态要由已保存回执或受授权的平台状态核对确认，不能仅检查字段非空。
- 在详情 DTO 中增加派生的 analysisSession（尝试序号、可用状态及可用时的执行引用），不新增数据库列。所有引用只在记录归属校验后返回；宿主打开时再次授权。
- 当结果早于启动回执写入时，允许补齐线程等只读关联元数据，不改变成功/失败终态，不覆盖人工草稿或确认结果。
- 导航、选择意图和页面未保存编辑仍是 UI 状态；切换左右不增加记录 revision，也不重新分析。没有会话时不可创建占位行充当清空。
- 人工确认仍原子保存 review_items 与确认信息。左侧保留原分析时点的摘要，不因人工增删而篡改 initial_items 或历史消息。

实测原生 Stop 后平台为 interrupted，而业务仍 processing；固定截止时间后业务为 timed_out，平台历史仍 interrupted。这是 0.1.4 探针阶段观察到的真实行为，不代表已定义新的暂停业务。截止时间、状态枚举及恢复规则本轮均未改动；用户已确认保留原生控制现状，本次不把暂停/恢复接成新的业务操作。

会话就绪判据：started_at（实际启动回执）或 output_hash（已接受工具结果）存在，才输出 ready 的导航引用；否则活动尝试为 pending、终态为 unavailable。此判据不新增字段，不依据预分配 UUID 或标题推断会话。
