# Xpert Plugin: OpenGauss Data Source

`@xpert-ai/plugin-opengauss` migrates the legacy `opengauss` adapter into an
independent database plugin. It reuses the public PostgreSQL runner contract
while preserving the OpenGauss type, default `gaussdb` database, JDBC URL, and
JDBC driver.

## Installation

```bash
pnpm add @xpert-ai/plugin-opengauss
```

Register the package through the Xpert plugin manager and create a data source
with type `opengauss`.

The connection fields and query/table capabilities match
`@xpert-ai/plugin-postgres`. When `database` is omitted, the runner uses
`gaussdb`.

```json
{
  "host": "opengauss.internal",
  "port": 5432,
  "username": "analytics",
  "password": "******",
  "database": "gaussdb"
}
```

The plugin has no entities, controllers, routes, queues, or persisted global
artifacts, so no system artifact namespace is required.

## Development

From `xpert-plugins/xpertai`:

```bash
corepack pnpm exec nx run-many -t build typecheck lint test --projects=@xpert-ai/plugin-opengauss
```

Live query verification requires a reachable OpenGauss instance and credentials.

## License

AGPL-3.0
