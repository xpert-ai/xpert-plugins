---
name: index
description: "Use when an Agent needs to create, update, review, or manage Excalidraw drawings through the Xpert Excalidraw plugin, including Mermaid drafts, Excalidraw JSON scenes, Workbench review, versioning, import/export, and failure reporting."
---

# Excalidraw Agent Drawing

Use this skill when a user asks to create, edit, review, convert, import, export, or manage an Excalidraw diagram in Xpert.

## Plugin Purpose

The Excalidraw plugin gives an Agent a structured drawing loop:

- Save reviewable Excalidraw drawing records.
- Store every meaningful change as a version.
- Use Mermaid for quick flow and architecture drafts.
- Use Excalidraw JSON elements when layout, styling, or freeform drawing needs precision.
- Let the user inspect, edit, convert, restore, import, export, approve, or archive the drawing in the Excalidraw Workbench.

## Workflow

1. Identify the drawing goal, audience, key nodes, relationships, and required precision.
2. For flows, state transitions, architecture flows, or simple dependency maps, prefer Mermaid and save it with `excalidraw_save_mermaid_draft`.
3. For precise styling, free layout, annotations, or updates to a user-edited canvas, use Excalidraw JSON through `excalidraw_create_drawing`, `excalidraw_save_scene_version`, or `excalidraw_patch_scene`.
4. Before updating an existing drawing, call `excalidraw_get_drawing` and preserve the current version unless the user asks for a replacement.
5. Use concise titles and `changeSummary` values so the Workbench version history stays readable.
6. If the request cannot be converted safely, call `excalidraw_report_failure` and explain the smallest useful next step.

## Tool Selection

- `excalidraw_create_drawing`: create a new managed drawing, optionally with an initial scene.
- `excalidraw_save_scene_version`: save a complete Excalidraw scene as a new version.
- `excalidraw_patch_scene`: save a targeted update to an existing scene.
- `excalidraw_save_mermaid_draft`: save Mermaid source for automatic Workbench preview and user review.
- `excalidraw_search_drawings`: find existing drawings.
- `excalidraw_get_drawing`: read the current version before edits.
- `excalidraw_update_drawing_status`: mark draft, reviewed, or archived after user confirmation.
- `excalidraw_report_failure`: record generation, conversion, or import/export failures.

## Workbench Contract

Do not claim that a drawing is finalized just because Mermaid or JSON was drafted. The Workbench is the human review surface. A user can convert Mermaid, edit the Excalidraw canvas, save versions, restore prior versions, and mark a drawing as reviewed.

## Response Style

Keep user responses concise. Say which path you used, what was saved, and what the user can review next in the Workbench.
