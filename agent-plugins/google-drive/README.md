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
- Advertised scopes are broad. Drive advertises `drive`, `drive.readonly`, and `drive.file`. Docs adds `documents` and `documents.readonly`. Sheets adds `spreadsheets` and `spreadsheets.readonly`. Slides adds `presentations`, `presentations.readonly`, and `drive.file`. Product setup guides recommend the narrower sets (readonly plus the file-level scope, and the product scopes for Docs, Sheets, or Slides). Prefer those narrower scopes in the Connector form. This package cannot pin scopes inside `mcp.json`.

Installing the package does not authorize Google. Each user connects the account from the plugin details.
