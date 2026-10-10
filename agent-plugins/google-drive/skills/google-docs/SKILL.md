---
name: google-docs
description: Read and update Google Docs the connected account can access.
---

# Google Docs

Use the `google-docs` MCP server and its live input schemas. Find the document with the Drive tools in `google-drive` when you do not already have its id.

If Docs tools are unavailable, ask the user to connect Google Docs from the plugin details. Never request tokens or passwords in chat.

Documented tools, confirmed by an unauthenticated `tools/list` on 2026-10-10:

- `read_doc`
- `update_doc`

Read the document before editing. Call `update_doc` only when the user asked for that change, and limit the edit to that request. This does not replace the local `documents` package.
