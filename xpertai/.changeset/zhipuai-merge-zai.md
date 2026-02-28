---
"@xpert-ai/plugin-zhipuai": patch
---

Merge ZAI Coding Plan capabilities into `@xpert-ai/plugin-zhipuai`.

- Add optional `endpoint_url` credential to switch API base endpoint.
- Update reasoning params (`thinking` enum, `clear_thinking`) and align model defaults.
- Simplify model catalogs to latest `glm-5`, `glm-4.7`, and `embedding-3`.
- Remove legacy standalone ZAI plugin package and obsolete Zhipu model definitions.
