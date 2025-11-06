# Xpert Plugin: MySQL Data Source

`@xpert-ai/plugin-mysql` brings MySQL-compatible database connectivity to the [Xpert AI](https://github.com/xpert-ai/xpert) data analysis stack. The plugin registers a global NestJS module that exposes actionable strategies for native MySQL, Amazon RDS, Apache Doris, and StarRocks engines, enabling Xpert workflows to run SQL queries, explore schemas, and ingest datasets without custom glue code.

## Key Features

- Ships four data-source strategies (`mysql`, `rds_mysql`, `doris`, `starrocks`) that plug directly into the Xpert data analysis runtime.
- Wraps `mysql2`/`mysql` drivers with a shared query runner that handles catalog discovery, table introspection, `DESCRIBE` previews, and JDBC metadata.
- Provides managed ingestion helpers that create tables, load batches, or execute stream-load pipelines for OLAP engines.
- Supports SSL credentials, timezone overrides, and query timeouts to match enterprise deployments.
- Exposes lifecycle hooks (`register`, `onStart`, `onStop`) and structured logging for observability.

## Installation

```bash
pnpm add @xpert-ai/plugin-mysql
# or
npm install @xpert-ai/plugin-mysql
```

> **Note**: This plugin lists `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `axios@1`, `chalk@4`, `lodash-es@4`, and `zod@3.25.67` as peer dependencies. Ensure they are already available in your host service.

## Quick Start

1. **Register the Plugin**  
   Include the package in the `PLUGINS` environment variable (or equivalent registration hook) when starting Xpert:

   ```sh
   PLUGINS=@xpert-ai/plugin-mysql
   ```

   The plugin returns the `MySQLPlugin` NestJS module during registration.
2. **Collect Credentials**  
   Prepare the connection details for the target engine (host, port, username, password, optional SSL bundle, and default database/catalog).

3. **Configure in Xpert**  
   Define a data source integration via the Xpert AI platform. Example JSON payload:

   ```json
   {
     "type": "mysql",
     "options": {
       "host": "db.internal",
       "port": 3306,
       "username": "analytics",
       "password": "******",
       "catalog": "sales",
       "use_ssl": false
     }
   }
   ```

   Swap `"type"` for `rds_mysql`, `doris`, or `starrocks` to target other engines.

## Data Source Types

| Type        | Strategy Class                 | Description                               |
| ----------- | ------------------------------ | ----------------------------------------- |
| `mysql`     | `MySQLDataSourceStrategy`      | Standard MySQL and compatible community builds. |
| `rds_mysql` | `RDSMySQLDataSourceStrategy`   | Amazon RDS for MySQL with tailored naming. |
| `doris`     | `DorisDataSourceStrategy`      | Apache Doris (via MySQL protocol and HTTP stream load). |
| `starrocks` | `StarRocksDataSourceStrategy`  | StarRocks OLAP engine with Doris-derived runner. |

## Configuration

### Shared Connection Options

| Field            | Type      | Description                                                  | Required | Default          |
| ---------------- | --------- | ------------------------------------------------------------ | -------- | ---------------- |
| `host`           | string    | Database endpoint hostname or IP.                            | Yes      | —                |
| `port`           | number    | TCP port for the MySQL-compatible service.                   | No       | `3306` (MySQL)   |
| `username`       | string    | Login username.                                              | Yes      | —                |
| `password`       | string    | Login password (handled as a secret value).                  | Yes      | —                |
| `catalog`        | string    | Default database/catalog name used when none is provided.    | No       | —                |
| `timezone`       | string    | Client session timezone sent to the driver.                  | No       | `+08:00`         |
| `serverTimezone` | string    | Server timezone used to build JDBC URLs.                     | No       | `Asia/Shanghai`  |
| `queryTimeout`   | number    | Per-query timeout in milliseconds.                           | No       | `3600000` (1h)   |
| `use_ssl`        | boolean   | Enables SSL/TLS connections.                                 | No       | `false`          |
| `ssl_cacert`     | textarea  | Certificate authority bundle (required when `use_ssl` is on).| Cond.    | —                |
| `ssl_cert`       | textarea  | Client certificate (if mutual TLS is needed).                | No       | —                |
| `ssl_key`        | textarea  | Client private key.                                          | No       | —                |

### Doris & StarRocks Options

| Field      | Type   | Description                                               | Default |
| ---------- | ------ | --------------------------------------------------------- | ------- |
| `apiHost`  | string | REST API endpoint for stream-load operations.             | `host`  |
| `apiPort`  | number | HTTP port for stream-load requests.                       | `8030`  |
| `version`  | number | StarRocks version hint (affects CSV header handling).     | `0`     |

`DorisDataSourceStrategy` and `StarRocksDataSourceStrategy` extend the base runner with HTTP stream-load support so large CSV/JSON files can be imported efficiently.

## Schema & Import Utilities

- `getCatalogs()` lists user databases while filtering system schemas.
- `getSchema(catalog, table)` returns table metadata with column types normalized for Xpert.
- `describe(catalog, statement)` executes a guarded preview (`LIMIT 1`) to infer result columns.
- `import()` can recreate tables, batch insert data, or trigger stream-load pipelines depending on engine capabilities.
- `jdbcUrl()` exposes prebuilt JDBC connection strings when downstream integrations require them.

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-mysql
npx nx test @xpert-ai/plugin-mysql
```

TypeScript build artifacts are emitted to `packages/mysql/dist`. Run tests against a staging database before publishing new versions.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
