---
'@xpert-ai/plugin-meetings': patch
---

Run transcription and Assistant dispatch outside workspace storage locks while retaining short critical sections for scheduling and shared-state publication. Fence processing checkpoints and summary commits by task identity, task validity, and immutable input versions, returning explicit conflicts instead of allowing cancelled or outdated tasks to overwrite newer results. Recover orphaned processing claims with deduplicated expiry wakeups while preserving bounded retries for short contention and avoiding active-job deduplication for early wakeups.
