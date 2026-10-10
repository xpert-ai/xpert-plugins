# Slack

Search and work in Slack channels the connected user can access.

Official endpoint: `https://mcp.slack.com/mcp`

This is an independently authored Agent Plugins 1.0 package. It does not copy Slack's OpenAI `.mcp.json`, `.app.json`, or the OpenAI-registered client id. `plugin.json` declares workspace Connector OAuth for the `slack` server. `mcp.json` uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Slack. Each user connects their own account from the plugin details.

## Connector setup

Slack's MCP authorization server does not advertise dynamic client registration, and its token endpoint accepts `client_secret_post` only. A workspace administrator must create a Slack app that is allowed to use the official MCP server (an internal app, or an app published to the Slack directory) and enter that app's client id and client secret in the Connector form. Do not commit those values.

Checked on 2026-10-10, without a user token:

- Unauthenticated `tools/list` returned 401 `missing_token`. Protected-resource metadata is `https://mcp.slack.com/.well-known/oauth-protected-resource`.
- The discovered `resource` is `https://mcp.slack.com`. The MCP URL is `https://mcp.slack.com/mcp`. The host must keep the discovered resource.
- Authorization server issuer is `https://mcp.slack.com`. Authorize: `https://slack.com/oauth/v2_user/authorize`. Token: `https://slack.com/api/oauth.v2.user.access`. PKCE `S256` is advertised. There is no `registration_endpoint` and no public-client `none` auth method.
- Advertised scopes include canvases, channels, chat write, emoji, files, groups, im, lists, mpim, reactions, search read, `users:read`, and `users:read.email`. Request the smallest set the workspace needs.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. SSE is not used.

## Skill

`slack-workspace` distinguishes the two upload tools named in Slack's own MCP docs from additional names that appear in third-party catalogs of the same server. Live schemas win. An authenticated tool list was not available while writing this package.
