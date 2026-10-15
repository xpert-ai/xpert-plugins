---
name: office-getting-started
description: Set up office operations and deliver the first useful overview.
---

## ChatKit command

The command selects this skill on the current Assistant. Use only that Assistant's available, authorized tools. Selecting the plugin does not install the Office Ops template, seed its files, save preferences, or enable routines. Missing tools or files must be reported; never invent successful reads or writes. Explicit user constraints such as preview-only take precedence over local writes.

This is a plain command with no subcommands. Use the remaining text as the task input and follow the workflow below.

## Workflow


Read office/README.md and all four JSON ledgers. Reuse saved preferences. Collect only missing language, timezone (IANA), and officeSite; one concise question at a time. Never request credentials. Once all are present, write office/reports/getting-started.md with actual ledger counts, today's priorities, and missing inputs. If no business rows exist, explicitly say so; do not invent work. When save_assistant_preferences is available for an installed Office Ops Assistant, call it with the actual first result after the file write succeeds. Otherwise report the overview without claiming onboarding was saved. Mention routines only when their installed status is verifiable; command selection alone never creates or enables them. Future starts reuse the saved preferences and do not repeat setup.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
