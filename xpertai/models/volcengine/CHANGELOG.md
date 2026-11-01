# @xpert-ai/plugin-volcengine

## 0.5.1

### Patch Changes

- 8d0f27e: Support validated structured output through automatic tool selection for MiniMax M3.1 Flash, MiMo V2.6 Pro Ultraspeed and Step 5 Preview. Keep Step 5 thinking off by default and mark retired Doubao Seed 2.0 Mini 260215 deprecated while retaining saved references.

## 0.5.0

### Minor Changes

- b39d857: Add the October Ark and DashScope models with verified context limits, reasoning controls, embedding dimensions and regional/cache prices. Apply Ark weekday peak tariffs at completion and DashScope daily peak/off-peak tariffs. Preserve reasoning history (including Ark encrypted content) across streamed and non-streamed tool continuations. Add Seedream 5.0 Flash to image tools and retain the old Seed Evolving catalog ID as deprecated.

## 0.4.1

### Patch Changes

- e8f7f8e: Replace the hardcoded Ark validation model with the host's user-selected model or endpoint test. Check API Key presence and endpoint format locally, and document that Ark model-list management APIs require AK/SK authentication. Upgrade the host to support provider credential validation before installing this plugin update.

## 0.4.0

### Minor Changes

- 73614f9: Add Qwen Omni Realtime and the separate Volcengine Speech realtime provider. The adapters normalize audio, transcripts, interruption, function calls and available provider usage for Bosi. Requires the new realtime contracts and plugin SDK (planned 3.20.0); release the host packages before these plugin versions. Speech credentials are separate from Ark credentials.

### Patch Changes

- 9bfc5b4: Give every Seedream image-generation invocation unique, readable output filenames. Concurrent calls in one Project and retries with repeated tool-call IDs preserve each returned artifact instead of overwriting another generated image.
