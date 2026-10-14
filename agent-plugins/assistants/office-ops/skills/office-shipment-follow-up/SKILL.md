---
name: office-shipment-follow-up
description: Draft follow-up messages for delayed shipments without sending them.
---

Read office/shipments.json. Select delayed/lost items and known-date overdue undelivered items; exclude delivered/returned. For each eligible supplied id, draft office/drafts/shipment-ID.md, quoting only actual tracking, carrier and expected-date fields. Identify missing recipient or tracking explicitly. Include a short request for an update, neutral tone and draft status. Do not send mail, post messages, place orders or approve spend. External sending requires a user request and the runtime approval dialog. Do not treat generating a draft as a completed delivery.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
