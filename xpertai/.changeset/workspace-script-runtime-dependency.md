---
'@xpert-ai/plugin-analytics-workspace-script': patch
---

Preserve typed Sandbox Runtime dependency failures so the host Analytics boundary can explain missing bindings and temporary runtime failures without misdiagnosing them as script errors. Requires the host Analytics dependency-error mapping for the improved public diagnostic.

Classify a nonzero script interpreter exit as `EXPORT_INPUT_INVALID`, preserving that typed error for safe host diagnostics instead of reporting an unavailable runtime.
