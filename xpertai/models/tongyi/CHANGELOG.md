# @xpert-ai/plugin-tongyi

## 0.2.4

### Patch Changes

- a66ebb6: Add 30 provider model entries, including MiniMax M3.1 Flash, Kimi K3.1 Pro, Step 5, StepAudio 3 and Qwen3 VL/ASR. Wire provider-specific reasoning, embedding and audio requests; mark eight retired SiliconFlow models deprecated while retaining their schemas. Verify catalog limits and pricing against provider sources.

## 0.2.3

### Patch Changes

- fc131b9: Require SDK and contracts 3.30.0 or newer for the shared embedding usage adapter, and pin development dependencies to that minimum so frozen release builds resolve the supported API.

## 0.2.2

### Patch Changes

- 769e003: Use the Plugin SDK's OpenAICompatibleEmbeddings adapter for authoritative text-embedding usage callbacks instead of a Tongyi-specific metering subclass. Keep native multimodal routing unchanged. Build and deploy with the SDK release introducing OpenAICompatibleEmbeddings; older installed SDKs do not export this adapter.

## 0.2.1

### Patch Changes

- 8d0f27e: Support validated structured output through automatic tool selection for MiniMax M3.1 Flash, MiMo V2.6 Pro Ultraspeed and Step 5 Preview. Keep Step 5 thinking off by default and mark retired Doubao Seed 2.0 Mini 260215 deprecated while retaining saved references.

## 0.2.0

### Minor Changes

- b39d857: Add the October Ark and DashScope models with verified context limits, reasoning controls, embedding dimensions and regional/cache prices. Apply Ark weekday peak tariffs at completion and DashScope daily peak/off-peak tariffs. Preserve reasoning history (including Ark encrypted content) across streamed and non-streamed tool continuations. Add Seedream 5.0 Flash to image tools and retain the old Seed Evolving catalog ID as deprecated.

## 0.1.3

### Patch Changes

- 7bb93e9: Correct the Paraformer file-transcription catalog to advertise paraformer-v2 for the HTTP ASR endpoint. Existing Assistants configured with the incorrect paraformer-realtime-v2 ID must select paraformer-v2 and be republished before retrying failed recordings; no automatic alias or data migration is applied.

## 0.1.2

### Patch Changes

- 9eaab60: Sync the Xiaomi MiMo and Tongyi catalogs with the 2026-10-14 Dify updates. MiMo adds the V2.6 family and marks V2.5 and v2-flash deprecated. Tongyi validates credentials with qwen3.8-flash, adds qwen-mt-flash, and marks retired DashScope models deprecated so saved configurations keep their schemas.

## 0.1.1

### Patch Changes

- d0da879: Add qwen3-asr-flash speech transcription using bounded inline Base64 audio or HTTPS file input with the existing Tongyi credentials. Validate inputs, honor cancellation and request deadlines, and preserve provider-reported usage without fetching audio URLs in the adapter. This returns completed transcript text without speaker identification or word timestamps.

## 0.1.0

### Minor Changes

- 73614f9: Add Qwen Omni Realtime and the separate Volcengine Speech realtime provider. The adapters normalize audio, transcripts, interruption, function calls and available provider usage for Bosi. Requires the new realtime contracts and plugin SDK (planned 3.20.0); release the host packages before these plugin versions. Speech credentials are separate from Ark credentials.

### Patch Changes

- 65b0c7d: Send reasoning_effort none when qwen3.8-max thinking is disabled so DashScope accepts the request.
