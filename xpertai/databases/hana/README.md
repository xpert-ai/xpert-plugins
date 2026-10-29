# Xpert Plugin: SAP HANA Data Source

`@xpert-ai/plugin-hana` equips the [Xpert AI](https://github.com/xpert-ai/xpert) data analysis stack with first-class SAP HANA connectivity so ChatBI agents and data modeling pipelines can query, explore, and ingest enterprise datasets without bespoke integration code.

## Key Features

- Provides a NestJS `HANAPlugin` that registers a global `hana` data-source strategy for every Xpert runtime.
- Wraps `@sap/hana-client` inside a reusable adapter that manages connections, prepared statements, and SAP-specific JDBC metadata.
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
   Gather the application tenant database name (distinct from SYSTEMDB), its SQL host and port, technical user, password, and an optional default schema.

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

## Dashboard Analytics (`hana.sql`)

This plugin also registers `hana.sql` for saved `hana` data sources. It consumes the
host's `platform.datasource.workbench` capability with the invoking actor and
resolved source ID. Credentials stay in the host; query payloads cannot choose
credentials or switch the saved HANA tenant database. `location.schema` selects a
schema, while `options.database` remains the configured tenant.

**Release dependency:** this adapter requires the companion platform change to
plugin-registered workbench support and `getWorkbenchAdapter(location)`. The host
no longer owns an engine allowlist or HANA-specific schema/tenant mapping.
The strategy declares `workbench.engine: 'hana'`; this plugin validates the requested
location and creates its dedicated adapter.

SDK 3.29.0 removes the old SQL implementation exports. The plugin dependencies
and frozen lockfile now use that published release, without local SDK overrides.
MySQL/Doris, PostgreSQL and DB Studio must migrate together with that host upgrade.

After both releases are installed and active:

1. Use the existing HANA source (for example ECP); no duplicate source is needed.
   Its database user needs SELECT access to the intended tables/views and visibility
   into their `SYS` metadata.
2. Allow `hana.sql` in the Assistant's Live Dashboard `allowedFinalProviders`.
3. Run `dashboard_list_sources`, select the returned source ID, and discover `{}`
   to list schemas. Follow the returned `inspectRequest` for catalog and column
   inspection. Every step returns the HANA query contract.
4. Preview a read query, then create the Dashboard with that binding. Change a
   filter and refresh to run the query again. Use the current run's preview receipt.

Example query payload (replace identifiers using actual discovery):

```json
{
  "location": { "schema": "SALES" },
  "sql": "SELECT SUM(\"NET_SALES\") AS \"net_sales\" FROM \"ORDERS\" WHERE (CAST(? AS NVARCHAR(100)) IS NULL OR \"REGION\" = ?)",
  "parameterOrder": ["region", "region"]
}
```

Supply `region: null` for all regions or the actual region string. Parameters go
through HANA prepared statements; values are never interpolated into SQL. HANA
identifiers use double quotes, not MySQL backticks. Explicitly cast nullable
parameters when HANA cannot infer their type.

The adapter opens a dedicated connection, sets autocommit off and executes
`SET TRANSACTION READ ONLY` before queries. It rejects unsupported statements,
procedures, table functions, sequences and unapproved functions before execution.
It does not add writes, imports or transaction controls to Dashboard Analytics;
the existing ingestion interface is separate and unchanged.

Discovery covers schemas, tables/views and column types/comments. Keys and DDL are
not inspected, so joins must be validated independently. Queries have a maximum
of 10,000 returned rows, 30 seconds, 1 MiB per cell and 8 MiB per result. An extra
row detects truncation, which is reported as a partial result, never an exact
full-result total. Cancellation aborts and disconnects the dedicated session;
cleanup callbacks are bounded. Binary/LOB/spatial/array results require explicit
bounded scalar conversion. Query failure messages do not expose driver SQL or
connection details.

Native statement timeouts are used when supported. If the native client reports
the specific `HY000` / `-1` error `Query timeout is not supported by the HANA server.`,
the transport resets that statement's timeout to its default (`0`) and retries once
on the same read-only connection. Later statements on that connection skip native
statement timeouts. The original client deadline, communication timeouts and
abort/disconnect behavior still apply; the retry never gets a new time budget.
Other query errors and actual timeouts do not trigger this compatibility retry.

`DECIMAL`/`SMALLDECIMAL` and `BIGINT` retain exact string values; lossy numeric
values are rejected. Bind them to `decimal`/`int64` fields. HANA timestamp values
have no time zone and remain strings unless the query explicitly establishes an
offset. Do not silently convert them to UTC.

### Focused verification

From `xpertai`, using the published SDK pinned in the lockfile:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm run verify:database-workbench
```

Run the dist-first lifecycle harness separately after building it:

```sh
# In the plugin repository root, with plugin-dev-harness built:
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-hana
```

Use a supported recent Node version (lifecycle verified with Node 24). The check
builds and type-checks against the published SDK, with no declaration overrides.
The default tests use fake native-driver I/O and do not contact a
HANA server. The lifecycle harness verifies module registration and startup/shutdown,
not a live database query or Dashboard UI.

A separate, read-only integration test is opt-in. Set `HANA_ANALYTICS_INTEGRATION=1`
and `HANA_HOST`, `HANA_PORT`, `HANA_USERNAME`, `HANA_PASSWORD`, `HANA_DATABASE`,
`HANA_SCHEMA` in your private test environment, then run:

```sh
node --test tests/hana.integration.test.mjs
```

It discovers authorized metadata, queries DUMMY with positional parameters and
checks exact decimal/BIGINT and empty-result metadata. It creates no tables or
records. A live HANA instance and Dashboard filter/refresh/save/reopen acceptance
are still required before calling the customer environment verified.
