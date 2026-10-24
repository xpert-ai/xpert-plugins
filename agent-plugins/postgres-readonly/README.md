# PostgreSQL (read-only)

This package is an MCP client for a separately deployed read-only database MCP server. The first release talks only to PostgreSQL. The server is [Google MCP Toolbox for Databases](https://mcp-toolbox.dev). The transport is Streamable HTTP, and the endpoint shape is `http://host:5000/mcp`.

The package contains only `plugin.json`, `mcp.json`, a Skill, and docs. It does not contain a Toolbox binary, a database driver, an npm entry, a server module, a connection string, or an access key.

## Configuration

| Parameter | Where it lives | Notes |
| --- | --- | --- |
| MCP URL | `url` in `mcp.json` | Default `http://toolbox.internal:5000/mcp/postgres_readonly`. The spec does not expand environment variables in the URL. Before import, change it to an internal network address the Xpert host can reach. The trailing `postgres_readonly` path segment is the toolset, and it exposes only the five tools below. |
| `READONLY_POSTGRES_HOST` | Toolbox process environment or Infisical | Database host. The example default is `127.0.0.1`. |
| `READONLY_POSTGRES_PORT` | Same as above | Default `5432`. |
| `READONLY_POSTGRES_DATABASE` | Same as above | Example database name `pagila`. |
| `READONLY_POSTGRES_USER` | Same as above | Default role `xpert_readonly`. |
| `READONLY_POSTGRES_PASSWORD` | Same as above, required | Password for the read-only role. Do not put it in the plugin, a chat, or Git. |
| `statement_timeout` | Role default, set again by the connection options | `15s`, inside the 10 to 30 second range. |
| Row cap | `readonly_mcp.execute_readonly_sql` | At most 500 rows per call. |

Companion files:

- [docs/tools.yaml](docs/tools.yaml) defines only `list_schemas`, `list_tables`, `describe_table`, `execute_readonly_sql`, and `sample_rows`.
- [docs/readonly-setup.sql.txt](docs/readonly-setup.sql.txt) creates the read-only role and two guard functions. Run it once on the target database. It is not a plugin migration.

Toolbox 1.14.0's `toolbox serve` subcommand does not read `--config`. The HTTP server is started by the root command, and the listen address is pinned to the loopback interface:

```sh
export READONLY_POSTGRES_PASSWORD  # from Infisical; do not write it into shell history
toolbox --address 127.0.0.1 --port 5000 --config docs/tools.yaml
```

v1.14.0 defaults both `--allowed-hosts` and `--allowed-origins` to `*`. An internal network deployment should set them to the real host name so arbitrary origins cannot reach the server.

Database setup:

```sh
psql -d pagila -v readonly_password="$READONLY_POSTGRES_PASSWORD" -f docs/readonly-setup.sql.txt
```

The sample database can be Pagila or Chinook. The acceptance run used Pagila. Do not point this package at a production database.

## Authentication

Agent Plugin connectors in this repository are only `mcp_oauth` and `existing` (reuse a workspace connector that already exists). `mcp.json` may contain fixed `headers`, but those values are visible package data. The spec forbids credentials in headers, and the client does not expand environment variables inside header values. A fixed access key therefore cannot be stored in a header.

Toolbox's own MCP transport authentication is a JWT Bearer token (`authService` with `mcpEnabled: true`). It publishes OAuth protected-resource metadata. That is OAuth, not a static access key. This internal network read-only server does not enable that authentication, so the plugin declares no `connectors` and writes no `Authorization` header.

If a deployment must check a fixed access key, keep the key in Infisical and validate it at an internal network reverse proxy or a gateway in front of Toolbox. Do not put the key in this package. Change the connector to `mcp_oauth` only after the Toolbox endpoint actually publishes OAuth metadata. Do not place a static key in an OAuth field.

## Read-only guarantees

A prompt is not enough. The database rejects writes:

1. Role `xpert_readonly` has only `CONNECT`, schema `USAGE`, and `SELECT` on tables. It has no `INSERT`, `UPDATE`, `DELETE`, `TRUNCATE`, or `CREATE`.
2. `ALTER ROLE ... SET default_transaction_read_only = on`. The connection options add `-c default_transaction_read_only=on` again. A generic PostgreSQL source has no Cloud SQL `readOnly: true` protocol lock, so grants and the role default are the real boundary.
3. `statement_timeout` is 15 seconds. Each `execute_readonly_sql` call sets it to 15 seconds again inside the current transaction, so a pooled `SET statement_timeout = 0` cannot linger.
4. `execute_readonly_sql` runs one statement, and that statement must start with `SELECT`, `WITH`, or `EXPLAIN`. A semicolon inside the statement, and text longer than 100000 bytes, are rejected. PostgreSQL `text` itself does not accept a null byte. The result stops after row 500.
5. A write that looks like a query, such as `WITH ... DELETE`, still fails because the role has no delete privilege.
6. Toolbox `postgres-execute-sql` is not used. That tool runs arbitrary SQL as written.
7. The connection string and password stay in Infisical or the Toolbox environment. The MCP server listens only on the internal network and is not exposed to the public internet.

`sample_rows` quotes table names with `quote_ident` only, and clamps the row count from 1 to 500. It does not accept SQL text.

## Usage

After importing the plugin, select PostgreSQL (read-only) in the conversation and ask directly:

1. List the schemas that can be inspected.
2. Describe the columns, types, primary key, indexes, and comment of `public.film`.
3. How many films are in Pagila?

The agent should call `list_schemas`, `describe_table`, and `execute_readonly_sql` in that order. The film count statement is:

```sql
SELECT count(*) AS film_count FROM public.film
```

When asked for `UPDATE film SET title = 'x'` or `DROP TABLE film`, the tool rejects the statement. The reply should say the connection is read-only.

## Verification

From the `agent-plugins` directory:

```sh
corepack pnpm test
```

`corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` needs an Xpert host checkout with dependencies installed. This package has no Nest `register`. The lifecycle check packs, parses, and binds the Agent Plugin MCP server. It does not start a database.

Without an Xpert host, connect an MCP client directly to `http://127.0.0.1:5000/mcp/postgres_readonly`, list schemas, inspect a table, run one `SELECT`, and confirm that `UPDATE`, `DROP`, the timeout, and the 500-row cap all hold. That does not replace a real load inside an Xpert conversation.

Pagila `master` on 2026-10-15 uses `uuidv7()` and `transaction_timeout`, so PostgreSQL 16 cannot import it. Acceptance on that day used tag `pagila-v3.1.0`.
