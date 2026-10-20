---
'@xpert-ai/plugin-db-studio': patch
---

Fix CSV/JSON downloads for shared Assistants by removing the unused workspace file upload. Preserve query access checks, result expiry and user-scoped export receipts without creating another copy of the query result.
