# DB Studio

`@xpert-ai/plugin-db-studio` provides a governed database workbench for Xpert. It connects to authorized Doris, MySQL, and PostgreSQL data sources through the host `platform.datasource.workbench` capability and exposes the same service layer to the Remote View and Agent middleware tools.

The plugin is system level and uses the stable artifact namespace `db_studio`. Every persisted record is scoped by tenant, organization, workspace, and user. Read operations are bounded by row, byte, and time limits. Mutations are represented as frozen plans and require the current policy plus human approval unless an explicit policy allows the action. The `readOnlyTest` plugin option (or `DB_STUDIO_READ_ONLY_TEST=1`) disables all mutation paths for read-only acceptance testing.

## Development

Build and test from the `xpertai` workspace:

```bash
corepack pnpm --filter @xpert-ai/plugin-db-studio typecheck
corepack pnpm --filter @xpert-ai/plugin-db-studio test
corepack pnpm --filter @xpert-ai/plugin-db-studio build
```

The Remote View test uses a simulated host and an opaque-origin iframe. It does not connect to a database. Real database acceptance is limited to the authorized BI data source and read-only statements.

See [docs/ARCHITECTURE.zh-CN.md](docs/ARCHITECTURE.zh-CN.md) for the service boundaries and security invariants.
