---
name: google-sheets
description: Read and update Google Sheets the connected account can access.
---

# Google Sheets

Use the `google-sheets` MCP server and its live input schemas. Find the spreadsheet with the Drive tools in `google-drive` when you do not already have its id.

If Sheets tools are unavailable, ask the user to connect Google Sheets from the plugin details. Never request tokens or passwords in chat.

Documented tools, confirmed by an unauthenticated `tools/list` on 2026-10-10:

- Read: `get_spreadsheet`, `get_values`
- Writes the user must request first: `update_values`, `update_formulas`, `update_spreadsheet`, `insert_dimension`

Read current values before writing. `update_spreadsheet` carries many batch-update request types inside one tool. Do not treat those request names as separate tools. This does not replace the local `spreadsheets` package.
