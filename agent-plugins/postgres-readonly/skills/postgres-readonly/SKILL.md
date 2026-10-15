---
name: postgres-readonly
description: Inspect schemas and table structure, and run a single SELECT, WITH, or EXPLAIN, through an internal network read-only PostgreSQL MCP server.
---

# PostgreSQL (read-only)

Use only the tools listed by the current MCP server. Do not ask for a connection string, password, or access key, and do not suggest writing credentials into the chat or a file.

Call `list_schemas` first, then `list_tables` for the schema the user named. Call `describe_table` to inspect one table, and `sample_rows` when a few example rows are needed. For a count, filter, or aggregate, call `execute_readonly_sql` once.

`execute_readonly_sql` accepts one statement, and that statement can only be `SELECT`, `WITH`, or `EXPLAIN`. Do not send `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `COPY`, `CALL`, or more than one statement. The returned row cap is 500. When `truncated` is true, the result was cut off; do not claim that every row was seen. A statement that runs longer than about 15 seconds times out. Tell the user about that timeout as reported.

When the user asks for a write or a schema change, say this connection is read-only. Do not rewrite the statement to get around the limit, and do not claim the write succeeded. When a tool returns an error, repeat that error. Do not invent row counts or table structure.
