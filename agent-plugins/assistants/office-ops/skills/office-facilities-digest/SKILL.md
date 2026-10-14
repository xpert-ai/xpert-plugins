---
name: office-facilities-digest
description: Record facilities issues and produce an evidence-based digest.
---

Read office/facilities.json. Schema: {schemaVersion:1,items:[{id,location,issue,severity,status,owner?,reportedDate?,source?}]}. severity: urgent,needs_vendor,routine; status: open,in_progress,resolved. Upsert by supplied id; preserve unrelated issues. Keep unresolved urgent items first, then vendor needs, then routine. Unknown owner remains unassigned. Write a dated office/reports/facilities-YYYY-MM-DD.md containing source ids, status, owner and next step, with a distinct missing-data section. Creating a digest does not file a ticket or notify a vendor; use office-sync only after the user requests external action.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
