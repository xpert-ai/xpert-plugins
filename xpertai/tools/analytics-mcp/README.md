# MCP analytics provider

`@xpert-ai/plugin-analytics-mcp` registers `mcp.tool` for platform DataSources of type
`mcp-tools`. It reuses an existing platform MCP toolset and the current viewer's connection
authentication. It does not create another MCP client or store MCP URLs/tokens.

The platform must expose `McpClientRuntimeCapability` (`platform.mcp.client`).
The adapter uses `client.tools.list/call`; the host currently enforces read-only calls.
Development dependencies pin published SDK/contracts 3.25.0, which contain this interface.
The host must also implement the corresponding runtime capability.

1. Configure an MCP connection in an authoring workspace and verify its tools normally.
2. Install this system plugin. Add a platform `mcp-tools` DataSource using
   [the configuration example](examples/data-source-options.json).
3. Replace the example workspace/toolset IDs and exact server/tool names with the existing
   connection. Approve only genuinely read-only tools and author the metric/field mapping.
4. Discover `{}`, follow `inspectRequest`, and copy the returned revision, Tool Schema and
   `toolContractHash`. Preview the Binding before creating a standard or HTML dashboard.

The viewer needs both platform source access and read access to the connection's workspace.
Only enabled, model-visible tools with `readOnlyHint: true` are eligible. The configuration
catalog is an additional allowlist; an annotation is not an authorization grant or proof of
side-effect-free implementation. Use appropriately restricted upstream credentials.

See [configuration and limits](docs/configuration.mdx) and [verification](docs/verification.mdx).

For a public analytics fixture, the community-maintained
[Open-Meteo MCP server](https://github.com/cyanheads/open-meteo-mcp-server) exposes
`https://open-meteo.caseyjhand.com/mcp` over Streamable HTTP. Configure it in the
platform with server name `openmeteo`, enable only `openmeteo_get_forecast`, then use
[the daily forecast mapping](examples/open-meteo-options.json) with your workspace
and toolset IDs. The public endpoint was reachable without credentials on 2026-10-18
and advertised `readOnlyHint: true`; inspect its live schema before previewing.
Use numeric forecast-day choices such as 3/7/14 to test filters, and compare execution
IDs/fetch times to test refresh. Upstream forecasts need not change on every refresh.
Disabling the platform tool must reject the same saved Binding; this tests platform
authorization revocation, not OAuth revocation at the public service.

```sh
# Run from the xpertai workspace, using the published SDK pinned in the lockfile.
corepack pnpm exec nx run @xpert-ai/plugin-analytics-mcp:test
```

No dashboard renderer changes are required. Saving, filtering, refreshing and reopening
continue to use the same Dataset/Binding and Artifacts interfaces. MCP Apps are not dashboard
data sources; this first adapter covers `tools/call`, not Resource retrieval or subscriptions.
