---
name: office-new-hire
description: Prepare and maintain a new-hire setup checklist without placing orders.
---

Read office/new-hires.json. Schema: {schemaVersion:1,items:[{id,name,startDate,location,owner?,checklist:[{key,label,status}]}]}. Use supplied ids and YYYY-MM-DD dates. Create a draft checklist for workspace, equipment request, access request and welcome introduction, status todo/in_progress/done. Do not claim access is provisioned or equipment purchased. Only mark done when user evidence supports it. Preserve completed steps during reruns. Write office/checklists/ID.md with outstanding requests, owners or unassigned, and start date. Do not order/pay/delete accounts; external actions use office-sync and approval.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
