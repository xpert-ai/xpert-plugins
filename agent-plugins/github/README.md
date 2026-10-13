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
- OAuth `resource` has no trailing slash (`https://api.githubcopilot.com/mcp`). The MCP URL has a trailing slash (`https://api.githubcopilot.com/mcp/`). Do not reuse either string in the other field. A later read of the same metadata document on 2026-10-10 returned `resource` `https://api.githubcopilot.com/mcp/` (with the slash). Use the discovered `resource`, not a copy of the MCP URL.
- Authorization server: issuer `https://github.com/login/oauth`, authorize `https://github.com/login/oauth/authorize`, token `https://github.com/login/oauth/access_token`, PKCE `S256`. There is no `registration_endpoint`.
- Minimum OAuth scope: TBD. Advertised scopes are `repo`, `read:org`, `read:user`, `user:email`, `read:packages`, `write:packages`, `read:project`, `project`, `gist`, and `notifications`. The metadata document does not name a smaller required set. Do not request every advertised scope by default.

The redirect URI must be the Xpert Connector callback for this workspace. This package does not invent that URI. A personal access token environment variable is not the package auth model.

The remote server also offers a read-only URL suffix. This package uses the default endpoint. Write tools, including `issue_write` and `create_pull_request`, require an explicit user request and host approval.

## Skill

`github-workspace` names the documented default toolsets (`context`, `issues`, `pull_requests`, `repos`, `users`). Live schemas win if GitHub renames or hides a tool. Tool names were taken from the official server documentation, not from an authenticated `tools/list`.

## 可用性测试说明

没有 GitHub OAuth 客户端和用户授权时，只能检查包结构和打包。不要在仓库或对话里写入 client id、client secret 或 token。

1. 在 `agent-plugins` 目录打包并确认 ZIP 内没有密钥：
   `corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins github`
2. 把 ZIP 发布到测试工作区，或使用已配置的 `XPERT_PLATFORM_ROOT`、`XPERT_API_URL`、`XPERT_ORG_ID`、`XPERT_WORKSPACE_ID` 执行
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" github`
3. 管理员在 Connector 表单登记自己的 GitHub OAuth App 或 GitHub App。回调地址使用表单展示的地址。按最小权限选择 scope。本包不提供这些值。
4. 用一个普通用户打开插件详情，连接 GitHub，完成浏览器授权。安装本身不等于已授权。
5. 在已选择本插件的对话里做只读冒烟：
   - 「调用 `get_me`，告诉我当前 GitHub 登录用户。」
   - 「用 `github-workspace` 列出我有权限的一个仓库里的最近 issue。不要创建或修改任何内容。」
   - 期望出现成功的工具结果，并带有用户或 issue 链接。对话中不应索要 token。
6. 技能冒烟：用一句包含仓库名的请求，例如「总结 `<owner>/<repo>` 里仍打开的 pull request」。确认代理先读再回答，并且没有调用 `issue_write` 或 `create_pull_request`。
7. 没有凭证时不能验证：OAuth 同意、私有仓库读取、写工具，以及 host 是否接受 resource 末尾斜杠差异。写操作只有在测试者明确要求修改某个测试仓库时才做。
