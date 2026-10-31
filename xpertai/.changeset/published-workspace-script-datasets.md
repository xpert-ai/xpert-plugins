---
'@xpert-ai/plugin-analytics-workspace-script': minor
---

Add an explicit preparation tool for immutable Analytics Definitions containing pinned script code and declared file snapshots. Prepared definitions remain private until their owner grants organization visibility in platform settings.

Execute published script datasets with the current viewer's permissions for every declared upstream source, rechecking access after execution and denying undeclared file access. Existing workspace-backed datasets remain owner-only; sharing never grants access to the author's workspace or database credentials.

Publishing and revoking the audience require the companion platform changes for xpert-ai/xpert#1280.
