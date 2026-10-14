---
name: office-celebrations
description: Create a privacy-conscious rolling fourteen-day celebrations list.
---

Read office/celebrations.json. Schema: {schemaVersion:1,items:[{id,name,month,day,type,optOut}]}. Store only month/day, never birth year or age. type is birthday or work_anniversary. optOut true excludes all reminders and reports. Upsert by supplied id. Require a reference date when the current date is unclear; calculate the next fourteen calendar days in the saved timezone, including today through day 13, handling year boundaries. For February 29 in non-leap years, ask for the preferred observance instead of guessing. Write office/reports/celebrations-YYYY-MM-DD.md listing in-range opted-in events; do not message people or create calendar events.

For every existing output file, read and edit it with sandbox_edit_file. sandbox_write_file creates new paths only. Inspect tool payloads for errors, retry at most once with a corrected operation, then stop and report failure. Do not create alternate temporary or backup paths to work around an existing-file error.
