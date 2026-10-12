---
"@xpert-ai/plugin-docx-editor": patch
---

Ship an atomic, repeatable PostgreSQL migration that converts legacy DOCX project and document references to UUID in place, preserving existing documents, versions, snapshots, operations, indexes, nullability, and foreign keys. Run the packaged migration before schema synchronization when upgrading an existing installation; invalid values or unsupported dependencies abort without changing data. Read runtime plugin level and artifact namespace from package.json.
