---
name: figma-workspace
description: Read authorized Figma files and apply only the design changes the user requested.
---

# Figma

Use the Figma MCP tools enabled in this conversation and their live input schemas. This skill is original. It does not include Figma's hosted skill text, plugin API definitions, or design-system files.

If Figma tools are unavailable, ask the user to connect Figma from the plugin details. Never request tokens or passwords in chat.

Start with `whoami` when you need to confirm the connected account. For a file or node the user named, read with the live tools that match the task. Documented read tools include `get_metadata`, `get_design_context`, `get_screenshot`, `get_variable_defs`, `get_figjam`, `search_design_system`, `get_libraries`, `get_motion_context`, and `download_assets`. Use a tool only if the live schema lists it.

Write tools such as `use_figma`, `create_new_file`, `generate_diagram`, `generate_figma_design`, and `upload_assets` run only when the user asked for that change. Figma documents that write workflows work best with skills the server hosts itself. If the connected server exposes a skill-loading tool, load that server-hosted skill for the write. Do not recreate those skill files in this package.

Include file or node links in the result. Report provider errors honestly, and do not claim a write succeeded without a successful tool result.
