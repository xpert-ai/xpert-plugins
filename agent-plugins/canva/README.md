# Canva

Search and work with designs in the global Canva account on the workspace's shared Connector.

Official endpoint: `https://mcp.canva.com/mcp`

Product docs: [Canva MCP](https://www.canva.dev/docs/mcp/)

Tool reference: [MCP tools and rate limits](https://www.canva.dev/docs/apps/mcp/tools/)

This is an independently authored Agent Plugins 1.0 package for global Canva. It does not modify, replace, or rename `canva-cn`. A Canva China Connector binding for `https://mcp.canva.cn` does not authorize this server. This package does not copy Canva's Codex skills, an OpenAI `.mcp.json`, `.app.json`, or a client secret.

`plugin.json` declares workspace Connector OAuth with connector key `canva-global`. `mcp.json` uses the same server key and portable `streamable-http`. The human-facing name stays Canva. This key is separate from `canva-cn`, whose existing Connector uses provider `canva`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Canva. A workspace administrator authorizes one shared Connector connection; other members use that shared identity and should contact an administrator if it is missing. Tool calls run as the authorizing account, not as each chat user. The connector key is `canva-global`. This does not authorize Canva China.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `initialize` returned 401. `WWW-Authenticate` named protected-resource metadata `https://mcp.canva.com/.well-known/oauth-protected-resource/mcp`.
- That document's `resource` is `https://mcp.canva.com/mcp`, which matches the MCP URL. Its authorization server is `https://mcp.canva.com`.
- Minimum OAuth scope: `profile:read`, `design:meta:read`, `design:content:write`, `design:content:read`, `folder:read`, `folder:write`, `brandtemplate:content:read`, `brandtemplate:meta:read`, `brandtemplate:content:write`, `comment:write`, `comment:read`, `asset:read`, `asset:write`, `brandkit:read`, `help:answers:read`, and `help:answers:write`. Those are the `scopes_supported` values on the protected-resource metadata. The document does not name a smaller required subset. Do not add scopes outside that list.
- Authorization-server metadata at `https://mcp.canva.com/.well-known/oauth-authorization-server` names issuer `https://mcp.canva.com`, authorize `https://mcp.canva.com/authorize`, token `https://mcp.canva.com/token`, and registration `https://mcp.canva.com/register`. PKCE `S256` is advertised. Token endpoint auth methods include `none`, `client_secret_basic`, and `client_secret_post`. Canva also documents Client ID Metadata Documents. The path `/.well-known/oauth-authorization-server/mcp` returned 404; use the issuer document above.
- The origin protected-resource document names `resource` `https://mcp.canva.com` without `/mcp`. Keep the resource from the `WWW-Authenticate` document, which matches the MCP URL.
- Write tools require an explicit user request and host approval even when a write scope was granted.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. Do not reuse a Canva China token for this resource.

## Icon

The list icon is the PNG in [assets/icon.png](assets/icon.png), embedded in `plugin.json` as a `data:image/png;base64` URL. It is Canva's public apple-touch icon from `https://static.canva.com/static/images/apple-touch-icon.png` (HTTP 200, `image/png`, no redirect). `https://www.canva.com/favicon.ico` redirects, and that redirect can return HTML, which the host cannot draw. See [assets/README.md](assets/README.md). The Codex Canva manifest at commit `1dc195897af4161d039b80d8471ec0a10c9bbc89` does not declare a license, so its skills and brand files are not copied.

## Skill

`canva-workspace` names tools from Canva's public MCP docs. Live schemas win. An authenticated `tools/list` was not available while writing this package. This skill is not the Canva China skill.

## Usability test

Without a completed Canva OAuth grant, tool calls against a real account cannot be verified. Do not write a client id, client secret, or token into the repository or the chat.

1. Pack: `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins canva`
2. Publish the ZIP, or install with platform parameters already configured:
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" canva`
3. Confirm the installed package name is `canva`, the Connector and MCP server key is `canva-global`, and the server URL is `https://mcp.canva.com/mcp`. Leave `canva-cn` installed and unchanged. Do not bind this package to the Canva China provider `canva`.
4. An administrator completes Connector OAuth with the callback URL shown on the form. Request the discovered scope list above. Leave any client secret in the Connector form.
5. A workspace administrator authorizes one shared `canva-global` Connector connection from workspace Connector settings. Other members use that shared identity and should contact an administrator if it is missing. This does not connect Canva China.
6. After authorization, ask for the live tool names. Use only names present in that schema.
7. Read-only smoke: when listed, call `search-designs` for designs the authorizing account can already open. Do not generate, edit, upload, or export.
8. Skill smoke: ask to describe the text on a design the tester links. If tools are unavailable, an administrator authorizes the shared Connector; other members contact an administrator.
9. Without credentials, or without an explicit user request and host approval, do not verify `generate-design`, editing transactions, uploads, or exports.

## Verification

Checked on 2026-10-10. `corepack pnpm test` in `agent-plugins` covers the manifest, Connector declaration, and ZIP allowlist. Live Canva consent was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"` passed with `XPERT_PLATFORM_ROOT` set to the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts` (Node v22.14.0, pnpm 10.24.0). This package's result was `PASS canva: distributed ZIP, production parser, digest, Skills and MCP binding`. `canva-cn` is unchanged.
