---
name: office-sync
description: Prepare and run scoped, approved external synchronization using available connectors.
---

Read the relevant local ledger and office/sync-receipts.json. Synchronize only the user's requested records and destination. Use only tools actually available and an authorized connection selected through platform settings. If unavailable/expired, produce office/drafts/sync-plan.md with record ids, destination, required fields and the unmet connection; clearly mark NOT SYNCED. Never request or store tokens. Before an external write, read destination state when supported, display the exact operation/record/destination and invoke the write tool so platform approval is enforced. Rejecting approval must leave the destination and receipt ledger unchanged. Use a stable operation id based on destination + record id + intended revision; do not retry an ambiguous timeout blindly. Reconcile destination or report unknown outcome. Record a successful external receipt {operationId,recordId,destination,externalId,status:'succeeded'} only after tool success. Rerunning an already successful operation must not repeat the write. Never disguise a local draft or simulated provider as a real supplier synchronization.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
