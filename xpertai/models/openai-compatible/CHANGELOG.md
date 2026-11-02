# @xpert-ai/plugin-openai-compatible

## 0.0.10

### Patch Changes

- 4b5c814: Add a model-level option to disable prompt_cache_key forwarding for incompatible
  native Responses upstreams, preserving normal forwarding by default and leaving
  conversation history, reasoning and tool results unchanged.

## 0.0.9

### Patch Changes

- 6d28b81: Prevent SDK and saved sampling parameters from leaking into Responses requests.
  Use the configured provider output limit, capped by context capacity, as the default
  for both Responses and Chat Completions while preserving explicit Assistant limits.
