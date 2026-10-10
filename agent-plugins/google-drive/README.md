# Google Drive

Read and update Google Drive, Docs, Sheets, and Slides the connected account can access.

This package is complementary to the local `documents`, `pdf`, `presentations`, and `spreadsheets` packages. Those packages create and edit local DOCX, PDF, PPTX, and XLSX files. This package talks to Google's remote MCP servers. It does not replace them.

Official endpoints:

| Server key | URL |
| --- | --- |
| `google-drive` | `https://drivemcp.googleapis.com/mcp/v1` |
| `google-docs` | `https://docsmcp.googleapis.com/mcp/v1` |
| `google-sheets` | `https://sheetsmcp.googleapis.com/mcp/v1` |
| `google-slides` | `https://slidesmcp.googleapis.com/mcp/v1` |

These servers are a Google Workspace Developer Preview. `plugin.json` declares one `mcp_oauth` Connector per server because each protected resource is different. `mcp.json` uses portable `streamable-http` and does not carry OAuth client secrets or scopes. See [upstream notes](../docs/UPSTREAM.md).

No upstream Codex skill, host script, or placeholder `client_id` / `client_secret` is copied.

## Connector setup

Google's token endpoint accepts `client_secret_post` and `client_secret_basic` only. It does not advertise dynamic client registration. A workspace administrator must:

1. Join the Workspace Developer Preview program if Google still requires it for these MCP APIs.
2. Create a Google Cloud project and enable the product MCP APIs (`drive.googleapis.com`, `drivemcp.googleapis.com`, `docsmcp.googleapis.com`, `sheetsmcp.googleapis.com`, `slidesmcp.googleapis.com`).
3. Create an OAuth web client and store its client id and client secret in the Connector form. The same client can be reused when the form allows it, but each resource still needs its own consent.
4. Set the redirect URI to the Xpert Connector callback. This package does not invent that URI.

Checked on 2026-10-10:

- Unauthenticated `tools/list` succeeded for all four endpoints. Skill tool names come from those responses.
- Protected-resource metadata for the `/mcp/v1` path lists authorization server `https://accounts.google.com/`. The Drive origin well-known path returned 404; use the path-specific document.
- Minimum OAuth scope: TBD for each server. The protected-resource documents advertise these scopes and do not name a smaller required set. Do not request full `drive` by default. This package cannot pin scopes inside `mcp.json`.
  - Drive: `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/drive.file`
  - Docs: `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/documents.readonly`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/documents`
  - Sheets: `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/spreadsheets.readonly`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/spreadsheets`
  - Slides: `https://www.googleapis.com/auth/drive.readonly`, `https://www.googleapis.com/auth/presentations.readonly`, `https://www.googleapis.com/auth/drive`, `https://www.googleapis.com/auth/drive.file`, `https://www.googleapis.com/auth/presentations`
- Write tools require an explicit user request and host approval. Drive writes include `create_file` and `copy_file`. Docs uses `update_doc`. Sheets uses `update_values`, `update_formulas`, `update_spreadsheet`, and `insert_dimension`. Slides uses `update_presentation`.

Installing the package does not authorize Google. Each user connects the account from the plugin details.

## 可用性测试说明

没有 Google Cloud OAuth Web 客户端、Workspace Developer Preview 资格和用户授权时，不能读取私人文件。未登录的 `tools/list` 已在 2026-10-10 成功，那只说明工具名可见，不等于授权后的读写可用。不要把 client id 或 client secret 写进仓库。

1. 打包：`corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins google-drive`
2. 发布 ZIP，或用已配置的平台参数执行
   `corepack pnpm quickstart --install --platform-root "$XPERT_PLATFORM_ROOT" --api-url "$XPERT_API_URL" --org-id "$XPERT_ORG_ID" --workspace-id "$XPERT_WORKSPACE_ID" google-drive`
3. 管理员启用相应 MCP API，创建 OAuth Web 客户端，并在四个 Connector（`google-drive`、`google-docs`、`google-sheets`、`google-slides`）里分别完成配置。回调地址使用表单展示的地址。优先选择只读和文件级 scope，不要默认勾选完整 `drive`，除非测试者明确需要。
4. 用户分别连接四个资源。一个客户端可以复用，但每个 resource 仍要单独同意。
5. 只读冒烟（使用测试者自己的文件）：
   - Drive：「调用 `search_files` 查找我指定的文件名，不要新建或复制文件。」
   - Docs：「对这个文档 id 调用 `read_doc`。」
   - Sheets：「对这个表格调用 `get_spreadsheet` 或 `get_values`。」
   - Slides：「对这个演示文稿调用 `read_presentation`。」
   - 期望各自返回文件内容或元数据，且没有调用 `create_file`、`copy_file`、`update_doc`、`update_values`、`update_spreadsheet`、`update_formulas`、`insert_dimension`、`update_presentation`。
6. 技能冒烟：请求「用 Google Drive 找到指定文档并摘要，不要修改」。确认它走远程 MCP，而不是改写本地 `documents`、`pdf`、`presentations` 或 `spreadsheets` 产物。
7. 没有凭证时不能验证：同意屏幕、四个资源的刷新、私人文件读取，以及全部写工具。本地文档包的测试不能代替本包。
