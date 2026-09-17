---
"@xpert-ai/plugin-mysql": minor
"@xpert-ai/plugin-postgres": minor
---

Add SQL workbench adapters for MySQL, Apache Doris, and PostgreSQL with precision-preserving results, bounded query execution, and database import support. Expose the adapters through existing data source runners, isolate MySQL/Doris connections by database, and forward query parameters. Require plugin SDK 3.18.6 for the shared data-workbench contract.

Support Doris FE Stream Load with the required 100-continue header and explicitly allowlisted redirects that retain only configured credentials.
