# Figma

Read authorized Figma files through the official remote MCP server, and apply only changes the user requested.

Official endpoint: `https://mcp.figma.com/mcp`

Product docs: [Figma MCP server](https://developers.figma.com/docs/figma-mcp-server/)

Developer terms: [Figma Developer Terms](https://www.figma.com/legal/developer-terms/) (effective 2026-05-05). The MCP server is described as Beta.

This package is independently authored. It does not copy Figma skill text, scripts, plugin API definitions, agents, commands, hooks, or brand files from `openai/plugins`. Those upstream files are governed by the Figma Developer Terms and are not redistributed here. The icon is the public favicon URL `https://static.figma.com/app/icon/1/favicon.png`, not a copied package asset.

`plugin.json` declares workspace Connector OAuth for the `figma` server. `mcp.json` uses portable `streamable-http` and does not embed `oauth_resource`. See [upstream notes](../docs/UPSTREAM.md).

Installing the package does not authorize Figma. Each user connects their own account from the plugin details.

## Internal label

Figma is internal only (Developer Terms section 7 and privacy). This package is not a public Marketplace release.

The Agent Plugins list shows `extensions.xpertai.interface.description` under the plugin name. That string starts with `Internal only`. The overview description uses the same string when a new publishing configuration has no saved description. No other agent-plugin manifest in this repository sets a `visibility` or marketplace internal flag, and the host extension projects only `displayName`, `description`, and `icon`.

Install-surface cases FG-00 and FG-01 pass only when that Internal label is visible in the catalog list. A Published status with no Internal label is a fail. Reconnect or reinstall to refresh a copy imported before this label. The shared smoke checklist stays on [PR 716](https://github.com/xpert-ai/xpert-plugins/pull/716).

## Connector setup

Checked on 2026-10-10, without a user token:

- Unauthenticated `tools/list` returned 401. Protected-resource metadata at both the origin and `/mcp` reports `resource` `https://mcp.figma.com/mcp`, which matches the endpoint. Minimum OAuth scope: `mcp:connect`. That is the only scope in `scopes_supported`.
- Authorization server: issuer `https://api.figma.com`, authorize `https://www.figma.com/oauth/mcp`, token `https://api.figma.com/v1/oauth/token`, registration `https://api.figma.com/v1/oauth/mcp/register`. PKCE `S256` is required, and `state` is required.
- Token endpoint auth methods are only `client_secret_basic` and `client_secret_post`. A dynamic registration that returns a confidential client still needs a client secret. The host's public-client PKCE flow may be unable to complete that exchange.
- Figma documents that only MCP Catalog clients can connect, and that new clients join a waitlist. Xpert may be rejected even when OAuth metadata is correct.

Do not invent a client id or secret. If the workspace is allowed to use a preregistered client, enter it in the Connector form.

## License and redistribution

Use of Figma's developer resources is governed by the Figma Developer Terms. This package does not vendor those resources. A public integration has additional privacy and security duties under those terms, including write-back that must not be blocked and deletion of developer resources when the integration ends. Publishing this package outside the organization needs a separate legal review of section 7. This README is not a grant of those rights.

## Skill

`figma-workspace` names public read and write tools from Figma's MCP documentation. Live schemas win. Write tools require an explicit user request and host approval. For writes, prefer a skill the server hosts rather than a copied local skill.

## 可用性测试说明

没有 Figma 允许的 OAuth 客户端和用户授权时，不能读取设计文件。不要编造 client id 或 client secret。

1. 打包：`corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins figma`
2. 发布 ZIP，或用已配置的平台参数执行
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" figma`
3. 管理员按 Connector 表单完成 Figma OAuth。若动态注册返回的是机密客户端，把 client secret 留在 Connector 配置里，不要写入本包。回调地址使用表单给出的地址。scope 使用发现到的 `mcp:connect`。
4. 用户在插件详情连接 Figma。若供应商以「不在 MCP Catalog」拒绝，记下原始错误并停止；这不是包内可以绕过的配置。
5. 授权成功后的只读冒烟：
   - 「调用 `whoami`，确认当前 Figma 用户。」
   - 粘贴一个测试者有权访问的文件链接，请求「用 `get_metadata` 读取这个文件的结构，不要修改设计」。
   - 期望工具结果包含用户或节点信息。不要调用 `use_figma`、`create_new_file`、`generate_diagram`、`generate_figma_design` 或 `upload_assets`。
6. 技能冒烟：请求「说明这个 Figma 链接里的页面结构」。确认代理使用实时 schema；如果服务器提供托管 skill 加载工具，写操作才加载它。本包不内置那些 skill 文件。
7. 没有凭证时不能验证：目录白名单、机密客户端换 token、私有文件读取，以及任何写回。写回测试还必须单独确认没有违反 Figma Developer Terms。
