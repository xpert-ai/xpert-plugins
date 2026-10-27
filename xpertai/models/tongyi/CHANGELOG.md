# @xpert-ai/plugin-tongyi

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
