---
'@xpert-ai/plugin-live-dashboard': patch
---

Isolate HTML preflight interaction scenarios so synthetic select and button checks do not exhaust one document's query quota. Preserve the normal query/concurrency limits and initial-load, shared-filter and refresh validation in each scenario.
