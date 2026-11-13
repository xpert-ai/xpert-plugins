---
'@xpert-ai/plugin-live-dashboard': minor
---

**Beta:** Add Data views and reusable datasets are experimental. View identifiers, action APIs, payloads, and persisted formats may change incompatibly at any time during beta. Backward compatibility is not guaranteed; upgrades may require migrating or recreating dataset definitions.

Add an on-demand Add Data Workbench view for browsing authorized analytics sources and managing reusable datasets. Support source discovery, query and field editing, reuse of existing dashboard bindings, live query previews, revision-aware saves, and confirmed recycling.

Use shared shadcn controls and localized copy. Reset view state when its host scope changes, and ignore errors from requests belonging to the previous scope.
