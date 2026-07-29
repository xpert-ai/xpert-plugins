# Xpert Plugin: PostgreSQL Data Source

`@xpert-ai/plugin-postgres` migrates the legacy PostgreSQL adapter into an
independently installable database plugin. It registers the legacy `pg`
data-source type and preserves query execution, schema discovery, table
management, row imports, and streaming CSV imports.

## Installation

```bash
pnpm add @xpert-ai/plugin-postgres
```

Register the package through the Xpert plugin manager, then create a data source
with type `pg`.

## Connection options

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `host` | string | No | `127.0.0.1` | PostgreSQL server |
| `port` | number | No | `5432` | PostgreSQL port |
| `username` | string | No | - | Login role |
| `password` | string | No | - | Secret password |
| `database` | string | Yes | `postgres` | Database name |
| `sslmode` | string | No | `prefer` | `disable`, `allow`, `prefer`, `require`, `verify-ca`, or `verify-full` |
| `sslrootcertFile` | textarea | No | - | CA certificate |
| `sslcertFile` | textarea | No | - | Client certificate |
| `sslkeyFile` | textarea | No | - | Client private key |

Example:

```json
{
  "host": "postgres.internal",
  "port": 5432,
  "username": "analytics",
  "password": "******",
  "database": "warehouse",
  "sslmode": "require"
}
```

## Capabilities

- Execute parameterized PostgreSQL queries with an optional schema search path.
- Discover non-system schemas, tables, columns, comments, and native data types.
- Create, rename, inspect, upgrade, and drop tables.
- Import rows in parameterized batches.
- Stream CSV files with `COPY FROM STDIN` without loading the complete file into
  memory.
- Create `uuid-ossp` when a managed UUID default requires it.
- Generate PostgreSQL JDBC URLs.

The plugin registers no TypeORM entities, controllers, routes, queues, or
persisted global artifacts. Its `pg` strategy key is the stable legacy
data-source protocol identifier, so a system artifact namespace is not needed.

## Development

From `xpert-plugins/xpertai`:

```bash
corepack pnpm exec nx run @xpert-ai/plugin-postgres:build
corepack pnpm exec nx run @xpert-ai/plugin-postgres:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-postgres:lint
corepack pnpm exec nx run @xpert-ai/plugin-postgres:test
```

Unit tests use a typed PostgreSQL client boundary. Live verification requires a
reachable PostgreSQL instance and credentials.

## License

AGPL-3.0
