---
"@xpert-ai/plugin-hunyuan": patch
---

Add Tencent Hunyuan model plugin and switch to OpenAI-compatible endpoint integration.

- add `hunyuan` provider and predefined LLM model catalog
- support OpenAI-compatible credentials (`api_key`, `endpoint_url`, `endpoint_model_name`)
- use OpenAI-compatible chat model runtime for request and credential validation
