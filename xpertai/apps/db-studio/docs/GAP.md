我调查了当前 DB Studio 实现、交接文档，以及原始 [LibreDB Studio](/Users/xpertai05/tiwen/libredb-studio) 的 Agent 实现。当前 DB Studio 已增加的是 **3 个 Agent Middleware、13 个 Agent Tools**。这里的 middleware 指 Xpert 的 Agent middleware，不是 HTTP/Nest middleware。

### 当前 DB Studio 已增加的 Middleware

| Middleware | 作用 | 当前工具 |
|---|---|---|
| `DbStudioExploreMiddleware` | 数据源发现、能力读取、对象浏览、只读查询、EXPLAIN、草稿上下文 | 8 个 |
| `DbStudioChangesMiddleware` | 将写操作转换成冻结计划，并在服务端策略允许后排队执行 | 3 个 |
| `DbStudioTransferMiddleware` | 数据导入计划和查询结果分页读取 | 2 个 |

定义位置：

- [middleware.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/middleware.ts:70)
- [constants.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/constants.ts:19)
- [db-studio-assistant.yaml](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/db-studio-assistant.yaml:70)

#### 1. `DbStudioExploreMiddleware`

它还实现了一个 `wrapModelCall`：

- 从宿主运行时读取当前选中的 DB Studio 草稿引用。
- 只把 `draftId` 和冻结的目标连接注入 Agent 上下文。
- 不把完整 SQL 直接注入 system prompt。
- 明确要求 Agent 先调用 `db_studio_draft` 重新读取草稿。
- 选中草稿不会额外授予任何数据库权限。

对应代码：[middleware.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/middleware.ts:81)

它提供的 8 个工具如下：

| Tool | 功能 |
|---|---|
| `db_studio_connections` | 列出当前工作空间授权的数据源，要求 Agent 先发现连接 |
| `db_studio_capabilities` | 读取数据库引擎、版本、数据库/schema 位置、当前执行策略和不可用能力 |
| `db_studio_objects` | 分页读取表和视图对象，支持搜索，单页最多 100 个 |
| `db_studio_describe` | 读取真实列类型、主键/唯一键、表模型和定义 |
| `db_studio_query` | 执行一条经过只读校验的查询，默认 50 行，最多 200 行，有超时和执行回执 |
| `db_studio_explain` | 读取估算执行计划，不执行 SQL，不允许 `EXPLAIN ANALYZE` |
| `db_studio_result_page` | 根据 `executionId` 读取已保存查询结果的分页 |
| `db_studio_draft` | 重新读取持久化草稿，确认其冻结连接和 SQL 内容 |

源码位置：[middleware.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/middleware.ts:103)

#### 2. `DbStudioChangesMiddleware`

这个 middleware 是受控变更通道，不是普通的自由 SQL 执行通道。

| Tool | 功能 |
|---|---|
| `db_studio_plan_change` | 冻结一条支持的写 SQL、目标、参数、理由、策略版本和摘要哈希；不执行 |
| `db_studio_execute_plan` | 只执行状态为 `ready` 的计划，服务端会再次检查连接权限、策略版本和审批状态 |
| `db_studio_plan_status` | 查询计划及其执行回执，区分成功、失败、pending、unknown 等状态 |

源码位置：[middleware.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/middleware.ts:188)

当前设计中的安全边界：

- Agent 不能调用 `approve_plan`。
- Agent 不能修改连接策略。
- 计划必须绑定具体数据源、对象、参数和策略版本。
- 修改计划内容后不能复用原来的审批或 `operationId`。
- 执行出现提交不确定或连接中断时返回 `unknown`，不能自动重试。
- 当前部署配置启用了只读测试模式，因此真实环境中的写计划执行被整体阻止。

核心实现：[studio.service.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/studio.service.ts:469)

#### 3. `DbStudioTransferMiddleware`

| Tool | 功能 |
|---|---|
| `db_studio_plan_import` | 将最多 200 行显式数据冻结成导入计划；只生成计划，不上传、不导入 |
| `db_studio_export_page` | 读取已有查询结果的有限分页，最多 200 行；不返回凭据或服务器文件路径 |

源码位置：[middleware.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/lib/middleware.ts:223)

需要注意：当前 Agent 只有分页读取式“导出”工具，真正生成 CSV/JSON 文件的能力主要在 Workbench 的 `export_result` View action 中，Agent 还没有完整的文件导出工具。

### 当前 Assistant 的组织方式

当前 DSL 是一个 Agent 加三个必需 middleware：

```text
Agent_DbStudio
├── Middleware_DbExplore
├── Middleware_DbChanges
└── Middleware_DbTransfer
```

定义位置：[db-studio-assistant.yaml](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/db-studio-assistant.yaml:35)

当前实现没有像 LibreDB 那样区分：

- Plan / Agent 两种模式
- Investigate / Optimize / Assess / Operate / Analyze 五种工作流
- 每种工作流自己的工具集合和完成判定
- 带证据引用的 `compose_report`
- 结果展示语义，例如明确指定结果应该以表格还是图表呈现

现在主要依靠一个较长的 Agent prompt 来约束行为。

### 原始 LibreDB Agent 已有的能力

原仓库的 Agent 工具定义在：

- [tools.ts](/Users/xpertai05/tiwen/libredb-studio/src/lib/agent/tools.ts:828)
- [AGENT_GUIDE.md](/Users/xpertai05/tiwen/libredb-studio/docs/AGENT_GUIDE.md:74)
- [AGENT.md](/Users/xpertai05/tiwen/libredb-studio/docs/AGENT.md)

原仓库实际设计的是五个工作流：

#### Investigate：数据库调查

工具：

- `inspect_schema`
- `run_read_query`
- `inspect_plan`
- `compose_report`

特点：

- Agent 只能执行受控只读语句。
- 每个报告结论必须引用 Agent 实际读取的结果。
- 没有证据的结论会被拒绝。
- 查询结果、执行时间和执行 ID 会进入可追溯记录。
- 运行结束时会判断“是否真正回答”，而不是只看运行状态是否为 succeeded。

#### Optimize：SQL 性能优化

在 Investigate 基础上增加：

- `compare_plans`
- `recommend_change`

特点：

- 比较两次估算执行计划。
- 可以建议索引或 SQL 重写。
- 建议不会自动执行。
- 只能把建议放入编辑器供用户确认。
- 明确禁止把 `EXPLAIN ANALYZE` 当作只读操作。

#### Assess：数据质量评估

增加：

- `profile_table`

它只返回统计数量，不返回原始值：

- 总行数
- 非空数量
- distinct 数量
- 空值比例
- 低基数
- 疑似个人信息格式
- 外键是否缺少索引

原仓库明确禁止使用 `min`、`max` 等可能泄漏真实字段值的统计方式。

#### Operate：数据库运行状态分析

增加：

- `inspect_operations`

支持读取：

- 当前会话
- 慢查询
- 表统计
- 索引统计
- 存储占用
- 健康状态

这个工作流不发送自由 SQL，而是调用数据库或驱动提供的原生监控接口，因此可以覆盖 MySQL、Oracle、SQL Server、MongoDB、Redis 等没有统一只读 SQL 执行配置的引擎。

原仓库特别强调：监控读数是某一时刻的快照，不应被 Agent 描述成历史趋势。

#### Analyze：业务数据分析

增加：

- `profile_table`
- `present_answer`

特点：

- Agent 执行聚合查询。
- 明确记录哪个查询结果就是最终答案。
- 判断结果应该展示为表格还是图表。
- 图表的列名必须存在于真实查询结果中。
- 报告必须引用同一个结果，否则判定为未回答。
- 可以提供可选的“将最终查询交给编辑器执行”流程，但需要单独的用户确认和只读会话保护。

#### Plan 模式

原仓库还有一个重要模式：

- Plan 模式没有任何工具。
- Agent 只读取 schema grounding 信息。
- 生成一条供用户自己执行的 SQL 或其他引擎语句。
- 不执行用户 SQL，不写库，不产生数据库变更。
- 生成语句后由用户手动“Apply to editor”。

这和当前 DB Studio 的 `db_studio_plan_change` 不同：当前计划工具面向写操作治理，而 LibreDB 的 Plan 模式是“无工具的语句规划”。

### 当前 DB Studio 与 LibreDB 的主要差距

| 能力 | 当前 DB Studio | LibreDB Agent |
|---|---|---|
| 数据源发现 | 有 | 有 |
| Schema/对象浏览 | 有，拆成 capabilities / objects / describe | 有，集中在 `inspect_schema` |
| 只读 SQL | 有 | 有 |
| EXPLAIN | 有 | 有 |
| 结果分页 | 有 | 有 |
| 证据型报告 | 没有独立工具 | 有 `compose_report` |
| 结果作为最终答案 | 没有 | 有 `present_answer` |
| SQL 性能优化 | 有 EXPLAIN，但没有计划比较和建议工具 | 有 |
| 数据质量画像 | 没有 Agent tool | 有 |
| 运行状态监控 | 没有 Agent tool | 有 |
| 图表型数据分析 | Workbench 有图表，但 Agent 没有结果呈现工具 | 有 |
| 只生成计划、不提供工具 | 没有独立模式 | 有 Plan mode |
| 写操作治理 | 有，且比 LibreDB 更强 | 原始 Agent 严格只读 |
| 导入计划 | 有 | 原始 Agent 没有对应写入能力 |
| Agent 直接生成完整导出文件 | 没有 | 原仓库也存在类似导出缺口 |
| Agent run 历史、恢复、跨会话 | 当前没有独立 Agent run ledger | LibreDB 有，但仍记录了 resume/export 等限制 |

### 建议规划增加的功能

#### P0：优先增加证据型 Agent 能力

这是最应该先做的一层，因为它能直接提升当前 Agent 的可靠性。

1. 增加 `db_studio_compose_report`

建议输入：

```ts
{
  claims: [
    {
      text: string
      evidence: string[]
    }
  ],
  conclusion: string
}
```

服务端验证：

- `evidence` 必须引用当前 Agent 运行产生的 `executionId`、schema snapshot 或 plan record。
- 不允许引用其他用户、其他工作空间或其他 Agent run 的记录。
- 不允许只凭模型文本生成报告。
- 每条 claim 都要有真实证据。
- 记录报告是否真正回答了目标。

2. 增加 `db_studio_present_answer`

用于数据分析场景：

```ts
{
  executionId: string,
  presentation: "table" | "bar" | "line" | "pivot",
  x?: string,
  y?: string,
  title?: string
}
```

服务端检查：

- `executionId` 必须属于本次运行。
- 图表字段必须存在于真实结果列中。
- 结果必须是已执行的查询，不能把 EXPLAIN 或 schema 结果当成答案。
- 页面通过 host event 自动打开对应结果面板。

3. 增加 Agent workflow 区分

建议先支持：

- `investigation`
- `query-optimization`
- `database-assessment`
- `operations`
- `data-analysis`

不同 workflow 只暴露自己需要的工具，避免把所有能力都一次性给模型。例如：

```text
investigation
  connections
  capabilities
  objects
  describe
  query
  explain
  result_page
  compose_report

query-optimization
  investigation tools
  compare_plans
  recommend_change

database-assessment
  investigation tools
  profile_table

operations
  inspect_operations
  compose_report

data-analysis
  investigation tools
  profile_table
  present_answer
  compose_report
```

当前三个 middleware 可以继续保留作为平台级能力，但 Agent 创建时应根据 workflow 选择工具集合。

#### P1：SQL 优化与数据画像

4. 增加 `db_studio_compare_plans`

输入两个当前 run 内的执行计划 ID：

```ts
{
  beforeExecutionId: string,
  afterExecutionId: string
}
```

要求：

- 两个计划都必须由本次 Agent 运行产生。
- 只能比较估算计划。
- 不执行 SQL。
- 结果中明确声明没有真实执行耗时。
- 不能让 Agent 伪造“优化后耗时下降”。

5. 增加 `db_studio_recommend_change`

建议只允许返回：

- 一个索引建议
- 或一份 SQL 重写建议

所有建议必须：

- 引用当前 run 的 EXPLAIN/查询证据。
- 生成草稿或建议记录。
- 默认不执行。
- 可由用户点击“Apply to editor”。
- 如果要进入现有 `DbStudioChangesMiddleware`，必须明确区分“建议”和“写计划”。

6. 增加 `db_studio_profile_table`

建议分三个深度：

- `basic`：行数、空值数、非空数
- `distribution`：distinct 数量和基数分布
- `pattern`：邮箱、手机号/数字串等格式计数

必须只返回统计数量，不返回实际字段值。

对 Doris 需要另外适配：

- 表行数
- 分区数
- 分桶信息
- 分布键
- 副本/副本状态
- 物化视图信息
- 索引或倒排索引信息

Doris 的统计能力应根据真实版本和表模型报告，不要照搬 PostgreSQL 语义。

#### P1：数据库运行监控

7. 增加 `db_studio_inspect_operations`

建议的 `kind`：

```text
sessions
slow-queries
table-stats
index-stats
storage
health
```

对于 Doris 可以优先实现：

- 当前连接/会话
- 查询队列
- FE/BE 健康
- 表和分区统计
- 副本状态
- Tablet/Backend 异常
- 最近查询或 profile 信息

这类能力必须通过数据库驱动的原生监控接口实现，而不是把任意监控 SQL 交给 Agent。

对 MySQL/PostgreSQL/Doris 分别声明不支持的项目，例如：

- Doris 不一定具备标准事务语义。
- 某些引擎不提供真实 index scan history。
- 某些引擎没有可用的 session cancel。
- 监控读数是瞬时快照，不是趋势。

#### P1：独立的 Plan 模式

8. 增加 `planning` 模式

规则：

- Agent 不获得 query/write/import 工具。
- 只读取有限 schema grounding。
- 输出 SQL 草稿、目标表、使用到的字段和假设。
- 用户点击后才写入编辑器。
- 不自动执行。
- 对 Doris 生成 Doris 兼容语法，而不是默认 MySQL 语法。
- 对不确定的表、字段或版本必须明确标记。

这项能力最适合用户提出：

- “帮我写一条查询”
- “根据这个表生成统计 SQL”
- “帮我重写 SQL，但不要执行”
- “把这个业务问题转换成 Doris SQL”

#### P1：数据分析和图表

9. 增加 `data-analysis` workflow

典型流程：

```text
选择数据源
→ 读取对象和字段
→ 读取必要的字段统计
→ 执行有界聚合查询
→ present_answer
→ compose_report
```

应支持：

- 分组统计
- 时间趋势
- Top N
- 同比/环比
- 漏斗
- 维度对比
- 透视表

安全约束：

- 聚合查询仍然需要只读校验。
- 默认限制返回行数。
- 不允许因为生成图表而自动去掉限制。
- 图表中的字段必须来自真实结果。
- 报告必须引用实际结果。
- 不应把“图表已生成”误报成“结论已证明”。

#### P2：可靠性和运行生命周期

10. 增加 Agent run ledger

当前 `StudioRecord` 已保存 draft、execution、plan 等记录，但还不是完整的 Agent run ledger。可以增加：

- run ID
- workflow
- mode
- objective
- tool calls
- execution IDs
- report
- answer artifact
- budget
- final verdict
- failure reason
- cancellation status

这样可以实现：

- “Run answered / Run did not answer”
- 证据引用
- 运行历史
- 失败原因
- 结果恢复
- 跨页面刷新后的状态恢复

11. 增加预算控制

可按 workflow 设定：

- 最大 tool call 数
- 最大查询数
- 最大总数据库耗时
- 单次查询超时
- 最大返回字节数
- 最大修复次数
- 最大 Agent turns

当前 `db_studio_query` 只有单次限制，还没有整个 Agent run 的总预算。

12. 增加查询修复闭环

当查询失败时：

- 保存数据库错误类型和错误摘要。
- 允许 Agent 基于错误修复一次或有限次数。
- 不重复发送完全相同的 SQL。
- 记录每次修复前后的 SQL。
- 区分数据库拒绝、策略拒绝、网络错误、超时和结果超限。
- 最终报告引用成功查询或明确报告失败原因。

13. 增加完整文件导出

当前 `db_studio_export_page` 只是分页读取。建议增加：

```text
db_studio_export_result
```

输入：

```ts
{
  executionId: string,
  format: "csv" | "json",
  scope: "current-result"
}
```

服务端：

- 重新验证 executionId 所属范围。
- 只导出已授权且仍在 TTL 内的结果。
- 通过平台文件句柄返回。
- 不返回服务器文件路径。
- 不把数据库凭据放进文件或 URL。
- 对结果行数和文件大小设置上限。

### 一个重要的独立化风险

虽然当前运行时访问已经改为 `DataSourceRuntimeCapability`，可以脱离 DataX 获取数据源，但元数据里仍有一部分 DataX 历史配置：

- [src/index.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/index.ts:20) 同时声明了 `data-xpert` 和 `xpert`。
- [src/index.ts](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/index.ts:32) 仍保留 `data-xpert` 的 `managedBy: 'data-xpert'`。
- [db-studio-assistant.yaml](/Users/xpertai05/tiwen/xpert-plugins/xpertai/apps/db-studio/src/db-studio-assistant.yaml:1) 仍有 `options.dataXpert` 配置块。

这不影响当前已经验证过的 Xpert 运行时查询路径，但如果目标是完全脱离 DataX，后续应进一步整理：

- 将 Xpert 原生 Assistant template metadata 补完整。
- 将 DataX 专属 `managedBy`、`assistantKind`、`businessDomain` 配置限制在 DataX target 下。
- 避免 Xpert 原生初始化流程读取 `options.dataXpert`。
- 分别验证 Xpert 和 DataX 两种宿主的安装、模板初始化和 View manifest。

当前最合理的演进顺序是：

```text
P0  compose_report + present_answer + workflow/tool 选择
→ P1  SQL 优化 + 数据画像 + Doris 运维读取
→ P1  Plan 模式 + 数据分析图表
→ P2  Agent run ledger + 预算 + 修复 + 完整导出
→ 最后再扩展受控写入、导入和跨引擎运维动作
```

这样可以先把当前已经具备的连接、查询、EXPLAIN、计划和结果能力组织成可验证的 Agent 工作流，再逐步增加高风险的写入和运维能力。