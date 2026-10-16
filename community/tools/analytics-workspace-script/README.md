# Workspace script analytics

让 Agent 在已授权的 Assistant file workspace 中编写 Python 或 JavaScript，并通过统一 `AnalyticsBinding → AnalyticalDataset` 接入 Live Dashboard。每次打开、筛选、刷新都会执行脚本并读取当前输入；保存和刷新复用 Artifacts、Analytics Runtime 和 Data Analytics 渲染器。

## 安装与启用

需要包含 Analytics Runtime、Sandbox Job invocation、`compute/node-python/v1` 的平台版本，以及满足 `readOnlyWorkspace` 等隔离要求的 Runtime Provider。SDK 新接口已在本地源码验证，尚不代表相同接口已发布到 npm。

```sh
corepack pnpm --filter @xpert-ai/plugin-analytics-workspace-script test
node scripts/build-action.mjs --verify # 在本插件目录执行
```

使用平台 `plugin:deploy:local` 安装，scope 为 tenant，插件 level 为 system。重启要求以部署回执为准。同步数据源类型后新建 `workspace-script` 数据源。在发布的 Assistant 中同时启用 `WorkspaceScriptDataset` 和 `LiveDashboard` middleware，并给当前用户配置真实来源及 file workspace 权限。

本地 Pro 使用 `xpert-sandbox-compute:local`。生产需要按 Sandbox Runtime Suite 的发布流程构建、发布 compute 镜像并添加不可变 digest Binding；本次没有发布生产镜像。

## Agent 工作流

1. 发现真实数据源，或读取用户指定的 Workspace 文件及业务口径。
2. `workspace_dataset_write_file` 写入 `async query(ctx)` 脚本。
3. `workspace_dataset_register` 先用默认参数预检每个来源 Binding，再注册脚本、别名、参数和输出字段，返回版本化定义与完整 `bindingJson`。
4. `dashboard_discover` 检查返回的定义版本，`dashboard_preview_binding` 原样接受 `bindingJson` 并验证实际结果。
5. `dashboard_create` 使用本轮 preview receipt 保存看板。图表只引用 Dataset 字段 ID。

注册工具直接接收结构化 `title/path/language/mode/files/parameters/output`。可选 `sources` 为 `{alias, bindingJson}` 数组，内含来源插件的完整、版本化 Binding。原生 SQL 或本体 Action 参数仅存在于该 Binding，脚本不接触连接凭据。

对于专门负责脚本处理的 Assistant，可将 LiveDashboard middleware 的 `allowedFinalProviders` 配置为 `["workspace_script.query"]`。来源预览仍可使用原生 Provider，最终保存会拒绝绕过脚本的替代方案。此配置是看板插件的通用 Provider 策略；普通 Assistant 不配置时保持原有行为。

## 脚本协议

```python
from decimal import Decimal

async def query(ctx):
    file = await ctx.files.read("orders")
    rows = ctx.csv.parse(file["text"])
    region = ctx.parameters.get("region")
    total = sum((Decimal(row["amount"]) for row in rows
                 if region is None or row["region"] == region), Decimal("0"))
    return ctx.dataset([{"amount": str(total)}])
```

```javascript
export async function query(ctx) {
  const source = await ctx.sources.query('sales', { region: ctx.parameters.region })
  // 来源 Dataset 行使用 field.id；返回行使用当前定义的 output.fields[].sourceField。
  return ctx.dataset(source.rows.map(row => ({ region: row.region, amount: row.amount })))
}
```

| API | 约定 |
| --- | --- |
| `ctx.parameters` | 平台校验后的当前筛选参数；空值语义由业务脚本决定 |
| `ctx.files.read(alias)` | 返回 UTF-8 `text`、SHA 和读取时间；一次执行内同一别名保持一致 |
| `ctx.sources.query(alias, controls)` | 实时查询已声明 Binding，按其 `controlId` 传入筛选；返回标准 Dataset |
| `ctx.csv.parse(text)` | Python/JavaScript 共用语义，支持引号、换行、转义和 BOM |
| `ctx.dataset(rows)` | 从定义输出字段生成 columns，返回候选结果；完整性、来源和时间由服务端签发 |

`pinned` 默认固定代码快照，输入仍然实时读取。`current` 每次读取当前代码并创建本次执行快照。两种模式都重新授权原始 Assistant 文件，私有快照不会绕过权限撤销。

Python 使用标准库，精确金额建议 `Decimal` 后输出字符串。JavaScript 使用标准库，金额可采用整数最小单位/BigInt，输出 decimal/int64 时保留字符串。当前执行单文件脚本，不打包 Workspace 内的相对导入模块，也不提供 pandas、npm 包安装或外部网络。`node:csv` 并不存在，使用 `ctx.csv.parse`。

## 平台与插件边界

平台提供通用 Dataset/Binding、来源授权、文件 ACL、Artifacts、期限/取消/执行 ID、Sandbox Jobs 和具名调用通道。插件拥有脚本定义、两个语言入口、CSV 辅助函数、source/file 别名、输出和 lineage 策略。PostgreSQL 与 data-xpert 继续通过各自来源插件处理原生协议及授权。

隔离容器通过标准输出发送具名 invocation，平台通过只读任务目录返回结果；没有回调 HTTP 服务、脚本持有的 token 或直连数据库。通道执行时保留调用者上下文，受当前 Job 的取消、次数与字节限额约束。可替换 Runtime Provider 必须支持实时输出和任务文件上传，并实际满足声明的隔离能力。

## 限额与持久化

- 脚本 64 KB；最多 8 个 UTF-8 文件别名，每个 1 MB；4 个来源别名，禁止递归脚本来源。
- 每次执行最多 16 次调用、8 MB 调用数据、4,000 行累计来源输入；结果最多 1,000 行、2 MB。
- 总查询期限 30 秒；子查询共享剩余期限。Compute 为 1 CPU、256 MB 内存、64 MB 临时空间，无网络、非 root、根目录及输入只读。
- 定义与执行证据使用现有 Artifact/ArtifactVersion，无新增业务表。定义保存代码 SHA、运行 Action 版本、portable file refs、来源 Binding 和输出契约；执行证据保存 Job、参数摘要、输入 SHA/子查询 ID、输出 SHA。
- 上游分页/截断会传递到最终 Dataset，脚本不能自行声称全量结果。跨来源读取不构成事务快照。
- 当前定义归创建用户所有；共享 Dashboard 不自动共享脚本或输入权限。执行输出在校验后删除，审计 Artifact 保留；自动归档/TTL 暂未实现。
- “实时刷新”指点击刷新或筛选后重新读取来源，不包含自动轮询、推送订阅或调度器。

详见 [架构与协议](docs/index.mdx)、[构建验证](docs/verification.mdx) 和 [历史验收记录](docs/acceptance.md)。
