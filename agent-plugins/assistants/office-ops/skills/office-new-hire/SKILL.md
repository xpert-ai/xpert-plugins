---
name: office-new-hire
description: Prepare and maintain a new-hire setup checklist without placing orders.
---

## ChatKit command

The command selects this skill on the current Assistant. Use only that Assistant's available, authorized tools. Selecting the plugin does not install the Office Ops template, seed its files, save preferences, or enable routines. Missing tools or files must be reported; never invent successful reads or writes. Explicit user constraints such as preview-only take precedence over local writes.

Treat the leading slash argument after the skill chip as the operation, not as a global ChatKit command. Remaining text contains its input:

- `/checklist`: prepare the checklist for the supplied new-hire record and write its local checklist. Create a missing ledger from supplied records only; preserve existing hires and completed steps.
- `/update`: find the supplied hire id and update only the specified checklist steps with supporting evidence. Ask for missing or unknown ids/steps rather than creating an unrelated hire.

With no slash argument, keep the natural-language workflow below. Unknown slash arguments require clarification.

## Workflow


Read office/new-hires.json. Schema: {schemaVersion:1,items:[{id,name,startDate,location,owner?,checklist:[{key,label,status}]}]}. Use supplied ids and YYYY-MM-DD dates. Create a draft checklist for workspace, equipment request, access request and welcome introduction, status todo/in_progress/done. Do not claim access is provisioned or equipment purchased. Only mark done when user evidence supports it. Preserve completed steps during reruns. Write office/checklists/ID.md with outstanding requests, owners or unassigned, and start date. Do not order/pay/delete accounts; external actions use office-sync and approval.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
