# Stripe

Read the Stripe account on the workspace's shared Connector, and run only the API writes an explicit user request allows.

Official endpoint: `https://mcp.stripe.com`

Product docs: [Stripe MCP](https://docs.stripe.com/mcp)

This is an independently authored Agent Plugins 1.0 package. It does not copy Stripe's plugin skills, an OpenAI `.mcp.json`, `.app.json`, or an API key. `plugin.json` declares workspace Connector OAuth for the `stripe` server. `mcp.json` uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Stripe. A workspace administrator authorizes one shared Connector connection; other members use that shared identity and should contact an administrator if it is missing. Tool calls run as the authorizing account, not as each chat user.

This package uses Connector OAuth. It does not store an agent API key or a secret key.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `initialize` returned 401. `WWW-Authenticate` named protected-resource metadata `https://mcp.stripe.com/.well-known/oauth-protected-resource`.
- That document's `resource` is `https://mcp.stripe.com`, which matches the MCP URL. Its authorization server is `https://access.stripe.com/mcp`. `scopes_supported` is `mcp`.
- Authorization-server metadata at `https://access.stripe.com/.well-known/oauth-authorization-server/mcp` names issuer `https://access.stripe.com/mcp`, authorize `https://access.stripe.com/mcp/oauth2/authorize`, token `https://access.stripe.com/mcp/oauth2/token`, and registration `https://access.stripe.com/mcp/oauth2/register`. PKCE `S256` is advertised. The only token endpoint auth method is `none`. `grant_types_supported` includes `authorization_code` and `refresh_token`. `scopes_supported` is `mcp`.
- Minimum OAuth scope: `mcp`. That is the only scope advertised by the protected-resource metadata and the authorization-server metadata.
- Write tools require an explicit user request and host approval. Stripe also documents its own confirmation step for some `stripe_api_write` actions.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. Connected-account calls that need a restricted API key and a `Stripe-Account` header are outside this OAuth package.

## Icon

The icon is the public favicon `https://stripe.com/favicon.ico`. The Codex Stripe manifest at commit `1dc195897af4161d039b80d8471ec0a10c9bbc89` does not declare a license, so its `assets/logo.png` and skills are not copied.

## Skill

`stripe-workspace` names tools from the Stripe MCP docs checked on 2026-10-10. Live schemas win. An authenticated `tools/list` was not available while writing this package.

## Usability test

Without a completed Stripe OAuth grant, tool calls against a real account cannot be verified. Do not write an API key, client id, client secret, or token into the repository or the chat.

1. Pack: `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins stripe`
2. Publish the ZIP, or install with platform parameters already configured:
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" stripe`
3. An administrator completes Connector OAuth with the callback URL shown on the form. Request the discovered scope `mcp`. Prefer a Stripe sandbox for the first connection.
4. A workspace administrator authorizes one shared Connector connection from workspace Connector settings. Other members use that shared identity and should contact an administrator if it is missing. Prefer a Stripe sandbox for the first connection.
5. After authorization, ask for the live tool names. Use only names present in that schema.
6. Read-only smoke: when listed, call `get_stripe_account_info` or `stripe_api_read` for a list the tester names. Do not call `stripe_api_write`.
7. Skill smoke: ask to summarize products or customers the authorizing account can already see. If tools are unavailable, an administrator authorizes the shared Connector; other members contact an administrator.
8. Without credentials, or without an explicit user request and host approval, do not verify refunds, subscription changes, or Treasury money movement.

## Verification

Checked on 2026-10-10. `corepack pnpm test` in `agent-plugins` covers the manifest, Connector declaration, and ZIP allowlist. Live Stripe consent was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` passed with `XPERT_PLATFORM_ROOT` set to the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts` (Node v22.14.0, pnpm 10.24.0). This package's result was `PASS stripe: distributed ZIP, production parser, digest, Skills and MCP binding`.
