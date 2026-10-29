---
"@xpert-ai/plugin-hana": patch
---

Allow read-only HANA queries on servers that reject native statement timeouts. Retry only the explicit unsupported-timeout error once, retaining the original client deadline, communication timeout, cancellation and read-only session protections.
