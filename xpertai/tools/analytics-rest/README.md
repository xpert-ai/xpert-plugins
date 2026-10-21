# REST/JSON analytics

`@xpert-ai/plugin-analytics-rest` exposes provider `rest.json` and data source type `rest-json`. It converts approved JSON operations on existing platform OpenAPI toolsets into Dataset/Binding queries. It owns no HTTP client, credentials or browser renderer.

Requires a host and SDK exporting `RestClientRuntimeCapability` (`platform.rest.client`). Development dependencies pin published SDK/contracts 3.25.0, which contain this interface. No local platform links are required.

See [configuration](docs/configuration.mdx), [verification](docs/verification.mdx) and the [example catalog](examples/sales.json). Run `corepack pnpm exec nx test @xpert-ai/plugin-analytics-rest` in this package with the matching SDK, then the repository plugin lifecycle harness and metadata check before deployment.
