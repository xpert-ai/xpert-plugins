# @xpert-ai/plugin-volcengine

## 0.4.0

### Minor Changes

- 73614f9: Add Qwen Omni Realtime and the separate Volcengine Speech realtime provider. The adapters normalize audio, transcripts, interruption, function calls and available provider usage for Bosi. Requires the new realtime contracts and plugin SDK (planned 3.20.0); release the host packages before these plugin versions. Speech credentials are separate from Ark credentials.

### Patch Changes

- 9bfc5b4: Give every Seedream image-generation invocation unique, readable output filenames. Concurrent calls in one Project and retries with repeated tool-call IDs preserve each returned artifact instead of overwriting another generated image.
