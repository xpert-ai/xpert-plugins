# Canvas Plugin

Agentic Canvas plugin for Xpert and data-xpert. It provides Agent middleware tools, a tldraw-powered Canvas Workbench, Assistant templates, and an installable Xpert skill for creating, versioning, reviewing, annotating, and inserting images on infinite canvases.

The Workbench autosaves the current tldraw working copy and writes a viewport snapshot image to the Xpert workspace at `files/canvas/documents/{documentId}/snapshots/current.png`. Explicit versions keep their own image file under `files/canvas/documents/{documentId}/snapshots/versions/`. Canvas Assistant templates include `@xpert-ai/plugin-view-image` so Agents can call `view_image` against the latest snapshot path before reasoning about visual layout or annotations.

Installable skills live under `skills/` and are advertised through `.xpertai-plugin/plugin.json`.

## Verify

```bash
pnpm test
pnpm build
```
