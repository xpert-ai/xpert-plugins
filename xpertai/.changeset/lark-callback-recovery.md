---
'@xpert-ai/plugin-lark': patch
---

Serialize callback progress across replicas with fenced Redis leases and retryable managed jobs. Recover missing stream sequences from the final message snapshot, preserve errors and approvals, and resume stale follow-ups with a stable dispatch ID even when message history is disabled.
