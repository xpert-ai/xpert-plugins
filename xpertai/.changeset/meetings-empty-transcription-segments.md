---
'@xpert-ai/plugin-meetings': patch
---

Continue meeting transcription when a fragment or contextual batch returns no text, while preserving configuration and provider errors. Keep audio when the whole recording has no transcript, and reprocess empty checkpoints on explicit retry.
