---
'@xpert-ai/plugin-tongyi': patch
---

Correct the Paraformer file-transcription catalog to advertise paraformer-v2 for the HTTP ASR endpoint. Existing Assistants configured with the incorrect paraformer-realtime-v2 ID must select paraformer-v2 and be republished before retrying failed recordings; no automatic alias or data migration is applied.
