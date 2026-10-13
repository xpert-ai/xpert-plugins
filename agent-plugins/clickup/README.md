# ClickUp

Search and work with tasks, docs, and the workspace hierarchy available to the ClickUp account on the workspace's shared Connector.

Official endpoint: `https://mcp.clickup.com/mcp`

Product docs: [ClickUp's MCP Server](https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server)

Tool page: [Supported tools](https://developer.clickup.com/docs/mcp-tools)

This is an independently authored Agent Plugins 1.0 package. It does not copy an OpenAI `.mcp.json`, `.app.json`, or embedded client secret. `plugin.json` declares workspace Connector OAuth for the `clickup` server. `mcp.json` uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize ClickUp. A workspace administrator authorizes one shared Connector connection; other members use that shared identity and should contact an administrator if it is missing. Tool calls run as the authorizing account, not as each chat user.

ClickUp documents OAuth for this server. This package does not use an API key or personal token.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `initialize` returned 401. `WWW-Authenticate` named protected-resource metadata `https://mcp.clickup.com/.well-known/oauth-protected-resource/mcp`.
- That document's `resource` is `https://mcp.clickup.com/mcp`, which matches the MCP URL. Its authorization server is `https://mcp.clickup.com`. `scopes_supported` is `read` and `write`.
- Authorization-server metadata at `https://mcp.clickup.com/.well-known/oauth-authorization-server` names issuer `https://mcp.clickup.com`, authorize `https://mcp.clickup.com/oauth/authorize`, token `https://mcp.clickup.com/oauth/token`, and registration `https://mcp.clickup.com/oauth/register`. PKCE `S256` is advertised. The only token endpoint auth method is `none`. `grant_types_supported` lists `authorization_code` and does not list `refresh_token`.
- Minimum OAuth scope: `read` and `write`. Those are the scopes advertised by the protected-resource metadata and the authorization-server metadata. The documents do not name a smaller required subset. Do not add scopes outside that list.
- Write tools require an explicit user request and host approval even when the `write` scope is granted.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. Live refresh behavior was not verified.

## Icon

`assets/composer-icon.png` is the MIT-licensed Codex composer icon. See [assets/README.md](assets/README.md).

## Skill

`clickup-workspace` follows ClickUp's public tools page. That page uses display labels and does not publish machine tool names. Live schemas win. An authenticated `tools/list` was not available while writing this package.

## Usability test

Without a completed ClickUp OAuth grant, tool calls against a real Workspace cannot be verified. Do not write a client id, client secret, or token into the repository or the chat.

1. Pack: `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins clickup`
2. Publish the ZIP, or install with platform parameters already configured:
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" clickup`
3. An administrator completes Connector OAuth with the callback URL shown on the form. Request the discovered scopes `read` and `write`. Leave any client secret in the Connector form.
4. A workspace administrator authorizes one shared Connector connection from workspace Connector settings. Other members use that shared identity and should contact an administrator if it is missing.
5. After authorization, ask for the live tool names. Use only names present in that schema. Do not turn a display label such as "Get Task" into a guessed identifier.
6. Read-only smoke: ask to search or read a task the authorizing account can already open. Do not create, update, delete, comment, chat, or track time.
7. Skill smoke: ask to summarize open work in a List the tester names. If tools are unavailable, an administrator authorizes the shared Connector; other members contact an administrator.
8. Without credentials, or without an explicit user request and host approval, do not verify task creation, comments, chat messages, or time entries.

## Verification

Checked on 2026-10-10. `corepack pnpm test` in `agent-plugins` covers the manifest, Connector declaration, and ZIP allowlist. Live ClickUp consent was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` passed with `XPERT_PLATFORM_ROOT` set to the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts` (Node v22.14.0, pnpm 10.24.0). This package's result was `PASS clickup: distributed ZIP, production parser, digest, Skills and MCP binding`.
