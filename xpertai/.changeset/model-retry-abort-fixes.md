---
"@xpert-ai/plugin-model-retry": patch
---

Respect runtime abort signals during backoff, avoid retrying cancellation-style errors, and default exhausted retries to rethrowing the last error.
