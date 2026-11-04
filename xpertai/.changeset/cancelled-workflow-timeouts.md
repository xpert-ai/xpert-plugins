---
"@xpert-ai/plugin-code-review": patch
---

Diagnose GitHub job timeouts reported as cancelled only when run-bound timeout evidence confirms the cause. Preserve ordinary cancellation skips, require Checks read access for timeout evidence, and retry unavailable evidence without consuming Assistant quota.
