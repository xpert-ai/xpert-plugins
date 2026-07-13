# Pencil

[简体中文](./README_zh-hans.md)

Pencil is a collaborative Agentic design app for Xpert. It brings an editable design canvas, an AI design assistant, persistent documents, real-time collaboration, reviewable versions, and production file export into one workspace.

People and Agents work on the same document instead of passing static images back and forth. A user can sketch and refine visually in the Workbench while an Agent inspects the current page, edits selected nodes, restructures layouts, applies styles, and prepares export-ready results.

## Why Pencil

Traditional design automation often stops at generated code or a flattened preview. Pencil keeps the result as a structured, editable design document:

- **Design with an Agent** — ask Pencil Assistant to create screens, add sections, rewrite text, reorganize layouts, apply visual styles, inspect nodes, or analyze the design.
- **Edit on a native canvas** — work with pages, layers, frames, text, shapes, components, variables, constraints, auto-layout, fills, strokes, effects, and other structured Pencil elements.
- **Collaborate in real time** — users and Agents share the same Yjs-backed working document, with collaborator presence, live pointers, selections, focused-element indicators, reconnect recovery, and collaboration-aware undo/redo.
- **Keep intentional history** — ordinary edits update the working copy without creating noisy versions. An immutable version is created only when a user or Agent explicitly saves one.
- **Move files in and out** — import `.fig` and `.pen` files from Xpert Workspace Files, then export `.fig`, PNG, JPG, WebP, SVG, PDF, or JSX.
- **Share safely** — publish a self-contained read-only viewer with public, organization, or workspace access and fixed or always-latest version behavior.
- **Stay in context** — the Assistant receives the currently open document, page, node, selection, revision, and dirty-state context so requests modify the active design instead of accidentally creating a new one.

## Product experience

### Pencil Workbench

The full-screen Workbench is the visual home for Pencil documents. It provides:

- Document switching and creation
- Multi-page canvas navigation
- Page, layer, and asset panels
- Design and code inspection
- Zoom, pan, selection, and direct canvas editing
- Import, export, read-only sharing, save, restore, review, archive, and deletion actions
- Collaborator avatars, connection state, live cursors, selections, and Agent operation badges
- Host theme integration through Xpert CSS variables

### Pencil Assistant

The bundled Assistant Template connects natural-language requests to Pencil middleware tools. It can:

- Create a blank document or a realistic sample design
- Search and inspect existing documents
- Read the current document, page, or selected node
- Create and modify nodes, layouts, styles, components, variables, and vector paths
- Apply targeted JSX render patches to complex designs
- Import and export files through Workspace Files
- Save explicit versions, update review status, and report recoverable failures

Agent operations appear as virtual collaborators, making simultaneous human-and-Agent work visible in the same collaboration experience.

## Collaboration and versioning

Pencil uses Xpert's platform-level `platform.collaboration` capability. The platform owns secure sessions, Yjs synchronization, presence, reconnect repair, and cross-node delivery; Pencil owns its document schema and visual interaction model.

The working copy is the live collaborative state. Versions are deliberate checkpoints:

1. Users and Agents edit the working copy together.
2. Changes synchronize incrementally and do not create versions automatically.
3. **Save version** records an immutable checkpoint with the current graph and view context.
4. Restoring an older version updates the working copy without overwriting version history.

Documents and versions are isolated by tenant, organization, workspace/project, and Xpert identity.

## File formats

| Direction | Formats | Notes |
| --- | --- | --- |
| Import | `.fig`, `.pen` | Reads files from the current Xpert workspace and preserves structured graph data. |
| Export | `.fig` | Produces an editable design file. |
| Export | PNG, JPG, WebP | Raster output with target, scale, and quality options where supported. |
| Export | SVG | Vector output for selected pages or nodes. |
| Export | PDF | Document output suitable for review and sharing. |
| Export | JSX | Structured design representation for downstream development workflows. |

Exports are written to Xpert Workspace Files and returned as portable file references rather than local machine paths.

## What the plugin includes

- `Pencil Workbench` remote component
- `Pencil Assistant` template
- `Pencil Agent Skill`
- Agent middleware and selected Open Pencil core tools
- Platform Collaboration document provider
- Tenant-, workspace-, project-, and Xpert-scoped persistence
- Working copies, immutable versions, action logs, and structured failure reports
- Workspace Files import and export integration
- Platform Artifacts publication with a plugin-owned, network-free read-only viewer

## Typical workflow

1. Open Pencil and create a document, import an existing file, or ask the Assistant to generate a starting point.
2. Refine the design directly on the canvas or describe the change to the Assistant.
3. Collaborate with teammates and Agents while observing their current page, cursor, selection, or target element.
4. Save a version at a meaningful review milestone.
5. Mark the document as draft, reviewed, or archived.
6. Share a read-only fixed revision or always-latest link, or export the required delivery format to Workspace Files.

## Development

From the `xpert-plugins` repository:

```bash
pnpm -C xpertai exec nx test @xpert-ai/plugin-pencil
pnpm -C xpertai exec nx build @xpert-ai/plugin-pencil
npx -y node@20 plugin-dev-harness/dist/index.js \
  --workspace ./xpertai \
  --plugin @xpert-ai/plugin-pencil
```

The plugin requires an Xpert host that provides Workspace Files plus the `platform.collaboration` and `platform.artifacts` runtime capabilities.

## License

Pencil is distributed under the [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) license. It uses the Open Pencil runtime for structured design editing and file processing.
