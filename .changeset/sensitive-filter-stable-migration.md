---
'@xpert-ai/plugin-sensitive-filter': patch
---

Migrate sensitive filter middleware to the validated xpert implementation and align runtime behavior with current product expectations:

- Rewrite uses whole-sentence replacement instead of partial replacement.
- Remove audit log output path and related config surface.
- Add Chinese enum labels via `x-ui.enumLabels` and tooltip for general profile (`strict`/`balanced`).
- Support rule drafts in schema so general pack can be enabled without forcing a complete rule row.
- Keep conflict priority and regex pre-compilation validation behavior.
