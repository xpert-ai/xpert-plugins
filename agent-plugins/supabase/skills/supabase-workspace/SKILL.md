---
name: supabase-workspace
description: Inspect authorized Supabase projects through the official read-only remote MCP endpoint.
---

# Supabase (read-only)

Use the read-only endpoint to inspect the project explicitly named by the user. Start with project and schema metadata. Do not request a write endpoint, modify SQL, expose secrets, or read unrelated tables. Report the read-only limitation when a write is requested.

The host manages account authorization through Connector. Never request tokens in chat or files. If authorization is missing, direct the user to the plugin details connection action. Report provider errors honestly; do not claim a successful operation without a successful tool result.
