# @xpert-ai/plugin-pptx-editor

## 0.2.0

### Minor Changes

- b56c01e: Add the PPTX Assistant capability and structured tools for native presentation creation, targeted revision-checked editing, validation, rendering and export resource cards. Add a bilingual catalog of 16 DSH template collections with 192 layouts and enterprise PPTX import and native composition through pptx-automizer, preserving source templates, masters, layouts and speaker notes. Route edits through the current content owner and make identical retries preserve subsequent human edits.

### Patch Changes

- b62ddf3: Use the shared Excel and PowerPoint file-type artwork for document Views and include its attribution in published packages.
- fa630d7: Generate version-bound presentation covers through Managed Queue and the isolated Browser Runtime, and attach authorized previews to PPTX resource cards. Recheck source access and revision when rendering or serving cached covers, isolate Sandbox Job identities by the requesting actor, and preserve file cards when preview generation is unavailable. Support both landscape and portrait covers and reject missing slide content before waiting for layout.
