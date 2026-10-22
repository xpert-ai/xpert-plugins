---
"@xpert-ai/plugin-live-dashboard": patch
"@xpert-ai/plugin-analytics-files": patch
"@xpert-ai/plugin-analytics-rest": patch
"@xpert-ai/plugin-analytics-mcp": patch
"@xpert-ai/plugin-analytics-data-xpert": patch
"@xpert-ai/plugin-analytics-workspace-script": patch
"@xpert-ai/plugin-analytics-postgres": patch
"@xpert-ai/plugin-analytics-mysql": patch
"@xpert-ai/plugin-code-review": patch
"@xpert-ai/plugin-github-connector": patch
---

Require published SDK and Contracts 3.26.1 and pin development builds to the same release. Use the canonical Analytics, integration permission, Connector scope and connection command contracts instead of local SDK type extensions or platform dependency overlays. Preserve authorization checks for optional host capabilities and existing configuration migration behavior.
