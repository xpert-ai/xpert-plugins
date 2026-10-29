---
"@xpert-ai/plugin-openai-compatible": patch
---

Prevent SDK and saved sampling parameters from leaking into Responses requests.
Use the configured provider output limit, capped by context capacity, as the default
for both Responses and Chat Completions while preserving explicit Assistant limits.
