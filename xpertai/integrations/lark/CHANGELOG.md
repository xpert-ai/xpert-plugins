# @xpert-ai/plugin-lark

## 0.4.1

### Patch Changes

- 0da7ea0: Align Code Review and Lark with the versioned Event Inbox decision contracts. Keep transient Lark endpoint timeouts retryable while preserving permanent credential failures.
- ac07096: Build Code Review and Lark against the published Xpert Plugin SDK and Contracts 3.38.0 for Event Inbox decisions. Both plugins support hosts with SDK and Contracts versions matching `^3.37.0`.

## 0.4.0

### Minor Changes

- c20e086: Support per-repository Event Inbox migration and durable inbound Feishu messages and card actions.

## 0.3.7

### Patch Changes

- 6d40cd2: Attach captured Feishu conversation history as a text quote reference instead of prepending it to the human message body. Preserve the current user's original text, historical attachments and model context across normal messages, in-flight follow-ups and stale-target recovery.

## 0.3.6

### Patch Changes

- 2d1e33f: Fix release builds against published platform dependencies. Require SDK and contracts 3.30.0 for WeCom's usage-aware integration authorization and pin the development dependencies to that version. Remove Lark's unused legacy Analytics permission declaration, which is no longer part of the SDK permission contract.

## 0.3.5

### Patch Changes

- 6e3300a: Serialize callback progress across replicas with fenced Redis leases and retryable managed jobs. Recover missing stream sequences from the final message snapshot, preserve errors and approvals, and resume stale follow-ups with a stable dispatch ID even when message history is disabled.
