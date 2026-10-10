# @xpert-ai/plugin-tongyi

## 0.1.1

### Patch Changes

- d0da879: Add qwen3-asr-flash speech transcription using bounded inline Base64 audio or HTTPS file input with the existing Tongyi credentials. Validate inputs, honor cancellation and request deadlines, and preserve provider-reported usage without fetching audio URLs in the adapter. This returns completed transcript text without speaker identification or word timestamps.

## 0.1.0

### Minor Changes

- 73614f9: Add Qwen Omni Realtime and the separate Volcengine Speech realtime provider. The adapters normalize audio, transcripts, interruption, function calls and available provider usage for Bosi. Requires the new realtime contracts and plugin SDK (planned 3.20.0); release the host packages before these plugin versions. Speech credentials are separate from Ark credentials.

### Patch Changes

- 65b0c7d: Send reasoning_effort none when qwen3.8-max thinking is disabled so DashScope accepts the request.
