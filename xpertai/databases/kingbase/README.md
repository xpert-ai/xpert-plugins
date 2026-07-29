# Xpert Plugin: KingbaseES Data Source

`@xpert-ai/plugin-kingbase` migrates the legacy `kingbase` adapter into an
independent database plugin. It reuses the public PostgreSQL runner contract
while preserving the KingbaseES type, default `kingbase` database, JDBC URL,
and `com.kingbase8.Driver`.

## Installation

```bash
pnpm add @xpert-ai/plugin-kingbase
```

Register the package through the Xpert plugin manager and create a data source
with type `kingbase`. Connection fields and table/query capabilities match
`@xpert-ai/plugin-postgres`.

```json
{
  "host": "kingbase.internal",
  "port": 54321,
  "username": "analytics",
  "password": "******",
  "database": "kingbase"
}
```

The plugin has no entities, controllers, routes, queues, or persisted global
artifacts, so no system artifact namespace is required.

## Development

From `xpert-plugins/xpertai`:

```bash
corepack pnpm exec nx run-many -t build typecheck lint test --projects=@xpert-ai/plugin-kingbase
```

Live verification requires a reachable KingbaseES instance and credentials.

## License

AGPL-3.0
