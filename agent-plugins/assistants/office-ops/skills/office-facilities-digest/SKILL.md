---
name: office-facilities-digest
description: Record facilities issues and produce an evidence-based digest.
---

## ChatKit command

The command selects this skill on the current Assistant. Use only that Assistant's available, authorized tools. Selecting the plugin does not install the Office Ops template, seed its files, save preferences, or enable routines. Missing tools or files must be reported; never invent successful reads or writes. Explicit user constraints such as preview-only take precedence over local writes.

Treat the leading slash argument after the skill chip as the operation, not as a global ChatKit command. Remaining text contains its input:

- `/record`: upsert the supplied issue records by id. Create a missing ledger only from the supplied records. Report the saved ids without preparing a digest or opening external tickets.
- `/digest`: read the ledger, produce the severity-ordered digest and write the report only; do not update issue status or owners. A missing ledger is missing input, not evidence that no issues exist.

With no slash argument, keep the natural-language workflow below. Unknown slash arguments require clarification.

## Workflow


Read office/facilities.json. Schema: {schemaVersion:1,items:[{id,location,issue,severity,status,owner?,reportedDate?,source?}]}. severity: urgent,needs_vendor,routine; status: open,in_progress,resolved. Upsert by supplied id; preserve unrelated issues. Keep unresolved urgent items first, then vendor needs, then routine. Unknown owner remains unassigned. Write a dated office/reports/facilities-YYYY-MM-DD.md containing source ids, status, owner and next step, with a distinct missing-data section. Creating a digest does not file a ticket or notify a vendor; use office-sync only after the user requests external action.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
