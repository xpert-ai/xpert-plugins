# REST/JSON analytics

The Live Dashboard Agent generates this provider’s Definition through `analytics_definition_connections` → `analytics_definition_inspect` → `analytics_definition_register`. Existing toolset/Integration credentials stay in their original configuration entries. Settings → Analytics is for viewing, correction and version management; users do not fill internal IDs. See [the authoring guide](../../../../docs/analytics-providers.md#automatic-definition-generation).
`@xpert-ai/plugin-analytics-rest` exposes provider `rest.json` for Analytics Definitions. It converts approved JSON operations on existing platform OpenAPI toolsets into Dataset/Binding queries. It owns no HTTP client, credentials or browser renderer.

Requires a host and SDK exporting `RestClientRuntimeCapability` (`platform.rest.client`). The canonical Analytics interface requires the companion platform Contracts/SDK release; follow [the source verification and release guide](../../../../docs/analytics-providers.md).

See [configuration](docs/configuration.mdx), [verification](docs/verification.mdx) and the [example catalog](examples/sales.json). Run `corepack pnpm exec nx test @xpert-ai/plugin-analytics-rest` in this package with the matching SDK, then the repository plugin lifecycle harness and metadata check before deployment.
