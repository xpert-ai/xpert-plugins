---
name: atlassian-workspace
description: Search and work with Jira, Confluence, and other Atlassian cloud products the workspace's shared Connector account can access.
---

# Atlassian

Use the Atlassian MCP tools enabled in this conversation and their live input schemas. This package calls `https://mcp.atlassian.com/v2/mcp`. Tool calls run as the account on the workspace's shared Connector. Installing the package does not grant access beyond that account.

If Atlassian tools are unavailable, a workspace administrator authorizes the shared Connector in workspace Connector settings. Other members use that shared identity and should contact an administrator. Never request tokens, API tokens, or passwords in chat.

Atlassian's supported-tools guide, checked on 2026-10-10, advertises these primary tools directly: `atlassianUserInfo`, `getAccessibleAtlassianResources`, `discover`, `executeRead`, `executeWrite`, and `executeDestructive`. `getContentFormatGuide` is also documented. Call a tool only when the live schema lists it.

When `getAccessibleAtlassianResources` is present, call it before product tools that need a `cloudId`. When `discover` is present, use it to find a deferred operation, then use the matching execute tool. `executeWrite` and `executeDestructive` require an explicit user request and host approval.

Older documented names such as `getJiraIssue`, `createJiraIssue`, `searchJiraIssuesUsingJql`, and `getConfluencePage` are candidates only when the live schema still lists them. Do not invent a substitute name.

Search or read before proposing a change. Include issue or page links when a tool returns them. Report provider errors honestly, and do not claim success without a successful tool result.
