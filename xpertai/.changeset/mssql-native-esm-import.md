---
"@xpert-ai/plugin-mssql": patch
---

Fix the MSSQL driver's CommonJS import in native ESM so constructing a runner
for data source metadata no longer throws a ConnectionPool constructor error.
