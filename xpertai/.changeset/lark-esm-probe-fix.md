---
'@xpert-ai/plugin-lark': patch
---

Fix the Lark integration build and runtime compatibility with the current host and plugin-sdk release.

- restore the damaged integration strategy source text
- refresh the plugin workspace to consume @xpert-ai/plugin-sdk 3.8.4
- sync Nx project references required by the current build pipeline
- make the long connection probe ESM-safe so the websocket check no longer fails with require is not defined
