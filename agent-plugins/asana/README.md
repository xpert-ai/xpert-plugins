# Asana

Search and work with tasks, projects, and portfolios available to the Asana account on the workspace's shared Connector.

Official endpoint: `https://mcp.asana.com/v2/mcp`

Product docs: [Using Asana's MCP Server](https://developers.asana.com/docs/using-asanas-mcp-server)

Tool reference: [MCP Tools Reference](https://developers.asana.com/docs/mcp-tools-reference)

This is an independently authored Agent Plugins 1.0 package. It does not copy an OpenAI `.mcp.json`, `.app.json`, or embedded client secret. `plugin.json` declares workspace Connector OAuth for the `asana` server. `mcp.json` uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Asana. A workspace administrator authorizes one shared Connector connection; other members use that shared identity and should contact an administrator if it is missing. Tool calls run as the authorizing account, not as each chat user.

Do not configure `https://mcp.asana.com/sse`. Asana documents that beta URL as deprecated.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `initialize` returned 401. `WWW-Authenticate` named protected-resource metadata `https://mcp.asana.com/.well-known/oauth-protected-resource/v2`.
- That document's `resource` is `https://mcp.asana.com/v2/mcp`, which matches the MCP URL. Its authorization server is `https://app.asana.com`. `scopes_supported` is `default`.
- Authorization-server metadata at `https://app.asana.com/.well-known/oauth-authorization-server` names issuer `https://app.asana.com`, authorize `https://app.asana.com/-/oauth_authorize`, and token `https://app.asana.com/-/oauth_token`. PKCE `S256` is advertised. There is no `registration_endpoint`. Token endpoint auth methods are `client_secret_post` and `client_secret_basic` only.
- Minimum OAuth scope: `default`. That is the only scope advertised by the v2 protected-resource metadata. Asana's tool reference says MCP apps do not use a finer permission-scope list and that authorization follows the authorizing account's existing access.
- A different document at `https://mcp.asana.com/.well-known/oauth-protected-resource` names `resource` `https://mcp.asana.com` and authorization server `https://mcp.asana.com`, which does advertise dynamic registration. That resource does not match the v2 MCP URL. Do not substitute it.

A workspace administrator must register an Asana app and enter its client id and client secret in the Connector form. Do not commit those values. The redirect URI must be the Xpert Connector callback. This package does not invent that URI. Write tools require an explicit user request and host approval.

## Icon

The icon is the public PNG `https://d3ki9tyy5l5ruj.cloudfront.net/obj/df5bcec7e9873dddebdd1328901c287f0f069750/asana-logo-favicon@3x.png`, linked from Asana's own favicon host. The inspected Codex tree has no Asana package, so no Codex asset is bundled.

## Skill

`asana-workspace` names tools from Asana's V2 tools reference. Live schemas win. An authenticated `tools/list` was not available while writing this package.

## Usability test

Without a registered Asana OAuth app and a user authorization, tool calls against a real workspace cannot be verified. Do not write a client id, client secret, or token into the repository or the chat.

1. Pack: `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins asana`
2. Publish the ZIP, or install with platform parameters already configured:
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" asana`
3. An administrator registers an Asana app, puts the client id and client secret in the Connector form, and uses the callback URL shown on the form. Request the discovered scope `default`. Do not point the server URL at `https://mcp.asana.com/sse`.
4. A workspace administrator authorizes one shared Connector connection from workspace Connector settings and selects the Asana workspace the provider asks for. Other members use that shared identity and should contact an administrator if it is missing.
5. After authorization, ask for the live tool names. Use only names present in that schema.
6. Read-only smoke: ask for `get_me` when that tool is listed, then ask for the authorizing account's incomplete tasks. Do not create, update, or delete tasks.
7. Skill smoke: ask to summarize tasks due this week in a project the authorizing account can already open. If tools are unavailable, an administrator authorizes the shared Connector; other members contact an administrator.
8. Without credentials, or without an explicit user request and host approval, do not verify `create_tasks`, `update_tasks`, `delete_task`, `add_comment`, or `create_project`.

## Verification

Checked on 2026-10-10. `corepack pnpm test` in `agent-plugins` covers the manifest, Connector declaration, and ZIP allowlist. Live Asana consent was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` passed with `XPERT_PLATFORM_ROOT` set to the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts` (Node v22.14.0, pnpm 10.24.0). This package's result was `PASS asana: distributed ZIP, production parser, digest, Skills and MCP binding`.
