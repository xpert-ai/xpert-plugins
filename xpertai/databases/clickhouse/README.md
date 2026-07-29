# Xpert Plugin: ClickHouse Data Source

`@xpert-ai/plugin-clickhouse` migrates the legacy Xpert ClickHouse adapter into
an independently installable database plugin. It registers the `clickhouse`
data-source strategy and preserves query execution, catalog discovery, schema
introspection, JDBC URL generation, and managed table imports.

## Installation

```bash
pnpm add @xpert-ai/plugin-clickhouse
```

Register the package through the Xpert plugin manager, then create a data source
with type `clickhouse`.

## Connection options

| Field | Type | Required | Default | Description |
| --- | --- | --- | --- | --- |
| `url` | string | No | `http://127.0.0.1:8123` | ClickHouse HTTP endpoint |
| `host` | string | No | `localhost` | Host used by the JDBC URL |
| `port` | number | No | `8123` | HTTP/JDBC port |
| `username` | string | No | `default` | ClickHouse user |
| `password` | string | No | - | Secret password |
| `dbname` | string | Yes | - | Default database |
| `timeout` | number | No | `30` | Request timeout retained for compatibility |
| `verify` | boolean | No | `true` | TLS verification preference retained for compatibility |

Example data-source options:

```json
{
  "url": "http://clickhouse.internal:8123",
  "host": "clickhouse.internal",
  "port": 8123,
  "username": "analytics",
  "password": "******",
  "dbname": "warehouse"
}
```

## Capabilities

- Execute ClickHouse SQL over the HTTP protocol.
- List non-system databases.
- Group `system.columns` metadata into Xpert schemas, tables, and columns.
- Infer query result columns for downstream modeling.
- Create databases and import data into `MergeTree` tables in batches.
- Generate ClickHouse JDBC URLs for compatible downstream runtimes.

The plugin registers no TypeORM entities, controllers, routes, queues, or
persisted global artifacts. Its stable `clickhouse` strategy key is the legacy
data-source protocol identifier, so no system artifact namespace is required.

## Development

From `xpert-plugins/xpertai`:

```bash
corepack pnpm exec nx run @xpert-ai/plugin-clickhouse:build
corepack pnpm exec nx run @xpert-ai/plugin-clickhouse:typecheck
corepack pnpm exec nx run @xpert-ai/plugin-clickhouse:lint
corepack pnpm exec nx run @xpert-ai/plugin-clickhouse:test
```

Live database verification requires a reachable ClickHouse instance. The unit
suite uses a typed client boundary and does not require external credentials.

## License

AGPL-3.0
