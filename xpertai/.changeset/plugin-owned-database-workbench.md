---
"@xpert-ai/plugin-hana": minor
"@xpert-ai/plugin-mysql": minor
"@xpert-ai/plugin-postgres": minor
"@xpert-ai/plugin-db-studio": patch
"@xpert-ai/sql-workbench": patch
---

Move MySQL, Doris and PostgreSQL SQL dialect, metadata and location handling from the platform SDK into their database plugins. Declare scoped workbench support on each strategy and retain shared parsing/execution helpers in the plugin repository. Migrate DB Studio off the removed SDK implementation exports.

Add the hana.sql Analytics provider with HANA-owned discovery and parameterized read-only queries, exact numeric values, bounded results and cancellation. Saved tenant credentials remain host-owned; HANA validates its fixed tenant and selected schema.

Requires the coordinated platform SDK major release. Before publishing, update the affected SDK peer/dev dependency floors and lockfile to that actual published release; the current review dependencies do not satisfy the new source contract. Upgrade the host and these plugins together.
