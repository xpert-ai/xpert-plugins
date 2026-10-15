---
name: postgres-readonly
description: 通过内网只读 PostgreSQL MCP 查看 schema、表结构，并执行单条 SELECT、WITH 或 EXPLAIN。
---

# PostgreSQL（只读）

只使用当前 MCP 服务列出的工具。不要请求连接串、密码、访问密钥，也不要建议把凭据写进对话或文件。

先调用 `list_schemas`，再对用户点名的 schema 调用 `list_tables`。看某一张表时调用 `describe_table`，需要几行样例时调用 `sample_rows`。回答数量、筛选或聚合问题时，调用一次 `execute_readonly_sql`。

`execute_readonly_sql` 只接受一条语句，并且只能是 `SELECT`、`WITH` 或 `EXPLAIN`。不要发送 `INSERT`、`UPDATE`、`DELETE`、`DROP`、`ALTER`、`TRUNCATE`、`COPY`、`CALL` 或多条语句。返回行数上限是 500；`truncated` 为 true 时说明结果被截断，不要声称已经看到全部行。语句超过约 15 秒会超时，把超时如实告诉用户。

用户要求写入或改表结构时，说明这个连接是只读的，不要改写语句去绕过限制，也不要声称写入已经成功。工具报错时转述错误，不要编造行数或表结构。
