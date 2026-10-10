---
name: google-slides
description: Read and update Google Slides presentations the connected account can access.
---

# Google Slides

Use the `google-slides` MCP server and its live input schemas. Find the presentation with the Drive tools in `google-drive` when you do not already have its id.

If Slides tools are unavailable, ask the user to connect Google Slides from the plugin details. Never request tokens or passwords in chat.

Documented tools, confirmed by an unauthenticated `tools/list` on 2026-10-10:

- Read: `read_presentation`, `read_slide_page`, `read_slide_page_thumbnail`
- Writes the user must request first: `update_presentation`

Read the presentation before editing. `update_presentation` carries batch-update request types inside one tool. Do not treat those request names as separate tools. This does not replace the local `presentations` package.
