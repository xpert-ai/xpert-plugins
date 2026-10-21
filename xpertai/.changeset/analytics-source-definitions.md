---
"@xpert-ai/plugin-analytics-files": patch
"@xpert-ai/plugin-analytics-rest": patch
"@xpert-ai/plugin-analytics-mcp": patch
"@xpert-ai/plugin-analytics-data-xpert": patch
"@xpert-ai/plugin-analytics-workspace-script": patch
"@xpert-ai/plugin-analytics-postgres": patch
"@xpert-ai/plugin-analytics-mysql": patch
"@xpert-ai/plugin-live-dashboard": patch
---

Use canonical Analytics sources: database connections, immutable Definitions and script Artifacts. Move the five native Providers out of DataSource Types, expose their configuration entries and update Live Dashboard authoring, rendering and sharing. Requires published platform Contracts/SDK 3.26.1 containing the canonical Analytics API; no historical Binding decoder or migration is included.

Generate Files/REST/MCP/data-xpert Definitions through the Live Dashboard Agent using authorized input discovery, actual-data validation and immutable registration receipts.

Fix dashboard viewer parsing of canonical Definition and Artifact source references so Agent-generated drafts can be opened, filtered and published.
