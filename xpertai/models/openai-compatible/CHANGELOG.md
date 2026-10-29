# @xpert-ai/plugin-openai-compatible

## 0.0.9

### Patch Changes

- 6d28b81: Prevent SDK and saved sampling parameters from leaking into Responses requests.
  Use the configured provider output limit, capped by context capacity, as the default
  for both Responses and Chat Completions while preserving explicit Assistant limits.
