---
name: canva-workspace
description: Search and work with designs in the global Canva account on the workspace's shared Connector.
---

# Canva

Use the global Canva MCP tools enabled in this conversation and their live input schemas. This package calls `https://mcp.canva.com/mcp`. Its Connector and MCP server key is `canva-global`. Tool calls run as the account on the workspace's shared Connector. It does not call Canva China, it does not replace the `canva-cn` package, and it does not use the Canva China Connector provider `canva`.

If Canva tools are unavailable, a workspace administrator authorizes the shared `canva-global` Connector in workspace Connector settings. Other members use that shared identity and should contact an administrator. Never request tokens or passwords in chat. Do not send the member to connect Canva China.

Canva's MCP docs, checked on 2026-10-10, name read tools `search-designs`, `get-design`, `get-design-content`, `get-design-pages`, `get-presenter-notes`, and `get-export-formats`. Call a tool only when the live schema lists it.

`generate-design`, `create-design-from-candidate`, `create-design`, `start-editing-transaction`, `perform-editing-operations`, `commit-editing-transaction`, `upload-asset-from-url`, and `export-design` require an explicit user request and host approval. Search or read before proposing a change. Include the design link when a tool returns it. Report provider errors honestly, and do not claim a write succeeded without a successful tool result.
