---
"@xpert-ai/plugin-openai-compatible": patch
---

Add a model-level option to disable prompt_cache_key forwarding for incompatible
native Responses upstreams, preserving normal forwarding by default and leaving
conversation history, reasoning and tool results unchanged.
