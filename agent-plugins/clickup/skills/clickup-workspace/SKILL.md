---
name: clickup-workspace
description: Search and work with tasks, docs, and the workspace hierarchy available to the ClickUp account on the workspace's shared Connector.
---

# ClickUp

Use the ClickUp MCP tools enabled in this conversation and their live input schemas. This package calls `https://mcp.clickup.com/mcp`. Tool calls run as the account on the workspace's shared Connector. Installing the package does not grant access beyond that account.

If ClickUp tools are unavailable, a workspace administrator authorizes the shared Connector in workspace Connector settings. Other members use that shared identity and should contact an administrator. Never request tokens, API keys, or passwords in chat.

ClickUp's supported-tools page, checked on 2026-10-10, labels capabilities with display text such as "Search Workspace", "Get Task", "Get Document Pages", and "Create Task". That page does not publish stable machine tool names. Treat those labels as descriptions. Call only names present in the live schema, and do not invent an identifier from a label.

Search or read the task, doc, or List the user named before proposing a change. Creating, updating, deleting, commenting, sending chat, tracking time, and uploading files require an explicit user request and host approval.

Include task or document links when a tool returns them. Report provider errors honestly, and do not claim success without a successful tool result.
