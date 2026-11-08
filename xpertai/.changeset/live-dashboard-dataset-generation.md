---
'@xpert-ai/plugin-live-dashboard': minor
---

Add a `template-create` View action that generates a standard dashboard draft from an authorized, revision-checked reusable dataset. Validate field mappings, preserve parameter defaults, and reuse the normal dashboard query validation and draft save workflow. Generated dashboards own a copy of the binding; recycling the source dataset does not delete the dashboard.

**Beta:** Generation contracts and preset semantics may change incompatibly at any time during beta. This foundation does not include a template catalog, example datasets, covers, publication, or library import/export.
