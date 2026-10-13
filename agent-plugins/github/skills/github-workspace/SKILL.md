---
name: github-workspace
description: Search and work with repositories, issues, and pull requests the connected GitHub account can access.
---

# GitHub

Use GitHub's official remote MCP tools and their live input schemas. Installing this plugin does not grant access to repositories the connected account cannot see.

If GitHub tools are unavailable, ask the user to connect GitHub from the plugin details. Never request tokens, passwords, or personal access tokens in chat.

Read before changing anything. Prefer these documented remote-server tools when the live schema still lists them:

- Identity: `get_me`
- Repositories and code: `search_repositories`, `search_code`, `get_file_contents`, `get_commit`, `list_commits`, `list_branches`
- Issues: `search_issues`, `list_issues`, `issue_read`, `issue_write`
- Pull requests: `search_pull_requests`, `list_pull_requests`, `pull_request_read`, `create_pull_request`

The remote server can enable additional toolsets. If a name above is absent, use the live schema. Do not invent a substitute name.

Create or update issues, pull requests, files, or comments only after an explicit user request and host approval. Include repository and item links in the result. Report provider errors honestly, and do not claim success without a successful tool result.
