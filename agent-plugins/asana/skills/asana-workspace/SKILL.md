---
name: asana-workspace
description: Search and work with tasks, projects, and portfolios available to the Asana account on the workspace's shared Connector.
---

# Asana

Use the Asana MCP tools enabled in this conversation and their live input schemas. This package calls `https://mcp.asana.com/v2/mcp`. Tool calls run as the account on the workspace's shared Connector. Installing the package does not grant access beyond that account.

If Asana tools are unavailable, a workspace administrator authorizes the shared Connector in workspace Connector settings. Other members use that shared identity and should contact an administrator. Never request tokens or passwords in chat.

Asana's V2 tools reference, checked on 2026-10-10, says to treat `tools/list` as the source of schemas. Documented read tools include `get_me`, `get_user`, `search_objects`, `get_my_tasks`, `get_tasks`, `get_task`, `search_tasks`, `get_projects`, `get_project`, and `get_status_overview`. Call one only when the live schema lists it. `search_tasks` is documented as Premium-only.

`create_task_preview` and `create_project_preview` are documented as interactive tools for some clients. If the live schema does not list them, use the standard write tool only after an explicit user request and host approval.

Create, update, delete, comment, and status-update tools, including `create_tasks`, `create_project`, `update_tasks`, `delete_task`, `add_comment`, and `create_project_status_update`, require an explicit user request and host approval. Search or read before proposing a change. Include task or project links when a tool returns them. Report provider errors honestly, and do not claim success without a successful tool result.
