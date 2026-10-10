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
- Minimum OAuth scope: TBD. Advertised scopes on 2026-10-10 are `canvases:read`, `canvases:write`, `channels:history`, `channels:read`, `channels:write`, `chat:write`, `emoji:read`, `files:read`, `files:write`, `groups:history`, `groups:read`, `groups:write`, `im:history`, `im:read`, `im:write`, `lists:read`, `lists:write`, `mpim:history`, `mpim:read`, `mpim:write`, `reactions:read`, `reactions:write`, `search:read.files`, `search:read.im`, `search:read.mpim`, `search:read.private`, `search:read.public`, `search:read.users`, `users:read`, and `users:read.email`. The metadata document does not name a smaller required set. Do not request every advertised scope by default.
- Write tools require an explicit user request and host approval.

The redirect URI must be the Xpert Connector callback. This package does not invent that URI. SSE is not used.

## Skill

`slack-workspace` distinguishes the two upload tools named in Slack's own MCP docs from additional names that appear in third-party catalogs of the same server. Live schemas win. An authenticated tool list was not available while writing this package.

## 可用性测试说明

没有自有 Slack 应用的 client id、client secret 和用户授权时，不能对真实工作区做工具调用。不要把这些值写进仓库。

1. 打包：`corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins slack`
2. 发布 ZIP，或用已配置的平台参数执行
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" slack`
3. 管理员创建允许调用官方 MCP 的内部应用或已上架应用，把 client id 和 client secret 填进 Connector 表单。回调地址以表单展示的为准。scope 取工作区实际需要的最小集合。
4. 用户在插件详情连接 Slack，并完成授权。
5. 授权后先让代理列出当前启用的工具名。只把实时 schema 里存在的工具当作可用。
6. 只读冒烟（用测试者自己有权阅读的频道）：
   - 若 schema 含搜索或读频道工具，请求「搜索或阅读 `<频道>` 里最近的消息，不要发送消息」。
   - 期望返回消息内容或链接，且没有调用发送、表情回应、画布修改或文件上传。
7. 技能冒烟：请求「总结我有权访问的某个频道今天的讨论」。确认它在工具不可用时停下来要求连接，而不是在对话里索要 token。
8. 没有凭证或没有明确写请求时不能验证：发消息、上传（`slack_get_file_upload_url` 与 `slack_complete_file_upload`）、画布编辑，以及第三方目录里那些尚未用已登录 `tools/list` 确认的工具名。
