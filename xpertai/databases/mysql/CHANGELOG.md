# @xpert-ai/plugin-mysql

## 0.2.0

### Minor Changes

- b449475: Move MySQL, Doris and PostgreSQL SQL dialect, metadata and location handling from the platform SDK into their database plugins. Declare scoped workbench support on each strategy and retain shared parsing/execution helpers in the plugin repository. Migrate DB Studio off the removed SDK implementation exports.

  Add the hana.sql Analytics provider with HANA-owned discovery and parameterized read-only queries, exact numeric values, bounded results and cancellation. Saved tenant credentials remain host-owned; HANA validates its fixed tenant and selected schema.

  Requires platform SDK 3.29.0 or later in the 3.x series. Dependencies and the frozen lockfile use the published 3.29.0 release. Upgrade the host and these plugins together; older DB Studio and database plugins still import the removed SDK implementations.

### Patch Changes

- Updated dependencies [b449475]
  - @xpert-ai/sql-workbench@0.1.1

## 0.1.1

### Patch Changes

- 39e4b6c: Export the public Doris connection factory and workbench adapter. Support Doris metadata and time functions, bounded queries with up to 50,000 rows, and INSERT VALUES independently of other write-operation version gates while preserving existing MySQL and StarRocks behavior.

  Preserve row-count evidence in pending Stream Load receipts and support bounded 307/308 redirect chains restricted to configured hosts, protocol and import path. Require SDK ^3.21.0 for the shared workbench contracts.
