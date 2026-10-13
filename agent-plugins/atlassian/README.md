# Atlassian

Search and work with Jira, Confluence, and other Atlassian cloud products the workspace's shared Connector account can access.

Official endpoint for this package: `https://mcp.atlassian.com/v2/mcp`

Product docs: [Getting started with the Atlassian remote MCP server](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/)

Tool reference checked on 2026-10-10: [Supported tools](https://developer.atlassian.com/cloud/rovo-mcp/guides/supported-tools/)

This is an independently authored Agent Plugins 1.0 package. It does not copy an OpenAI `.mcp.json`, `.app.json`, or embedded client secret. `plugin.json` declares workspace Connector OAuth for the `atlassian` server. `mcp.json` uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Atlassian. A workspace administrator authorizes one shared Connector connection; other members use that shared identity and should contact an administrator if it is missing. Tool calls run as the authorizing account, not as each chat user.

This package uses `https://mcp.atlassian.com/v2/mcp`. It does not use `https://mcp.atlassian.com/v1/mcp` or `https://mcp.atlassian.com/v1/mcp/authv2`.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `initialize` against `https://mcp.atlassian.com/v2/mcp` returned 401. `WWW-Authenticate` named protected-resource metadata `https://mcp.atlassian.com/.well-known/oauth-protected-resource/v2/mcp`.
- That document's `resource` is `https://mcp.atlassian.com/v2/mcp`, which matches the MCP URL. Its authorization server is `https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3`. The path segment is the public issuer identifier from that metadata document. It is not a client id or client secret, and this package does not embed it.
- Minimum OAuth scope: `read:me`, `read:account`, `offline_access`, `email`, `read:jira:agent-interface`, `write:jira:agent-interface`, `search:jira:agent-interface`, `delete:jira:agent-interface`, `manage:jira:agent-interface`, `read:confluence:agent-interface`, `write:confluence:agent-interface`, `search:confluence:agent-interface`, `search:rovo:agent-interface`, `search:code:agent-interface`, `read:all:twg`, `write:all:twg`, `read:goals:agent-interface`, `write:goals:agent-interface`, `read:projects:agent-interface`, `write:projects:agent-interface`, `read:bitbucket:agent-interface`, `write:bitbucket:agent-interface`, `read:loom:agent-interface`, `write:loom:agent-interface`, `read:talent:agent-interface`, `write:talent:agent-interface`, `read:jira-align:agent-interface`, `write:jira-align:agent-interface`, `read:teams:agent-interface`, `write:teams:agent-interface`, `read:artifacts:agent-interface`, `write:artifacts:agent-interface`, `read:capacity-planning:agent-interface`, `write:capacity-planning:agent-interface`, `read:focus:agent-interface`, `write:focus:agent-interface`, `read:assets:agent-interface`, and `write:assets:agent-interface`. Those are the `scopes_supported` values on the v2 protected-resource metadata. The document does not name a smaller required subset. Do not add scopes outside that list.
- Authorization-server metadata for that issuer, at `https://auth.atlassian.com/.well-known/oauth-authorization-server/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3`, names authorize `https://auth.atlassian.com/authorize`, token `https://auth.atlassian.com/oauth/token`, registration `https://auth.atlassian.com/VCeDsk8ZHncYF1g234fKtc4lNipbBhu3/dcr/register`, and revocation `https://auth.atlassian.com/oauth/revoke`. PKCE `S256` is advertised. Token endpoint auth methods include `none`, `client_secret_post`, `client_secret_basic`, and `private_key_jwt`. Grant types include `authorization_code` and `refresh_token`. That document has no `scopes_supported`. Client ID Metadata Documents are advertised. Live registration and consent were not run.
- `https://mcp.atlassian.com/.well-known/oauth-authorization-server` names a different issuer, `https://mcp.atlassian.com`, with v1 authorize, token, and register endpoints, and it has no `scopes_supported`. The v2 protected-resource document does not name that issuer. Do not use it for this URL.
- `https://mcp.atlassian.com/v1/mcp` returned 401 without `resource_metadata` on the same check. `https://mcp.atlassian.com/v1/mcp/authv2` publishes protected-resource metadata whose `resource` is that authv2 URL. The OpenID configuration at `https://auth.atlassian.com` advertises a different scope list. This package does not use those URLs or those scopes.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. Write tools require an explicit user request and host approval even when a write scope is granted.

## Icon

`assets/app-icon.png` is the MIT-licensed Codex composer icon. See [assets/README.md](assets/README.md).

## Skill

`atlassian-workspace` names the primary tools documented on 2026-10-10. Live schemas win. An authenticated `tools/list` was not available while writing this package.

## Usability test

Without an OAuth client the host can register and a user authorization, tool calls against a real Atlassian site cannot be verified. Do not write a client id, client secret, or token into the repository or the chat.

1. Pack: `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins atlassian`
2. Publish the ZIP, or install with platform parameters already configured:
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" atlassian`
3. An administrator completes Connector OAuth with the callback URL shown on the form. Request the discovered scope list above. Leave any client secret in the Connector form. Do not put it in this package.
4. A workspace administrator authorizes one shared Connector connection from workspace Connector settings. Other members use that shared identity and should contact an administrator if it is missing. Installing the package does not authorize the account.
5. After authorization, ask for the live tool names. Use only names present in that schema.
6. Read-only smoke, on a site the authorizing account can already open: ask to list accessible sites and summarize one issue or page. Do not create or edit work items or pages.
7. Skill smoke: ask to summarize an issue or page the authorizing account can already read. If tools are unavailable, an administrator authorizes the shared Connector; other members contact an administrator.
8. Without credentials, or without an explicit user request and host approval, do not verify `executeWrite`, `executeDestructive`, or issue and page creation.

## Verification

Checked on 2026-10-10. `corepack pnpm test` in `agent-plugins` covers the manifest, Connector declaration, and ZIP allowlist. Live Atlassian consent was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` passed with `XPERT_PLATFORM_ROOT` set to the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts` (Node v22.14.0, pnpm 10.24.0). This package's result was `PASS atlassian: distributed ZIP, production parser, digest, Skills and MCP binding`.
