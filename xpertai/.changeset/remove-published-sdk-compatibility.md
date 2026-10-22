---
"@xpert-ai/plugin-canvas": patch
"@xpert-ai/plugin-cut": patch
"@xpert-ai/plugin-meetings": patch
"@xpert-ai/plugin-notion-connector": patch
"@xpert-ai/plugin-xmla": patch
---

Replace local SDK compatibility types and casts in Meetings, Notion Connector, XMLA, Cut and Canvas with published SDK / Contracts 3.26.2 contracts. Raise only these plugins' host requirements and pin their development SDK for reproducible validation.
