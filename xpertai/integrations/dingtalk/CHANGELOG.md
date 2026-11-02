# @xpert-ai/plugin-dingtalk

## 0.0.12

### Patch Changes

- edf2d35: Serialize DingTalk reply callbacks across API processes with fenced Redis leases and retryable Managed Queue jobs. Recover missing stream deltas from the final message snapshot, retain completion receipts to suppress late duplicates, and report unrecoverable gaps instead of silently losing the reply.

## 0.0.11

### Patch Changes

- 07efa35: Declare DingTalk as an Assistant channel so clients discover its existing trigger and QR connection flow without a built-in provider catalog entry.
