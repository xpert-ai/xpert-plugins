# Xpert Plugin: SAP HANA Data Source

`@xpert-ai/plugin-hana` equips the [Xpert AI](https://github.com/xpert-ai/xpert) data analysis stack with first-class SAP HANA connectivity so ChatBI agents and data modeling pipelines can query, explore, and ingest enterprise datasets without bespoke integration code.

## Key Features

- Provides a NestJS `HANAPlugin` that registers a global `hana` data-source strategy for every Xpert runtime.
- Wraps `@sap/hana-client` inside a reusable adapter that manages pooling, prepared statements, and SAP-specific JDBC metadata.
- Discovers catalogs, tables, column metadata, and comments directly from `SYS` views to bootstrap semantic models for ChatBI.
- Supports managed ingestion flows (create/drop tables, batch inserts, schema creation) to hydrate analytical sandboxes inside HANA.
- Emits JDBC URLs, lifecycle hooks, and structured logging so downstream workers and observability stacks stay aligned.

## Installation

```bash
pnpm add @xpert-ai/plugin-hana
# or
npm install @xpert-ai/plugin-hana
```

> **Note**: This package expects the host service to provide `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `chalk@4`, `lodash-es@4.17.21`, and `zod@3.25.67` as peer dependencies.

## Quick Start

1. **Register the Plugin**  
   Point the `PLUGINS` environment variable (or equivalent hook) to the package before starting Xpert:

   ```sh
   PLUGINS=@xpert-ai/plugin-hana
   ```

   During registration the plugin returns the global NestJS module `HANAPlugin`.

2. **Collect SAP HANA Credentials**  
   Gather the tenant database (a.k.a. SYSTEMDB database name), host, port (default `30015` / `443` for TLS), technical user, password, and an optional default schema.

3. **Configure within Xpert**  
   Create a data source entry in the Xpert console or via API:

   ```json
   {
     "type": "hana",
     "options": {
       "host": "hana.prod.internal",
       "port": 30015,
       "username": "CHATBI_APP",
       "password": "******",
       "database": "HXE",
       "catalog": "SALES",
       "encoding": "UTF-8"
     }
   }
   ```

   Once saved, ChatBI agents can issue SQL, build modeling snapshots, or materialize facts on SAP HANA with role-based isolation.

## Connection & Schema Options

| Field      | Type    | Description                                             | Required | Default |
| ---------- | ------- | ------------------------------------------------------- | -------- | ------- |
| `host`     | string  | SAP HANA host or load balancer.                         | Yes      | —       |
| `port`     | number  | SQL port.                                               | Yes      | —       |
| `username` | string  | Technical user used by Xpert services.                  | Yes      | —       |
| `password` | string  | Password/secret for the user (stored as a secret).      | Yes      | —       |
| `database` | string  | Tenant or database name resolved by the HANA client.    | Yes      | —       |
| `catalog`  | string  | Default schema used when none is provided at runtime.   | No       | —       |
| `encoding` | string  | Optional client encoding override.                      | No       | —       |

All fields map directly to the adapter’s configuration schema and can be templated per workspace or environment.

## Modeling & Ingestion Utilities

- `getCatalogs()` pulls live schemas from `SYS.SCHEMAS`, ensuring Xpert’s metadata service stays in sync with SAP governance.
- `getSchema(schema?, table?)` returns table-level comments, column labels, normalized data types, and nullability for modeling accelerators.
- `createCatalog()` mirrors schema provisioning flows (`CREATE SCHEMA … OWNED BY`) when self-service modeling needs a scratch space.
- `import()` builds column tables, performs batch inserts through prepared statements, and respects merge semantics (`append`, `truncate/replace`).
- `jdbcUrl()` emits SAP-compliant JDBC strings (`jdbc:sap://host:port/?databaseName=...`) so downstream schedulers or BI tools can reuse credentials securely.
- `ping()` and `runQuery()` enable health checks plus lightweight SQL execution for orchestrated ChatBI prompts.

These helpers let Xpert orchestrate data modeling jobs, semantic extractions, and conversational analytics on top of SAP HANA with minimal glue.

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-hana
npx nx test @xpert-ai/plugin-hana
```

Build artifacts are emitted to `packages/hana/dist`. Validate changes against a staging HANA instance (or SAP HANA Cloud trial) before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
