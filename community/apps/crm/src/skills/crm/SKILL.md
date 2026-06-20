---
name: crm
description: Use the Xpert native CRM plugin to inspect CRM metadata, search records, create records, update records, and coordinate Workbench review.
---

# CRM Skill

Use this skill when the user asks to manage customer, contact, opportunity, task, or note information in the Xpert-native CRM plugin.

## Tool Use

- Call `crm_list_objects` before creating or updating records when you are unsure which fields exist.
- Call `crm_search_records` for customer, person, opportunity, task, and note lookup.
- Call `crm_get_record` before updating a record unless the user already supplied an exact record id and current fields.
- Call `crm_create_record` only when the user clearly asks to save a new CRM item.
- Call `crm_update_record` only when the user clearly asks to modify an existing CRM item.

## Review Boundary

CRM tools save structured records, but they do not approve deals, sign contracts, collect payment, or sync external systems. After writes, report the object, record id, important field values, and any fields that should be reviewed in the CRM Workbench.

## Core Objects

- `company`: companies and accounts.
- `person`: people and contacts.
- `opportunity`: pipeline opportunities.
- `task`: follow-up tasks.
- `note`: lightweight notes.
