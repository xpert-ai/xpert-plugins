# Canva Connector

Organization-scoped Xpert middleware connector for Canva. It follows the WorkBuddy-style connection flow: an organization administrator configures a Canva China MCP OAuth application in **System Integration**, and an end user clicks Connect to open Canva's official authorization page. The end user never selects an integration or enters a client ID or client secret in the connector UI.

The plugin stores a separate OAuth credential for each workspace user and exposes bounded design search, read, generation, editing-transaction, import, and export tools through the Canva China MCP service. Generated designs include trusted Canva URLs so the user can select a result and continue editing it in Canva.

The first release includes:

- Platform-managed OAuth authorization-code flow with PKCE and refresh-token rotation
- Workspace-scoped runtime credentials resolved through `ConnectorRuntime:canva`
- Bounded design search, metadata, page, and content reads
- Design generation with trusted Canva edit URLs
- Guarded editing transactions, imports, and exports with explicit confirmation
- Export delivery through Xpert Workspace Files
- Stable capability, quota, timeout, and upstream error handling
- Allowlisted Agent DTOs that omit tokens, temporary download URLs, raw provider payloads, and workspace host paths

Direct DCR login and global Canva Connect REST OAuth are not offered for new connections. Compatibility code remains available only for previously stored credentials. The connector never accepts an arbitrary MCP URL.

See [`docs/`](./docs/) for setup, tool contracts, operations, and verification.

## Development

```bash
pnpm exec nx run @xpert-ai/plugin-canva-connector:build
pnpm exec nx run @xpert-ai/plugin-canva-connector:typecheck
pnpm exec nx exec -- jest --config connectors/canva-connector/jest.config.ts --runInBand
```

## Portable Agent Plugin dependency

`agent-plugins/canva-cn` can reuse this provider through
`cn.xpertai.connectors.canva = { type: "existing", provider: "canva", resource: "https://mcp.canva.cn" }`.
Configure the existing Canva China MCP System Integration and create a **personal**
workspace Connector binding before publishing the portable package. The current
strategy explicitly supports `authorizationModes: ['personal', 'shared']`;
legacy shared middleware bindings remain supported but cannot supply another
user's portable plugin credentials. Global Canva REST credentials are not accepted
for the China MCP resource. No OAuth client secret belongs in the portable package.

## Shared Connector authentication

This connector uses [`@xpert-ai/connector-runtime`](../../packages/connector-runtime/README.md) for shared authentication infrastructure. The migration retains its provider/auth-method IDs, credential format and vendor-specific adapters. See the shared migration matrix and verification command before releasing.
