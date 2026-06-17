# CRM Plugin

CRM is an Xpert native business app plugin inspired by Twenty's core CRM model. It does not run Twenty as a sidecar and does not import Twenty runtime code.

The first version provides a metadata-driven CRM kernel, a Workbench view, Agent middleware tools, a CRM skill, and an Assistant template. It is intentionally scoped to a usable prototype: default objects, generic records, search, create, update, and a native CRM Workbench.

## Agent middleware tools

- `crm_list_objects`: list CRM objects and fields.
- `crm_search_records`: search CRM records by object, keyword, and pagination.
- `crm_get_record`: load one CRM record with metadata.
- `crm_create_record`: create one CRM record.
- `crm_update_record`: update one CRM record.

## Data storage

CRM data is stored in plugin-owned TypeORM tables:

- `plugin_crm_object_definition`
- `plugin_crm_field_definition`
- `plugin_crm_relation_definition`
- `plugin_crm_record`
- `plugin_crm_view_definition`
- `plugin_crm_activity`

Every table includes tenant and organization scope fields.
