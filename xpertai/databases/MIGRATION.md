# Legacy Database Adapter Migration

This checklist tracks the migration of runnable database adapters from
`xpert/legacies/adapter/src/adapters` into database plugins in this directory.

## Scope

An adapter is in scope when its runner is exported by the legacy adapter package
or registered through the legacy `register()` function. Files that contain only
fixtures or fully commented-out implementations are not runnable adapters.

- `mock.ts` is test fixture data and is out of scope.
- `dameng/index.ts` is fully commented out and is not exported, so there is no
  runnable Dameng adapter to preserve.
- `sap-hana.ts` is fully commented out. The maintained HANA implementation is
  already available in `@xpert-ai/plugin-hana`.

## Inventory

| Legacy type | Legacy source | Target plugin | Status | Notes |
| --- | --- | --- | --- | --- |
| `mysql` | `mysql/mysql.ts` | `@xpert-ai/plugin-mysql` | Migrated | Existing plugin |
| `rds_mysql` | `mysql/mysql.ts` | `@xpert-ai/plugin-mysql` | Migrated | Existing plugin strategy |
| `doris` | `mysql/doris.ts` | `@xpert-ai/plugin-mysql` | Migrated | Existing plugin strategy |
| `starrocks` | `mysql/doris.ts` | `@xpert-ai/plugin-mysql` | Migrated | Existing plugin strategy |
| `hana` | `sap-hana.ts` | `@xpert-ai/plugin-hana` | Migrated | Maintained replacement for commented legacy code |
| `clickhouse` | `clickhouse/clickhouse.ts` | `@xpert-ai/plugin-clickhouse` | Migrated | Independent plugin; validation recorded below |
| `mariadb` | `mariadb/index.ts` | `@xpert-ai/plugin-mariadb` | Migrated | Independent plugin using the public MySQL runner contract |
| `pg` | `postgres/postgres.ts` | `@xpert-ai/plugin-postgres` | Migrated | Independent plugin and reusable base for derived adapters |
| `opengauss` | `open-gauss/index.ts` | `@xpert-ai/plugin-opengauss` | Migrated | Independent plugin using the public PostgreSQL runner contract |
| `kingbase` | `kingbase/index.ts` | `@xpert-ai/plugin-kingbase` | Migrated | Independent plugin using the public PostgreSQL runner contract |
| `presto` | `presto.ts` | `@xpert-ai/plugin-presto` | Migrated | Independent plugin and reusable base for Trino |
| `trino` | `trino.ts` | `@xpert-ai/plugin-trino` | Migrated | Independent plugin using the public Presto runner contract |
| `xmla` | `xmla.ts` | `@xpert-ai/plugin-xmla` | Migrated | Independent plugin and reusable base for SAP BW |
| `sapbw` | `sap-bw.ts` | `@xpert-ai/plugin-sap-bw` | Migrated | Independent plugin using the public XMLA runner contract |
| `hive` | `hive.ts` | `@xpert-ai/plugin-hive` | Migrated | Independent plugin with typed Hive runtime boundary |
| `mssql` | `mssql/mssql.ts` | `@xpert-ai/plugin-mssql` | Migrated | Independent plugin with scoped connection pool |
| `redshift` | `redshift/index.ts` | `@xpert-ai/plugin-redshift` | Migrated | Independent plugin with typed Data API boundary |

## Required completion evidence

Every target plugin must have:

- package metadata and runtime metadata with matching name and version;
- a default `XpertPlugin` export in `src/index.ts`;
- a registered `DataSourceStrategy` for the legacy type;
- the legacy configuration schema and query-runner behavior;
- typed unit tests for metadata, strategy registration, configuration, a happy
  path, and an error path;
- successful Nx build, typecheck, lint, and test targets;
- a successful plugin lifecycle test through `plugin-dev-harness`;
- local load/runtime verification when the required database and credentials are
  available, or an explicit record that external runtime verification remains.

Database plugins in this migration register strategies but do not register
TypeORM entities, controllers, routes, or persisted process-global artifacts.
They therefore do not require a system-level artifact namespace. This must be
re-evaluated if any plugin later adds those capabilities.

## Migration order

Migrate independent runners first, then base runners before derived runners:

1. ClickHouse
2. PostgreSQL
3. OpenGauss
4. Kingbase
5. Presto
6. Trino
7. XMLA
8. SAP BW
9. MariaDB
10. Hive
11. Microsoft SQL Server
12. Amazon Redshift

## Completion audit

- All runnable legacy registrations and exported MySQL-compatible strategies
  are represented in the inventory; commented HANA and Dameng implementations
  and the mock fixture remain explicitly out of scope.
- All 12 previously missing adapters now have independent database plugin
  packages and no inventory row remains pending.
- The final Nx matrix passed build, typecheck, lint, and test targets for the 12
  migrated plugins plus the shared MySQL plugin used by MariaDB.
- The migrated plugins passed 80 deterministic unit tests in total. The
  pre-existing MySQL real-database suite now correctly skips when its `MYSQL_*`
  credentials are unavailable.
- All 12 package dry runs passed and included the compiled entry point,
  declarations, runner, strategy, module, README, and package metadata.
- Runtime package name, version, and `database` category matched each package
  manifest for all 12 compiled plugins.
- All 12 plugins passed `plugin-dev-harness` registration, Nest boot,
  `onStart`, `onStop`, and application shutdown in the final audit.
- The migrated source trees passed the broad type-escape and console scan, Nx
  workspace sync reported no outstanding changes, and `git diff --check`
  passed.
- Live database checks remain credential-gated as recorded per plugin below;
  no endpoint or credential set was available in this workspace.

## XMLA and SAP BW remediation

The original adapter migration copied the complete runnable contents of
`legacies/adapter/src/adapters/xmla.ts` and `sap-bw.ts`, but that was not enough
to satisfy the `DBQueryRunner` contract: the legacy XMLA adapter itself threw
for `getCatalogs()` and `getSchema()`. The protocol implementation then lived
in `packages/xmla` (now maintained in `data-xpert/packages/ocap-xmla`) and was
not represented at the plugin runner boundary.

The remediation deliberately separates ownership:

- `@xpert-ai/plugin-xmla` owns SOAP transport, Discover/Execute envelope
  construction, typed rowset/fault parsing, catalog and cube discovery,
  selected-cube dimension/measure columns, and tabular statement description.
- `@xpert-ai/plugin-sap-bw` inherits the standard XMLA behavior and owns the
  SAP-only `SAP_VARIABLES` rowset plus SAP BW measure data-type mapping.
- `@xpert-ai/ocap-xmla` continues to own MDX query construction, semantic-model
  composition, member navigation, caching, and multidimensional cellsets.

This avoids copying the legacy `Xmla.ts` compatibility implementation (over
7,000 lines and compiled with `ts-nocheck`) into a second repository while
restoring the database capabilities that the host actually invokes.

## Validation log

### `@xpert-ai/plugin-clickhouse` 0.0.1

- Nx build: passed
- Nx typecheck: passed
- Nx lint: passed
- Nx test: passed (7 tests)
- Package dry run: passed; package contains `dist/index.js`, declarations,
  runner, strategy, module, README, and package metadata
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live ClickHouse query: not run because no ClickHouse endpoint or credentials
  are configured in this workspace

### `@xpert-ai/plugin-postgres` 0.0.1

- Nx build: passed
- Nx typecheck: passed
- Nx lint: passed
- Nx test: passed (11 tests)
- Package dry run: passed; package contains `dist/index.js`, declarations,
  runner, CSV stream helper, strategy, module, README, and package metadata
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live PostgreSQL query: not run because no PostgreSQL endpoint or credentials
  are configured in this workspace

### `@xpert-ai/plugin-opengauss` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (5 tests)
- Package dry run: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live OpenGauss query: not run because no OpenGauss endpoint or credentials
  are configured in this workspace

### `@xpert-ai/plugin-kingbase` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (5 tests)
- Package dry run: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live KingbaseES query: not run because no KingbaseES endpoint or credentials
  are configured in this workspace

### `@xpert-ai/plugin-presto` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (9 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live Presto query: not run because no Presto coordinator or credentials are
  configured in this workspace

### `@xpert-ai/plugin-trino` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (5 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live Trino query: not run because no Trino coordinator or credentials are
  configured in this workspace

### `@xpert-ai/plugin-xmla` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (13 tests)
- Package dry run: passed; package includes the protocol parser, runner,
  strategy, module, declarations, README, and package metadata
- Source escape-hatch scan: passed
- Historical `MDSCHEMA_MEASURES` fixture replay: passed (13 fields, 5 rows)
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live XMLA request: not run because no XMLA endpoint or credentials are
  configured in this workspace

### `@xpert-ai/plugin-sap-bw` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (7 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live SAP BW request: not run because no SAP BW XMLA endpoint or credentials
  are configured in this workspace

### `@xpert-ai/plugin-mariadb` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (5 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live MariaDB query: not run because no MariaDB endpoint or credentials are
  configured in this workspace

### `@xpert-ai/plugin-hive` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (7 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live Hive query: not run because no HiveServer2 endpoint or credentials are
  configured in this workspace

### `@xpert-ai/plugin-mssql` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (7 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live SQL Server query: not run because no SQL Server endpoint or credentials
  are configured in this workspace

### `@xpert-ai/plugin-redshift` 0.0.1

- Nx build, typecheck, and lint: passed
- Nx test: passed (7 tests)
- Package dry run: passed
- Source escape-hatch scan: passed
- `plugin-dev-harness`: passed plugin registration, Nest application boot,
  `onStart`, `onStop`, and application shutdown
- Live Redshift query: not run because no AWS credentials or Redshift cluster
  are configured in this workspace
