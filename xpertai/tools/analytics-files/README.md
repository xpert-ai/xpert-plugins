# File Analytics

The Live Dashboard Agent generates this provider’s Definition through `analytics_definition_connections` → `analytics_definition_inspect` → `analytics_definition_register`. Existing toolset/Integration credentials stay in their original configuration entries. Settings → Analytics is for viewing, correction and version management; users do not fill internal IDs. See [the authoring guide](../../../../docs/analytics-providers.md#automatic-definition-generation).
`@xpert-ai/plugin-analytics-files` provides `file.table`: declarative CSV, JSON and XLSX queries over platform-authorized Workspace files. Standard charts and HTML dashboards consume the same Dataset/Binding results.


- [Overview](docs/index.mdx) / [中文概览](docs/zh-Hans/index.mdx)
- [Configuration and query contract](docs/configuration.mdx) / [中文配置](docs/zh-Hans/configuration.mdx)
- [Verification](docs/verification.mdx) / [验收](docs/zh-Hans/verification.mdx)
- [Example catalog](examples/sales.json)

Development: `corepack pnpm exec nx run @xpert-ai/plugin-analytics-files:test` from `xpertai/`. Then run the repository plugin lifecycle harness and metadata check. Install at the declared system scope through the platform local deploy command; restart when requested and verify `file.table` discovery before application acceptance.
