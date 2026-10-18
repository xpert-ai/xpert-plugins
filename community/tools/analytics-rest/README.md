# REST/JSON analytics

`@xpert-ai/plugin-analytics-rest` exposes provider `rest.json` and data source type `rest-json`. It converts approved JSON operations on existing platform OpenAPI toolsets into Dataset/Binding queries. It owns no HTTP client, credentials or browser renderer.

Requires a host and SDK exporting `RestClientRuntimeCapability` (`platform.rest.client`). Published SDK 3.23.1 alone does not contain this new capability; build against the matching host SDK until it is released. No machine-specific dependency paths are committed.

See [configuration](docs/configuration.mdx), [verification](docs/verification.mdx) and the [example catalog](examples/sales.json). Run `corepack pnpm test` in this package with the matching SDK, then the repository plugin lifecycle harness and metadata check before deployment.
