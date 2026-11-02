# @xpert-ai/plugin-hana

## 0.1.1

### Patch Changes

- 335d4f5: Allow read-only HANA queries on servers that reject native statement timeouts. Retry only the explicit unsupported-timeout error once, retaining the original client deadline, communication timeout, cancellation and read-only session protections.

## 0.1.0

### Minor Changes

- b449475: Move MySQL, Doris and PostgreSQL SQL dialect, metadata and location handling from the platform SDK into their database plugins. Declare scoped workbench support on each strategy and retain shared parsing/execution helpers in the plugin repository. Migrate DB Studio off the removed SDK implementation exports.

  Add the hana.sql Analytics provider with HANA-owned discovery and parameterized read-only queries, exact numeric values, bounded results and cancellation. Saved tenant credentials remain host-owned; HANA validates its fixed tenant and selected schema.

  Requires platform SDK 3.29.0 or later in the 3.x series. Dependencies and the frozen lockfile use the published 3.29.0 release. Upgrade the host and these plugins together; older DB Studio and database plugins still import the removed SDK implementations.
