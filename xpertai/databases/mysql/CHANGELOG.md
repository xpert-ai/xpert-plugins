# @xpert-ai/plugin-mysql

## 0.1.1

### Patch Changes

- 39e4b6c: Export the public Doris connection factory and workbench adapter. Support Doris metadata and time functions, bounded queries with up to 50,000 rows, and INSERT VALUES independently of other write-operation version gates while preserving existing MySQL and StarRocks behavior.

  Preserve row-count evidence in pending Stream Load receipts and support bounded 307/308 redirect chains restricted to configured hosts, protocol and import path. Require SDK ^3.21.0 for the shared workbench contracts.
