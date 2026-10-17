---
name: office-sync
description: Prepare and run scoped, approved external synchronization using available connectors.
---

## ChatKit command

The command selects this skill on the current Assistant. Use only that Assistant's available, authorized tools. Selecting the plugin does not install the Office Ops template, seed its files, save preferences, or enable routines. Missing tools or files must be reported; never invent successful reads or writes. Explicit user constraints such as preview-only take precedence over local writes.

Treat the leading slash argument after the skill chip as the operation, not as a global ChatKit command. Remaining text contains its input:

- `/plan`: prepare the scoped synchronization plan only. Do not call external write tools, request approval to execute, or create success receipts. Identify missing authorization/configuration and mark the plan NOT SYNCED.
- `/status`: read existing receipts for the requested records/destination/operation and report actual outcomes only. Do not write files, retry operations or contact external services. A missing receipt means no verified synchronization result.
- With no subcommand, follow the requested synchronization workflow below; a request to prepare a plan is never permission to execute it.

With no slash argument, keep the natural-language workflow below. Unknown slash arguments require clarification.

## Workflow


Read the relevant local ledger and office/sync-receipts.json. Synchronize only the user's requested records and destination. Use only tools actually available and an authorized connection selected through platform settings. If unavailable/expired, produce office/drafts/sync-plan.md with record ids, destination, required fields and the unmet connection; clearly mark NOT SYNCED. Never request or store tokens. Before an external write, read destination state when supported, display the exact operation/record/destination and invoke the write tool so platform approval is enforced. Rejecting approval must leave the destination and receipt ledger unchanged. Use a stable operation id based on destination + record id + intended revision; do not retry an ambiguous timeout blindly. Reconcile destination or report unknown outcome. Record a successful external receipt {operationId,recordId,destination,externalId,status:'succeeded'} only after tool success. Rerunning an already successful operation must not repeat the write. Never disguise a local draft or simulated provider as a real supplier synchronization.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
