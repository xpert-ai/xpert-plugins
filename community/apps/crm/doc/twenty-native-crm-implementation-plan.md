# Twenty Native CRM Implementation Plan

## Summary

Build `/Users/xpertai/Pro/xpert-plugins/community/apps/crm` as an Xpert native CRM plugin inspired by Twenty's core CRM architecture. The plugin does not run Twenty as a sidecar, does not start Twenty services, and does not import Twenty runtime packages. Twenty is used only as a product and architecture reference while the CRM kernel, Workbench view, Agent middleware tools, skills, and Assistant template are implemented natively on Xpert.

The first prototype should make the loop visible inside Xpert: install the plugin, initialize default CRM metadata, open a native CRM Workbench view, create/search/update CRM records, and let an Assistant use narrow CRM tools.

## Architecture Goals

- Native Xpert plugin with `targetApps: ['data-xpert']` and capabilities for `business-app`, `workbench-view`, and `assistant-tool`.
- Metadata-driven CRM kernel rather than hardcoded per-object tables.
- Tenant and organization isolation on every persisted table and read/write path.
- Agent tools that can assist with CRM entry and lookup while reviewable UI stays in Workbench.
- Remote component UI that only uses the platform bridge and never receives tokens, tenant IDs, organization IDs, or internal API URLs.
- Upgrade path that gradually recreates Twenty-like capabilities without coupling Xpert to Twenty's runtime.

## Data Model

- `CrmObjectDefinition`: object metadata such as `company`, `person`, and `opportunity`.
- `CrmFieldDefinition`: field metadata such as text, number, date, select, relation, and boolean fields.
- `CrmRelationDefinition`: relation metadata between CRM objects.
- `CrmRecord`: generic record values stored by `objectKey`.
- `CrmViewDefinition`: list/detail view metadata including columns, filters, and sorts.
- `CrmActivity`: timeline and audit events for records and Agent actions.

## Milestones

### M0: Plan and Plugin Skeleton

- Create this implementation plan.
- Create package metadata, TypeScript configuration, plugin entry, server module, and asset copy script.
- Register plugin metadata for data-xpert, Workbench views, Agent tools, and Assistant template.

### M1: CRM Kernel

- Implement metadata services for objects, fields, relations, and views.
- Implement generic record CRUD, search, field validation, and relation value handling.
- Seed default Company, Person, Opportunity, Task, and Note metadata.

### M2: Workbench Prototype

- Add a native CRM Workbench remote component.
- Support object navigation, record lists, details, create, edit, and search.
- Route all UI data/actions through `requestData` and `executeAction`.

### M3: Agent Tools and Skills

- Add `crm_list_objects`, `crm_search_records`, `crm_get_record`, `crm_create_record`, and `crm_update_record`.
- Add a CRM skill that explains safe Agent behavior and review boundaries.
- Add a CRM Assistant template with practical starter prompts.

### M4: Twenty Capability Roadmap

| Capability | Status | Notes |
| --- | --- | --- |
| Objects & Fields | prototype | Default metadata plus backend CRUD. Next: object/field configuration UI, advanced field types, deactivation. |
| Views | usable | Default table views, Workbench table layout, search, sort, density, row selection, and saved visible columns. Next: filters, saved sort rules, view create/rename, Kanban, Calendar. |
| Relations | usable | Many-to-one relation fields store record ids, resolve labels in Workbench, provide a searchable shadcn Command-based picker, and show reverse related-record panels in record details. Next: inline related-record creation, polymorphic attachments for Notes/Tasks, and many-to-many relation UX. |
| Activities | usable | Record create/update activity events are shown in the detail timeline. Next: richer activity types, actor names, comments, and email/calendar events. |
| Notes & Tasks | prototype | Seeded as objects and surfaced in the detail timeline through the current `recordId` attachment field. Next: inline create/edit, reminders, assignees, and polymorphic relation fields. |
| Import/export | not-started | CSV/XLSX import and export after core CRUD stabilizes. |
| Workflow | not-started | Xpert-native automation later. |
| Apps / front components | not-started | Xpert plugin extensions later. |
| Skills / Agents | prototype | First CRM Agent middleware and skill. |

## Twenty Capability Research Notes

Updated on 2026-06-17.

- Twenty positions its core primitives as objects, views, workflows, and agents. The Xpert-native CRM should keep the same product shape while implementing each primitive as Xpert plugin services, view providers, middleware tools, and skills.
- Twenty's standard CRM data model includes People, Companies, Opportunities, Notes, and Tasks. The current Xpert plugin seeds those objects and should next deepen Notes/Tasks through record timeline UX rather than treating them only as generic table rows.
- Twenty views are saved display configurations. They support table, kanban, and calendar layouts, plus filters, sorting, and visible fields. The current Xpert plugin now saves visible table columns; filters and saved sorts are the next table-view parity target.
- Twenty relation fields connect objects such as People to Companies and Opportunities to Companies/People. The Xpert plugin now supports this first as a native many-to-one flow in the detail editor, with server-side label hydration for list/detail display and reverse related-record panels for the selected record.
- Twenty migration guidance treats important notes and activities as core CRM data, and its relation import reference describes Notes/Tasks as records that can attach to People, Companies, and Opportunities. The Xpert plugin now surfaces seeded Notes/Tasks and system activities in a native record detail timeline while keeping polymorphic attachment modeling as the next migration step.
- Twenty Kanban views require a select-like stage/status field and support moving cards between stages. The Xpert plugin should first target Opportunities by stage, then generalize to any object with a select field.
- Twenty Calendar views require a date/date-time field and are useful for Tasks, deadlines, and scheduled activities. The Xpert plugin should add Calendar only after view metadata can store layout type and layout-specific settings.
- Twenty workflows support record triggers, schedules, manual triggers, webhooks, and actions such as create/update/delete/search record, send email, code, form, and HTTP request. In Xpert, this should map to Xpert-native workflow/agent automation rather than copying Twenty runtime.

### Current Migration Priority

1. Table view parity: saved visible columns, filters, saved sorts, column ordering.
2. Timeline UX: inline create/edit for Notes and Tasks, activity actor names, reminders, comments, and richer activity types.
3. Relation UX: inline related-record creation, polymorphic attachments for Notes/Tasks, many-to-many relation modeling.
4. Opportunity pipeline: Kanban view grouped by `stage`.
5. Task calendar: Calendar view grouped by `dueDate`.
6. Import/export: CSV import preview, error review, and export current view.
7. Workflow/Agent integration: Xpert-native triggers/actions and assistant-assisted CRM updates.

## Test Plan

- `pnpm --filter @xpert-ai/plugin-crm build` passes.
- `pnpm --filter @xpert-ai/plugin-crm test` passes.
- Default CRM schema initializes for each tenant/organization scope.
- Workbench view can list objects, list records, create records, update records, and search.
- Agent tools can list objects, search records, fetch a record, create a record, and update a record.
- Cross-tenant and cross-organization data remains isolated.
- Remote component only receives view data through the Xpert bridge.

## Assumptions

- The plugin is an Xpert native implementation, not a Twenty sidecar.
- Twenty source is not copied into the runtime plugin.
- First release prioritizes core CRM flow over full Twenty feature parity.
- Company, Person, and Opportunity are the minimum visible business objects.
- Task and Note are seeded early so the activity/timeline direction is clear.
