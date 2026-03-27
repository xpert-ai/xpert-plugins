---
"@xpert-ai/plugin-siliconflow": patch
---

Add SiliconFlow model plugin with updated model YAML catalog and improve thinking-stream handling.

- register SiliconFlow provider and model definitions from Dify package
- fix reasoning streaming flow so final answer content is preserved
- sanitize usage/response token metadata to avoid chunk merge type errors
- gate `enable_thinking` by model support and default `-thinking` models to thinking mode
