---
"@xpert-ai/plugin-milvus": patch
---

Await client readiness and load existing collections before deleting vectors so knowledge document reprocessing succeeds after collection release. Treat missing collections as already empty.
