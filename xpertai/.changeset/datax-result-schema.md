---
'@xpert-ai/plugin-analytics-data-xpert': patch
---

Preserve declared DataXpert result-column metadata and discover binding output schemas through authorized read-only queries before dashboard preview. Keep exact decimal values and legacy authored bindings compatible with the existing SDK runtime.

Generate valid dataset IDs at the discovery boundary when callers omit the local key or supply a native cube reference, preserving valid authored IDs and the native query target.
