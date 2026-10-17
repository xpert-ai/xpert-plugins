---
name: office-celebrations
description: Create a privacy-conscious rolling fourteen-day celebrations list.
---

## ChatKit command

The command selects this skill on the current Assistant. Use only that Assistant's available, authorized tools. Selecting the plugin does not install the Office Ops template, seed its files, save preferences, or enable routines. Missing tools or files must be reported; never invent successful reads or writes. Explicit user constraints such as preview-only take precedence over local writes.

Treat the leading slash argument after the skill chip as the operation, not as a global ChatKit command. Remaining text contains its input:

- `/record`: upsert supplied celebrations by id; collect only month/day and the explicit opt-out preference. Create a missing ledger only from supplied records, and do not generate reminders.
- `/upcoming`: produce the fourteen-day report from saved opted-in records without changing the ledger. Accept an explicit reference date/timezone. Missing data and February 29 uncertainty must be reported.

With no slash argument, keep the natural-language workflow below. Unknown slash arguments require clarification.

## Workflow


Read office/celebrations.json. Schema: {schemaVersion:1,items:[{id,name,month,day,type,optOut}]}. Store only month/day, never birth year or age. type is birthday or work_anniversary. optOut true excludes all reminders and reports. Upsert by supplied id. Require a reference date when the current date is unclear; calculate the next fourteen calendar days in the saved timezone, including today through day 13, handling year boundaries. For February 29 in non-leap years, ask for the preferred observance instead of guessing. Write office/reports/celebrations-YYYY-MM-DD.md listing in-range opted-in events; do not message people or create calendar events.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
