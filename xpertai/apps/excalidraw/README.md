# Excalidraw for Xpert

[简体中文](./README_zh-hans.md)

Excalidraw for Xpert is a collaborative Agentic diagramming product that brings AI-assisted creation, multiplayer editing, an editable Excalidraw canvas, secure Artifact sharing, reusable technical-diagram templates, version history, and human review into one workspace.

Users and Agents work on the same drawing instead of exchanging flattened images. A user can edit freely in the Workbench while an Agent reads the active drawing and selection, adds or patches elements, reorganizes a scene, creates versions, or produces a structured technical diagram that remains editable in Excalidraw.

## Why Excalidraw for Xpert

AI-generated diagrams are often hard to revise, inconsistent between runs, or disconnected from the document being reviewed. This plugin keeps diagrams editable and introduces an optional quality-engineered workflow for technical content:

- **Create with natural language** — describe a process, architecture, interaction, Agent system, or whiteboard idea and let an Assistant build the first editable version.
- **Edit on a familiar canvas** — continue with native Excalidraw selection, drawing, text, styling, movement, resizing, and direct manipulation.
- **Co-edit in real time** — multiple people can work on the same drawing with Yjs synchronization, live selections, cursors, and collaborator identity.
- **Share a governed Artifact** — publish the current drawing as a self-contained, read-only Excalidraw page with public, organization, or workspace access, then copy or revoke the platform-managed link.
- **Keep the Agent in context** — the Assistant receives the active drawing, current version, selected elements, and dirty state so it can modify the intended scene.
- **Choose the right level of structure** — use freeform drawing tools for flexible visual work or DiagramIR for repeatable technical diagrams.
- **Start from proven templates** — use ten built-in diagram templates for common system and AI architecture patterns.
- **Review before delivery** — deterministic validation and PNG visual review help catch overlap, clipping, routing, and label problems.
- **Preserve meaningful history** — save explicit versions, restore earlier work, and protect manual edits from silent Agent replacement.

## Product experience

### Excalidraw Workbench

The Workbench is the visual home for drawings. It provides:

- Drawing search, filtering, creation, archiving, and deletion, with one New menu for a new drawing or a new version
- Native Excalidraw canvas editing
- Automatic multiplayer sessions with collaborator presence, remote cursors, and independent element-level merge behavior
- Current-scene saves and explicit version checkpoints
- Version history, restoration, and review status
- Excalidraw JSON import and JSON, PNG, or SVG export
- Interactive HTML Artifact publishing with explicit public-link confirmation, organization/workspace access, stable-link reuse, and revocation
- Mermaid draft conversion into an editable scene where supported
- Template search with category and tag filters
- Template parameter forms, previews, and create-from-template actions
- DiagramIR revision, validation, visual-review, and synced/diverged status
- Dirty-scene protection when an Agent or IR render would replace local work
- Host theme and Assistant selection-context integration

### Excalidraw Drawing Assistant

The general-purpose Assistant is designed for flexible drawing work. It can:

- Create and search drawings
- Add elements in small, reviewable batches
- Read the current drawing or a specific scene item
- Apply targeted element patches or save a complete scene
- Create and refine Mermaid drafts
- Save versions, update drawing status, and report recoverable failures

This Assistant does not require DiagramIR. It remains suitable for flowcharts, wireframes, annotations, brainstorming, and freeform whiteboards.

### Excalidraw Technical Diagram Assistant

The technical Assistant enables one Technical Diagram Engine middleware and one Technical Diagram Engineering Skill. The engine combines template, DiagramIR, and quality tools behind a single conversation toggle and follows a controlled workflow:

1. Search and inspect built-in templates.
2. Instantiate a template or model the diagram as DiagramIR.
3. Apply deterministic layout and orthogonal routing.
4. Validate structure and resolved geometry.
5. Render a new native Excalidraw version.
6. Create SVG and PNG quality previews.
7. Record visual review and perform at most two targeted correction passes.

It is intended for architecture diagrams, data flows, sequence interactions, comparison views, RAG systems, Agent workflows, memory systems, and microservice platforms.

## Two drawing modes

| Mode | Best for | Behavior |
| --- | --- | --- |
| General Excalidraw | Whiteboards, wireframes, quick flows, annotations, and creative layouts | The Agent works directly with Excalidraw scene elements and the user remains free to edit anywhere. |
| Technical DiagramIR | Architecture, system flows, sequence diagrams, Agent systems, and repeatable documentation | The Agent models semantic nodes and edges, then uses deterministic layout, validation, rendering, and visual review. |

The modes can coexist in the same plugin, but DiagramIR does not reverse-compile arbitrary Excalidraw scenes. Once a user manually changes an IR-rendered scene, it is marked as diverged and remains protected until replacement is explicitly confirmed.

## Built-in technical diagram templates

The first template catalog includes five general structures and five domain recipes:

| Category | Templates |
| --- | --- |
| General structures | Layered Architecture, Process Flow, Sequence Interaction, Radial Concept Map, Comparison Matrix |
| AI and system recipes | RAG Pipeline, Agent Tool Loop, Multi-Agent Collaboration, Memory Architecture, Microservices Platform |

Every template contains localized metadata, parameter schema, safe defaults, a thumbnail, a trusted in-plugin builder, and English and Chinese examples. Template data cannot execute expressions or scripts.

## Diagram quality and visual review

The technical diagram engine checks more than whether a scene can be opened. It reports:

- Duplicate IDs and invalid references
- Canvas and group boundary violations
- Node overlap and likely text overflow
- Arrows that cross unrelated nodes
- Edge-label and node-label collisions
- Excessive edge crossings
- Invalid or stale revisions

SVG and PNG previews are generated from the same resolved geometry as the Excalidraw elements. PNG rendering uses bundled Noto Sans SC through `@resvg/resvg-js`, so English and Chinese previews do not depend on system Cairo or external font requests.

A visual review can be recorded as `passed`, `needs_revision`, or `skipped`. A requested revision must identify the affected node or edge IDs and state the correction intent. After two correction passes, the run becomes exhausted and returns to the user for review.

## Versions and edit safety

Drawings and DiagramIR revisions are scoped by tenant, organization, workspace/project, and drawing.

- Scene saves and explicit checkpoints preserve Excalidraw history.
- Ordinary collaborative edits update one authoritative Yjs working scene; they do not create noisy business versions. “New version” remains an explicit checkpoint.
- DiagramIR changes use optimistic revision checks to reject stale writes.
- Rendering DiagramIR always creates a new Excalidraw version.
- Manual Workbench saves and direct scene mutations mark linked DiagramIR as `diverged`.
- Re-rendering a diverged drawing requires explicit replacement confirmation.
- Applying a template to the current drawing creates a new version and replaces the scene; template merging is not supported.

## Multiplayer collaboration and Artifact sharing

The plugin uses Xpert platform capabilities instead of owning a second session system. The platform owns collaboration documents, update sequencing, presence, browser credentials, and socket transport; the plugin owns the versioned Excalidraw Yjs schema, scoped authorization, initialization, and materialization into drawing records.

The collaborative document stores elements by stable element ID, preserves explicit element order, and keeps app state, embedded files, and Mermaid source in separate Yjs structures. Updates to different elements merge independently. Strong operations—version checkpoints, restore, export, and sharing—synchronize with the authoritative document before continuing.

Artifact sharing materializes the authoritative collaborative scene and publishes a self-contained HTML page containing a native read-only Excalidraw viewer. The page supports pan, zoom, and fit-to-content without calling private APIs or external resources. It is written to scoped Workspace Files and registered as an interactive Xpert Artifact. The Workbench never constructs a share URL: it uses the URL returned by the platform. Public links require trusted UI confirmation, and unchanged content with the same policy reuses the active link.

## Files and output

| Direction | Format | Experience |
| --- | --- | --- |
| Import | `.excalidraw`, Excalidraw JSON | Open an existing scene as a new drawing or replace the current scene after confirmation. |
| Draft input | Mermaid | Convert a Mermaid draft for review and continued editing. |
| Export | Excalidraw JSON | Preserve editable scene data. |
| Export | PNG | Create a shareable raster image from the current canvas. |
| Export | SVG | Create a scalable vector image from the current canvas. |
| Share | Excalidraw HTML Artifact | Publish an access-controlled, revocable link to an interactive read-only drawing page. |
| Quality artifacts | SVG and PNG | Write technical-diagram evidence to Xpert Workspace Files. |

## What the plugin includes

- Excalidraw Workbench remote component
- Platform Yjs collaboration provider with presence and native Excalidraw collaborator rendering
- Platform Artifact and Workspace Files integration for controlled interactive HTML sharing
- Excalidraw Drawing Assistant template
- Excalidraw Technical Diagram Assistant template
- Excalidraw Agent Skill
- Technical Diagram Engineering Skill
- General Excalidraw Agent middleware
- Independently selectable Technical Diagram Engine middleware for template, DiagramIR, and quality tools
- Versioned drawing and DiagramIR persistence
- Ten built-in technical diagram templates
- Reusable artifact-template catalog and adapter contracts for other document plugins

## Typical workflows

### Flexible drawing

1. Open the Workbench or ask the Drawing Assistant to create a drawing.
2. Describe the desired content and let the Agent add editable elements.
3. Refine the result directly on the canvas or request targeted changes.
4. Save a version at a meaningful review point.
5. Export JSON, PNG, or SVG.

### Template-driven technical diagram

1. Ask the Technical Diagram Assistant for an architecture or workflow.
2. Select a suggested template and provide its parameters.
3. Review the deterministic Excalidraw result.
4. Inspect validation findings and the PNG quality preview.
5. Approve the result or request a targeted correction.
6. Continue editing manually after the structured workflow is complete.

## Development

From the `xpert-plugins` repository root:

```bash
pnpm -C xpertai --filter @xpert-ai/plugin-excalidraw test
pnpm -C xpertai --filter @xpert-ai/plugin-excalidraw build
NODE_PATH="$PWD/xpertai/node_modules/.pnpm/node_modules" \
  node plugin-dev-harness/dist/index.js \
  --workspace ./xpertai \
  --plugin @xpert-ai/plugin-excalidraw
```

Collaboration requires the Xpert Collaboration runtime capability. Artifact sharing requires the Artifacts and Workspace Files runtime capabilities. Quality-preview tools also require Workspace Files.

## License and attribution

This plugin is distributed under the [AGPL-3.0](https://www.gnu.org/licenses/agpl-3.0.html) license.

Technical-diagram taxonomy and workflow guidance are adapted from [`yizhiyanhua-ai/fireworks-tech-graph`](https://github.com/yizhiyanhua-ai/fireworks-tech-graph) at the commit recorded in `skills/NOTICE.fireworks-tech-graph.txt`, under the upstream MIT License. The plugin uses Excalidraw-native themes and its own TypeScript/Resvg rendering pipeline; it does not copy the upstream Python/Cairo runtime.
