---
name: google-drive
description: Find and read Google Drive files the connected account can access, and change them only when the user asked.
---

# Google Drive

Use the `google-drive` MCP server and its live input schemas. This skill covers Drive files. Docs, Sheets, and Slides content edits belong to `google-docs`, `google-sheets`, and `google-slides`. Local `documents`, `pdf`, `presentations`, and `spreadsheets` packages stay available for files that are not in Drive.

If Drive tools are unavailable, ask the user to connect Google Drive from the plugin details. Never request tokens or passwords in chat.

Documented tools, confirmed by an unauthenticated `tools/list` on 2026-10-10:

- Read: `search_files`, `list_recent_files`, `get_file_metadata`, `get_file_permissions`, `read_file_content`, `download_file_content`
- Writes that require an explicit user request and host approval: `create_file`, `copy_file`

Search or list before claiming a file exists. Use returned file ids. Include links from the tool result. Report permission errors honestly.
