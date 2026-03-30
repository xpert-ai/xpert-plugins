---
'@xpert-ai/plugin-lark': patch
---

Improve Lark integration compatibility and conversation binding stability.

- align the plugin with the current host integration lifecycle and pagination contracts
- keep webhook and long-connection validation results compatible with the current host integration test UI
- ensure the conversation binding schema and key indexes exist at startup without requiring a migration
- relax legacy conversation binding uniqueness so scope-based routing no longer conflicts with historical bindings

