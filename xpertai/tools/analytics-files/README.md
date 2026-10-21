# File Analytics

`@xpert-ai/plugin-analytics-files` provides `file.table`: declarative CSV, JSON and XLSX queries over platform-authorized Workspace files. Standard charts and HTML dashboards consume the same Dataset/Binding results.

Administrators configure a `workspace-files` data source with approved file references, explicit format/read options, column types and business descriptions. Agent discovery returns the exact query contract and a bounded real preview; no new Agent middleware is required. File parsing, aggregation and format dependencies remain in this plugin. The platform owns file permissions, data-source authorization and Artifact lifecycle.

- [Overview](docs/index.mdx) / [中文概览](docs/zh-Hans/index.mdx)
- [Configuration and query contract](docs/configuration.mdx) / [中文配置](docs/zh-Hans/configuration.mdx)
- [Verification](docs/verification.mdx) / [验收](docs/zh-Hans/verification.mdx)
- [Example catalog](examples/sales.json)

Development: `corepack pnpm exec nx run @xpert-ai/plugin-analytics-files:test` from `xpertai/`. Then run the repository plugin lifecycle harness and metadata check. Install at the declared system scope through the platform local deploy command; restart when requested and verify `file.table` discovery before application acceptance.
