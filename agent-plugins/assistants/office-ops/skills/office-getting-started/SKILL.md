---
name: office-getting-started
description: Set up office operations and deliver the first useful overview.
---

Read office/README.md and all four JSON ledgers. Reuse saved preferences. Collect only missing language, timezone (IANA), and officeSite; one concise question at a time. Never request credentials. Once all are present, write office/reports/getting-started.md with actual ledger counts, today's priorities, and missing inputs. If no business rows exist, explicitly say so; do not invent work. Call save_assistant_preferences with the actual first result after the file write succeeds. Mention the three routines are paused until explicitly enabled. Future starts reuse the saved preferences and do not repeat setup.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
