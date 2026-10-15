# PostgreSQL（只读）

这个包是 MCP 客户端，连接一台单独部署的只读数据库 MCP 服务。第一版只对接 PostgreSQL。服务端使用 [Google MCP Toolbox for Databases](https://mcp-toolbox.dev)，传输是 Streamable HTTP，端点形状是 `http://host:5000/mcp`。

包内只有 `plugin.json`、`mcp.json`、Skill 和文档。没有 Toolbox 二进制、没有数据库驱动、没有 npm 入口、没有服务端模块，也没有连接串或访问密钥。

## 配置参数

| 参数 | 放在哪里 | 说明 |
| --- | --- | --- |
| MCP 地址 | `mcp.json` 的 `url` | 默认 `http://toolbox.internal:5000/mcp/postgres_readonly`。规范不允许在 URL 里做环境变量替换，导入前改成 Xpert 主机能访问的内网地址。路径末尾的 `postgres_readonly` 是工具集，只暴露下面五个工具。 |
| `READONLY_POSTGRES_HOST` | Toolbox 进程环境或 Infisical | 数据库主机。示例默认 `127.0.0.1`。 |
| `READONLY_POSTGRES_PORT` | 同上 | 默认 `5432`。 |
| `READONLY_POSTGRES_DATABASE` | 同上 | 示例库名 `pagila`。 |
| `READONLY_POSTGRES_USER` | 同上 | 默认角色 `xpert_readonly`。 |
| `READONLY_POSTGRES_PASSWORD` | 同上，必填 | 只读角色密码。不要写进插件、对话或 Git。 |
| `statement_timeout` | 角色默认值，并由连接参数再次设置 | `15s`，位于 10 到 30 秒之间。 |
| 行数上限 | `readonly_mcp.execute_readonly_sql` | 单次最多 500 行。 |

配套文件：

- [docs/tools.yaml](docs/tools.yaml)：只定义 `list_schemas`、`list_tables`、`describe_table`、`execute_readonly_sql`、`sample_rows`。
- [docs/readonly-setup.sql.txt](docs/readonly-setup.sql.txt)：创建只读角色和两个守卫函数。在目标库执行一次，不是插件迁移。

Toolbox 1.14.0 的 `toolbox serve` 子命令不读取 `--config`。HTTP 服务由根命令启动，并把监听地址固定在回环接口：

```sh
export READONLY_POSTGRES_PASSWORD  # 来自 Infisical，不写进 shell 历史文件
toolbox --address 127.0.0.1 --port 5000 --config docs/tools.yaml
```

v1.14.0 默认 `--allowed-hosts` 和 `--allowed-origins` 都是 `*`。内网部署应改成实际主机名，避免任意来源访问。

数据库准备：

```sh
psql -d pagila -v readonly_password="$READONLY_POSTGRES_PASSWORD" -f docs/readonly-setup.sql.txt
```

示例库可以用 Pagila 或 Chinook。验收记录使用 Pagila。不要把这个包指向生产库。

## 认证

本仓库的 Agent Plugin 连接器只有两种：`mcp_oauth`，以及 `existing`（复用已经存在的工作区连接器）。`mcp.json` 可以写固定 `headers`，但那些值是包内可见数据。规范明确禁止把凭据放进 header，客户端也不会展开 header 里的环境变量。因此不能用 header 保存固定访问密钥。

Toolbox 自己的 MCP 传输认证是 JWT Bearer（`authService` 且 `mcpEnabled: true`），会发布 OAuth protected-resource 元数据。那是 OAuth，不是静态访问密钥。当前这个内网只读服务不启用该认证，所以插件不声明 `connectors`，也不写 `Authorization`。

如果部署必须校验固定访问密钥，把密钥放在 Infisical，并由内网反向代理或 Toolbox 前面的网关校验。不要把密钥写进本包。等到 Toolbox 端点真的发布 OAuth 元数据后，再把连接器改成 `mcp_oauth`。不要把静态密钥塞进 OAuth 字段。

## 只读保障

只靠提示词不够。写入会被数据库拒绝：

1. 角色 `xpert_readonly` 只有 `CONNECT`、schema `USAGE` 和表的 `SELECT`。没有 `INSERT`、`UPDATE`、`DELETE`、`TRUNCATE` 和 `CREATE`。
2. `ALTER ROLE ... SET default_transaction_read_only = on`。连接参数再次加上 `-c default_transaction_read_only=on`。普通 PostgreSQL 源没有 Cloud SQL 那种 `readOnly: true` 协议锁，所以权限和角色默认值是实际边界。
3. `statement_timeout` 为 15 秒。每次 `execute_readonly_sql` 还会在当前事务内重新设为 15 秒，避免连接池里残留 `SET statement_timeout = 0`。
4. `execute_readonly_sql` 只执行一条语句，并且必须以 `SELECT`、`WITH` 或 `EXPLAIN` 开头。语句中的分号和超过 100000 字节的文本会被拒绝。PostgreSQL 的 `text` 本身不接受空字节。返回在第 500 行后停止。
5. `WITH ... DELETE` 这种看起来像查询的写入仍然会因为没有删除权限而失败。
6. 不使用 Toolbox 的 `postgres-execute-sql`。那个工具会原样执行任意 SQL。
7. 连接串和密码留在 Infisical 或 Toolbox 环境中。MCP 服务只监听内网，不暴露到公网。

`sample_rows` 只用 `quote_ident` 引用表名，并把行数钳制在 1 到 500。它不接受 SQL 文本。

## 使用示例

导入插件后，在对话里选中 PostgreSQL（只读），直接提问：

1. 列出可以查看的 schema。
2. 说明 `public.film` 的列、类型、主键、索引和注释。
3. Pagila 里有多少部影片？

智能体应依次调用 `list_schemas`、`describe_table` 和 `execute_readonly_sql`。影片数量的语句是：

```sql
SELECT count(*) AS film_count FROM public.film
```

要求 `UPDATE film SET title = 'x'` 或 `DROP TABLE film` 时，工具会拒绝，回答应说明连接是只读的。

## 验证

在 `agent-plugins` 目录：

```sh
corepack pnpm test
```

`corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` 需要已安装依赖的 Xpert 主机检出。本包没有 Nest `register`，生命周期检查走 Agent Plugin 的打包、解析和 MCP 绑定，不启动数据库。

没有 Xpert 主机时，用 MCP 客户端直接连接 `http://127.0.0.1:5000/mcp/postgres_readonly`，完成列表、表结构和一条 `SELECT`，并确认 `UPDATE`、`DROP`、超时和 500 行上限。这不能代替 Xpert 对话里的真实加载。

2026-10-15 的 Pagila `master` 使用 `uuidv7()` 和 `transaction_timeout`，PostgreSQL 16 无法导入。同一天的验收使用 tag `pagila-v3.1.0`。
