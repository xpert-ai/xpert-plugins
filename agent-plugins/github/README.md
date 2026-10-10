# GitHub

Search and work with repositories, issues, and pull requests the connected GitHub account can access.

Official server: [github/github-mcp-server](https://github.com/github/github-mcp-server)

Remote endpoint: `https://api.githubcopilot.com/mcp/`

This is an independently authored Agent Plugins 1.0 package. It does not copy an OpenAI `.mcp.json`, `.app.json`, or embedded client secret. `plugin.json` declares workspace Connector OAuth for the `github` server. `mcp.json` keeps the official URL and uses portable `streamable-http`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize GitHub. Each user connects their own account from the plugin details.

## Connector setup

GitHub's authorization server does not advertise dynamic client registration. A workspace administrator must register a GitHub OAuth App or GitHub App and enter that client in the Connector configuration form. Do not put the client id or secret in this package.

Checked on 2026-10-10, without a user token:

- Unauthenticated `tools/list` returned 401. Protected-resource metadata is `https://api.githubcopilot.com/.well-known/oauth-protected-resource/mcp/`.
- The discovered `resource` is `https://api.githubcopilot.com/mcp` (no trailing slash). The MCP URL in `mcp.json` keeps the official trailing slash. The host must use the discovered resource rather than a hard-coded copy of the MCP URL.
- Authorization server: issuer `https://github.com/login/oauth`, authorize `https://github.com/login/oauth/authorize`, token `https://github.com/login/oauth/access_token`, PKCE `S256`. There is no `registration_endpoint`.
- Advertised scopes include `repo`, `read:org`, `read:user`, `user:email`, `read:packages`, `write:packages`, `read:project`, `project`, `gist`, and `notifications`. Choose the smallest set the workspace needs. `repo` is broad.

The redirect URI must be the Xpert Connector callback for this workspace. This package does not invent that URI. A personal access token environment variable is not the package auth model.

The remote server also offers a read-only URL suffix. This package uses the default endpoint and relies on tool approval plus the user's instruction before writes.

## Skill

`github-workspace` names the documented default toolsets (`context`, `issues`, `pull_requests`, `repos`, `users`). Live schemas win if GitHub renames or hides a tool. Tool names were taken from the official server documentation, not from an authenticated `tools/list`.
