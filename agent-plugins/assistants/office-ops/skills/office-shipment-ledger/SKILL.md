---
name: office-shipment-ledger
description: Merge pasted shipments into a persistent ledger and report current status.
---

## ChatKit command

The command selects this skill on the current Assistant. Use only that Assistant's available, authorized tools. Selecting the plugin does not install the Office Ops template, seed its files, save preferences, or enable routines. Missing tools or files must be reported; never invent successful reads or writes. Explicit user constraints such as preview-only take precedence over local writes.

Treat the leading slash argument after the skill chip as the operation, not as a global ChatKit command. Remaining text contains its input:

- `/import`: merge only the supplied shipment records by id, then reread the ledger and report the result. If the ledger does not exist, create it only from supplied records; never reset an existing ledger.
- `/summary`: read and summarize the saved ledger without writing files. If records are explicitly pasted for a preview, summarize only those records and identify the result as a non-persisted preview. Report a missing ledger when neither saved nor supplied records exist.

With no slash argument, keep the natural-language workflow below. Unknown slash arguments require clarification.

## Workflow


Read office/shipments.json before every change. Schema: {schemaVersion:1,items:[{id,description,status,trackingNumber?,carrier?,expectedDate?,owner?,source?}]}. Allowed status: ordered,in_transit,out_for_delivery,delivered,delayed,lost,returned. Use the supplied id, otherwise ask for one; never invent tracking numbers or people. Upsert by id, preserving fields omitted from the new input and unrelated rows. Reject conflicting duplicate ids in the input and ask for clarification. Dates are YYYY-MM-DD in the user's timezone; unknown dates stay absent. Update existing JSON with sandbox_edit_file after reading; use sandbox_write_file only for a new path. Reread the actual ledger path to confirm exact ids/counts. Report counts by status and overdue items only when the date is known; record incomplete data. On a read-only summary request, do not rewrite the ledger. Do not claim a carrier was queried without an actual connector read.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
