# Figma

Read authorized Figma files through the official remote MCP server, and apply only changes the user requested.

Official endpoint: `https://mcp.figma.com/mcp`

Product docs: [Figma MCP server](https://developers.figma.com/docs/figma-mcp-server/)

Developer terms: [Figma Developer Terms](https://www.figma.com/legal/developer-terms/) (effective 2026-05-05). The MCP server is described as Beta.

This package is independently authored. It does not copy Figma skill text, scripts, plugin API definitions, agents, commands, hooks, or brand files from `openai/plugins`. Those upstream files are governed by the Figma Developer Terms and are not redistributed here. The icon is the public favicon URL `https://static.figma.com/app/icon/1/favicon.png`, not a copied package asset.

`plugin.json` declares workspace Connector OAuth for the `figma` server. `mcp.json` uses portable `streamable-http` and does not embed `oauth_resource`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Figma. Each user connects their own account from the plugin details.

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `tools/list` returned 401. Protected-resource metadata at both the origin and `/mcp` reports `resource` `https://mcp.figma.com/mcp`, which matches the endpoint. The advertised scope is `mcp:connect`.
- Authorization server: issuer `https://api.figma.com`, authorize `https://www.figma.com/oauth/mcp`, token `https://api.figma.com/v1/oauth/token`, registration `https://api.figma.com/v1/oauth/mcp/register`. PKCE `S256` is required, and `state` is required.
- Token endpoint auth methods are only `client_secret_basic` and `client_secret_post`. A dynamic registration that returns a confidential client still needs a client secret. The host's public-client PKCE flow may be unable to complete that exchange.
- Figma documents that only MCP Catalog clients can connect, and that new clients join a waitlist. Xpert may be rejected even when OAuth metadata is correct.

Do not invent a client id or secret. If the workspace is allowed to use a preregistered client, enter it in the Connector form.

## License and redistribution

Use of Figma's developer resources is governed by the Figma Developer Terms. This package does not vendor those resources. A public integration has additional privacy and security duties under those terms, including write-back that must not be blocked and deletion of developer resources when the integration ends. Publishing this package outside the organization needs a separate legal review of section 7. This README is not a grant of those rights.

## Skill

`figma-workspace` names public read and write tools from Figma's MCP documentation. Live schemas win. For writes, prefer a skill the server hosts rather than a copied local skill.
