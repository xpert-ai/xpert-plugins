# PostgreSQL analytics provider

System plugin `@xpert-ai/plugin-analytics-postgres`; provider `postgres.sql`, operation `query`, version 1, source types pg/postgres.

Uses the platform DataSource runtime and PostgreSQL database plugin for current-user connections, read-only SQL enforcement, cancellation and paging. It introduces no independent credential path.

```json
{"sql":"SELECT region, SUM(amount)::double precision AS amount FROM sales WHERE region = $1 GROUP BY region","parameterOrder":["region"]}
```

Declare region as a typed Binding parameter. parameterOrder maps names to positional values; it never splices SQL. Optional location supplies database/schema. Native output names map to stable Dataset field IDs in the platform. OIDs preserve exact int64/decimal and convert declared floating-point, boolean and timezone-aware timestamp fields. Duplicate columns fail; hasMore and transport truncation both mean partial data.

Build against the current platform SDK; run `corepack pnpm exec nx run @xpert-ai/plugin-analytics-postgres:test`. The opt-in real database test needs standard PGHOST/PGPORT/PGUSER/PGPASSWORD/PGDATABASE process variables and XPERT_POSTGRES_ADAPTER_MODULE pointing to the built PostgreSQL plugin's dist/lib/postgres-workbench.js. It verifies filtering, injection-as-data, pagination and rejected writes without creating tables.

Install the PostgreSQL database plugin and this provider through authenticated deployment. Database principal privileges remain authoritative.

See [provider architecture and Binding usage](docs/index.mdx) and [build, compatibility and verification](docs/verification.mdx).
