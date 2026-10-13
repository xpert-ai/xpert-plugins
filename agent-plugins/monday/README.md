# monday.com

Search and work with boards, items, and docs available to the monday.com account on the workspace's shared Connector.

Official endpoint: `https://mcp.monday.com/mcp`

Product docs: [Platform MCP overview](https://developer.monday.com/api-reference/docs/mondaycom-mcp)

Tool reference: [Platform MCP tools](https://developer.monday.com/api-reference/docs/platform-mcp-tools)

This is an independently authored Agent Plugins 1.0 package. It does not copy an OpenAI `.mcp.json`, `.app.json`, or embedded client secret. `plugin.json` declares workspace Connector OAuth for the `monday` server. `mcp.json` uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize monday.com. A workspace administrator authorizes one shared Connector connection; other members use that shared identity and should contact an administrator if it is missing. Tool calls run as the authorizing account, not as each chat user.

monday.com documents Streamable HTTP only. Do not configure `https://mcp.monday.com/sse`.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `initialize` returned 401. `WWW-Authenticate` named protected-resource metadata `https://mcp.monday.com/.well-known/oauth-protected-resource/mcp`.
- That document's `resource` is `https://mcp.monday.com/mcp`, which matches the MCP URL. Its authorization server is `https://auth.monday.com/mcp`. It has no `scopes_supported`.
- Authorization-server metadata at `https://auth.monday.com/.well-known/oauth-authorization-server/mcp` names issuer `https://auth.monday.com/mcp`, authorize `https://auth.monday.com/oauth2/authorize`, token `https://auth.monday.com/oauth_ms/oauth/token`, and registration `https://auth.monday.com/oauth_ms/oauth/register`. PKCE `S256` is advertised. Token endpoint auth methods are `client_secret_post` and `client_secret_basic` only. That document has no `scopes_supported`.
- Minimum OAuth scope: TBD. Protected-resource metadata did not advertise scopes. The issuer `https://auth.monday.com` (without `/mcp`) publishes a different scope list. Do not treat that list as this resource's required scopes.
- Dynamic registration is advertised, but the token endpoint does not advertise public-client `none`. A returned confidential client still needs its secret in the Connector form.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. Write tools require an explicit user request and host approval.

## Icon

The icon is the public PNG `https://cdn.monday.com/images/logos/monday_logo_icon.png`. The Codex `monday-com` manifest at commit `1dc195897af4161d039b80d8471ec0a10c9bbc89` does not declare a license, so its brand files are not copied.

## Skill

`monday-workspace` names a subset of tools from monday.com's Platform MCP tools page. Live schemas win. An authenticated `tools/list` was not available while writing this package.

## Usability test

Without a monday.com OAuth client and a user authorization, tool calls against a real account cannot be verified. Do not write a client id, client secret, or token into the repository or the chat.

1. Pack: `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins monday`
2. Publish the ZIP, or install with platform parameters already configured:
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" monday`
3. An administrator creates a monday.com OAuth app with the new OAuth flow enabled, enters the client id and client secret in the Connector form, and uses the callback URL shown on the form. Choose the smallest scopes that app actually needs. This package cannot name that set from protected-resource metadata.
4. A workspace administrator authorizes one shared Connector connection from workspace Connector settings. Other members use that shared identity and should contact an administrator if it is missing. Do not use the deprecated SSE URL.
5. After authorization, ask for the live tool names. Use only names present in that schema.
6. Read-only smoke: when listed, call `get_user_context`, then `search` or `get_board_info` for a board the tester can already open. Do not create items, change columns, or run a GraphQL mutation.
7. Skill smoke: ask to summarize items on a board the tester names. If tools are unavailable, an administrator authorizes the shared Connector; other members contact an administrator.
8. Without credentials, or without an explicit user request and host approval, do not verify writes. That includes create and update tools, and also move, delete, automation, publish, and agent-management tools, plus `all_monday_api` mutations.

## Verification

Checked on 2026-10-10. `corepack pnpm test` in `agent-plugins` covers the manifest, Connector declaration, and ZIP allowlist. Live monday.com consent was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` passed with `XPERT_PLATFORM_ROOT` set to the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts` (Node v22.14.0, pnpm 10.24.0). This package's result was `PASS monday: distributed ZIP, production parser, digest, Skills and MCP binding`.
