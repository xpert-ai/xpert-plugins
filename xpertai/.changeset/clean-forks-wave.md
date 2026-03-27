---
"@xpert-ai/plugin-openai-compatible": patch
---

Fix runtime thinking toggle propagation for OpenAI-compatible models.

- allow `copilotModel.options.enable_thinking` to override credential defaults at runtime
- normalize thinking toggle values (`true/false`, `'true'/'false'`, `1/0`)
- keep request payload compatibility for endpoints expecting `enable_thinking` and `chat_template_kwargs.enable_thinking`
- update unit tests for thinking toggle true/false override behavior
