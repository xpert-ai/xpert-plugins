---
name: slack-workspace
description: Search and work in Slack channels, canvases, and files the connected user can access.
---

# Slack

Use the Slack MCP tools enabled in this conversation and their live input schemas. Installing this plugin does not grant access to channels or files the connected user cannot see.

If Slack tools are unavailable, ask the user to connect Slack from the plugin details. Never request tokens or passwords in chat.

Slack's public MCP documentation names file upload as two tools: `slack_get_file_upload_url` and `slack_complete_file_upload`. Use those names only when the live schema lists them, and only after the user asked to upload a file.

Other tool names are reported by third-party catalogs of the official server and were not confirmed with an authenticated `tools/list` on 2026-10-10. Treat them as candidates, not guarantees. If a name is missing, do not invent a substitute:

- Search and read: `slack_search_public`, `slack_search_public_and_private`, `slack_search_channels`, `slack_search_users`, `slack_read_channel`, `slack_read_thread`, `slack_read_file`, `slack_read_canvas`, `slack_read_user_profile`, `slack_list_channel_members`, `slack_search_emojis`, `slack_get_reactions`
- Writes the user must request first: `slack_send_message`, `slack_send_message_draft`, `slack_add_reaction`, `slack_create_canvas`, `slack_update_canvas`

Search before summarizing. Include channel or message links when the tool returns them. Send messages, reactions, canvas edits, and uploads only when the user asked. Report provider errors honestly.
