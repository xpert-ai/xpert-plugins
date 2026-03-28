---
'@xpert-ai/plugin-markitdown': patch
---

Move pipIndexUrl and pipExtraIndexUrl configuration to plugin-level config for organization-wide defaults. These fields can now be configured at the plugin level and are optional (can be blank or null). Middleware-level config still supports version, extras, and skillsDir for per-agent customization.