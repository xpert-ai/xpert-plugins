---
'@xpert-ai/plugin-wecom': patch
'@xpert-ai/plugin-lark': patch
---

Fix release builds against published platform dependencies. Require SDK and contracts 3.30.0 for WeCom's usage-aware integration authorization and pin the development dependencies to that version. Remove Lark's unused legacy Analytics permission declaration, which is no longer part of the SDK permission contract.
