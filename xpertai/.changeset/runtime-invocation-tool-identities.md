---
'@xpert-ai/plugin-agent-runtimes': patch
---

Expose invocationId consistently in launch, status and cancellation receipts while retaining the existing taskId alias. Clarify that task_status/task_cancel accept invocation identities, not Project task/execution IDs, and describe bounded waiting versus already registered Project result delivery without changing host waiting or cancellation behavior.
