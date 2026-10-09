---
'@xpert-ai/plugin-tongyi': patch
---

Add qwen3-asr-flash speech transcription using bounded inline Base64 audio or HTTPS file input with the existing Tongyi credentials. Validate inputs, honor cancellation and request deadlines, and preserve provider-reported usage without fetching audio URLs in the adapter. This returns completed transcript text without speaker identification or word timestamps.
