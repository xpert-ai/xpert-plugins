---
'@xpert-ai/plugin-lark': patch
---

Serialize stale-follow-up recovery decisions and preserve recovery ownership across failed preparation. Use the host's explicit enqueueOnce contract to avoid duplicate executions after a lost acknowledgement. Requires an updated host providing that method; older hosts reject recovery before modifying the response card. Add real host Bull/Redis multi-process regressions, including retries after job completion.
