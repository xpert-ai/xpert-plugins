---
name: monday-workspace
description: Search and work with boards, items, and docs available to the monday.com account on the workspace's shared Connector.
---

# monday.com

Use the monday.com MCP tools enabled in this conversation and their live input schemas. This package calls `https://mcp.monday.com/mcp`. Tool calls run as the account on the workspace's shared Connector. Installing the package does not grant access beyond that account.

If monday.com tools are unavailable, a workspace administrator authorizes the shared Connector in workspace Connector settings. Other members use that shared identity and should contact an administrator. Never request tokens, personal API tokens, or passwords in chat.

monday.com's Platform MCP tools page, checked on 2026-10-10, documents more than 60 tools and says `tools/list` is the current schema. Documented read tools include `get_user_context`, `search`, `list_workspaces`, `workspace_info`, `get_board_info`, `get_board_items_page`, `read_docs`, and `get_updates`. Call a tool only when the live schema lists it.

Treat a tool as read-only only when its live schema or a host annotation marks it read-only. Prefer that machine-readable annotation over the tool name. This package does not invent a write type. When no such annotation is present, treat the call as a write. That covers create, update, move, delete, upload finalization, automation changes, workflow publish, agent management, and any later mutating tool the catalog adds. A write requires an explicit user request and host approval. `all_monday_api` can run GraphQL mutations; a mutation is a write under the same rule.

Search or read before proposing a change. Include board or item links when a tool returns them. Report provider errors honestly, and do not claim success without a successful tool result.
