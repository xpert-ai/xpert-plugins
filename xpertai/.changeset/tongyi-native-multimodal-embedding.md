---
'@xpert-ai/plugin-tongyi': patch
---

Fix multimodal-embedding-v1 knowledgebase embedding and credential validation by using the native DashScope endpoint instead of OpenAI compatibility mode. Preserve custom API hosts, validate and reorder vectors by input index, bound request batches, and correct the model's text context limit to 512 tokens.
