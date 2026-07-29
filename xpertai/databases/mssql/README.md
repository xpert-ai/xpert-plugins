# @xpert-ai/plugin-mssql

Microsoft SQL Server database plugin for Xpert. It preserves the legacy
`mssql` strategy, connection/configuration contract, schema discovery, table
creation and row import with a scoped connection pool.

Tests use a typed client boundary. Live verification requires a SQL Server
endpoint and credentials. No system artifact namespace is required.
