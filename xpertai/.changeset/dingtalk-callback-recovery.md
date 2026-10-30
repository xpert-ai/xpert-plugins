---
'@xpert-ai/plugin-dingtalk': patch
---

Serialize DingTalk reply callbacks across API processes with fenced Redis leases and retryable Managed Queue jobs. Recover missing stream deltas from the final message snapshot, retain completion receipts to suppress late duplicates, and report unrecoverable gaps instead of silently losing the reply.
