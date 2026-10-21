# MySQL & Apache Doris analytics providers

`@xpert-ai/plugin-analytics-mysql` registers two independent Binding provider IDs:

| Provider | Platform source type | Operation |
| --- | --- | --- |
| `mysql.sql` | `mysql` | `query`, version 1 |
| `doris.sql` | `doris` | `query`, version 1 |

Install the existing `@xpert-ai/plugin-mysql` database driver and this system plugin.
Create a platform DataSource with a read-only database account. Credentials, current-viewer
authorization and connection lifetime stay in the platform DataSource runtime. This package
owns discovery, native query validation and wire-to-Dataset conversion; it adds no platform
database switch, dashboard renderer, authoring tool or credential path.

Start discovery with `{}` and follow returned `inspectRequest` / `nextRequest` values.
Agents receive the source-specific Binding payload contract and metadata comments at runtime.

```json
{
  "sql": "SELECT region,SUM(amount) AS amount FROM sales WHERE (? IS NULL OR region=?) GROUP BY region",
  "parameterOrder": ["region", "region"],
  "location": {"database": "analytics"}
}
```

Declare `region` as a nullable string Binding parameter linked to a dashboard control,
`region` as a string dimension, and `amount` as a decimal measure. Repeat the parameter
name for each positional `?`. Decimal and BIGINT stay exact strings; do not coerce them
through JavaScript Number. HTML and standard dashboards use the same normalized Dataset.
The iframe can only query saved Binding IDs with declared scalar controls.

Doris supports the internal catalog only and requires database SELECT-only privileges.
The shared driver does not expose a Doris read-only transaction. MySQL additionally uses
a read-only transaction. MariaDB, RDS MySQL and StarRocks are not advertised by this package.

From `xpertai`, run `corepack pnpm exec nx run @xpert-ai/plugin-analytics-mysql:test` and `typecheck`.
Development dependencies pin published SDK/contracts 3.25.0. See [verification](docs/verification.mdx)
for real-engine tests, lifecycle, packaging and host runtime requirements.

See [architecture and query contract](docs/index.mdx).
See the [local acceptance record](docs/acceptance.mdx) for tested scope and release limits.
