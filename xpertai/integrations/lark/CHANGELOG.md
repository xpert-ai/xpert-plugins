# @xpert-ai/plugin-lark

## 0.3.5

### Patch Changes

- 6e3300a: Serialize callback progress across replicas with fenced Redis leases and retryable managed jobs. Recover missing stream sequences from the final message snapshot, preserve errors and approvals, and resume stale follow-ups with a stable dispatch ID even when message history is disabled.
