---
"@xpert-ai/plugin-live-dashboard": patch
"@xpert-ai/plugin-analytics-data-xpert": patch
"@xpert-ai/plugin-analytics-files": patch
"@xpert-ai/plugin-analytics-mcp": patch
"@xpert-ai/plugin-analytics-mysql": patch
"@xpert-ai/plugin-analytics-postgres": patch
"@xpert-ai/plugin-analytics-rest": patch
"@xpert-ai/plugin-analytics-workspace-script": patch
---

Enable public npm distribution for Live Dashboard and the analytics providers with repository metadata for trusted publishing. Require published SDK/contracts 3.25.0 and pin development dependencies to that version so clean builds resolve the runtime capabilities used by the plugins, including the MCP client API. Move the packages into the xpertai workspace and consume the published Data Analytics renderer without cross-workspace links.
