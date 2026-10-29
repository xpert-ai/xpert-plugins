# @xpert-ai/plugin-mssql

Microsoft SQL Server database plugin for Xpert. It preserves the legacy
`mssql` strategy, connection/configuration contract, schema discovery, table
creation and row import with a scoped connection pool.

Unit tests use a typed client boundary. The ESM regression tests load the built
package entry with the real `mssql` dependency and verify that driver metadata
can be inspected without connecting to SQL Server.

From `xpertai/`, run:

```sh
corepack pnpm exec nx test @xpert-ai/plugin-mssql
corepack pnpm exec nx typecheck @xpert-ai/plugin-mssql
```

The test target builds the package and runs the ESM checks before the unit
tests. Live query verification still requires a SQL Server endpoint and
credentials. No system artifact namespace is required.
