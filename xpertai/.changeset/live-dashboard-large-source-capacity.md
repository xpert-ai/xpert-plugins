---
"@xpert-ai/plugin-live-dashboard": minor
---

Support a default authoring capacity of 32 Bindings and a storage ceiling of 64, with installation policy that preserves historical dashboard maintenance. Add incremental source queries, bounded scheduling, searchable Sources with individual refresh and bounded previews, batch Agent validation, and durable scoped save validation with progress, idempotency and recovery.

Require published SDK/contracts 3.33.0 and use its Artifact Document scheduler and grouped query runtime directly, removing the temporary SDK backport. Live source dispatch remains limited to 60 per minute; immutable Sandbox snapshot replay has a separate bounded interaction budget.
