# @xpert-ai/plugin-lark

## 0.3.6

### Patch Changes

- 2d1e33f: Fix release builds against published platform dependencies. Require SDK and contracts 3.30.0 for WeCom's usage-aware integration authorization and pin the development dependencies to that version. Remove Lark's unused legacy Analytics permission declaration, which is no longer part of the SDK permission contract.

## 0.3.5

### Patch Changes

- 6e3300a: Serialize callback progress across replicas with fenced Redis leases and retryable managed jobs. Recover missing stream sequences from the final message snapshot, preserve errors and approvals, and resume stale follow-ups with a stable dispatch ID even when message history is disabled.
