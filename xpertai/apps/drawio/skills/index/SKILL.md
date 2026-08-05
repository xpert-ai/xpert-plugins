---
name: index
description: "Use when an Agent needs to create, update, review, or manage draw.io / diagrams.net diagrams through the Xpert draw.io plugin, including Mermaid drafts, XML scenes, embedded editor review, versioning, import/export, and failure reporting."
---

# draw.io Agent Drawing

Use this skill when a user asks to create, edit, review, convert, import, export, or manage a draw.io / diagrams.net diagram in Xpert.

## Plugin Purpose

The draw.io plugin gives an Agent a structured diagram loop:

- Save reviewable draw.io diagram records.
- Store diagrams.net XML, Mermaid drafts, previews, and metadata as versions.
- Load Mermaid drafts into the embedded diagrams.net editor.
- Let the user manually edit, save, restore, approve, archive, import, or export diagrams in the draw.io Workbench.

## Workflow

1. Identify the diagram type, audience, key nodes, relationships, and any layout constraints.
2. Prefer `drawio_save_spec_version` for non-trivial generated diagrams. Submit compact pages, nodes, edges, and optional native styles; the plugin builds complete XML server-side.
3. Use Mermaid for simple flowcharts, state flows, and sequence-style drafts when diagrams.net can import the structure. Use raw diagrams.net XML only for small documents, user-supplied XML, or a targeted edit.
4. Before updating an existing diagram, call `drawio_get_diagram` and preserve user-edited XML unless a full replacement is requested.
5. Save every meaningful Agent or Workbench change as a new version with a clear `changeSummary`.
6. Never generate a large raw XML tool argument and never stage XML in an Agent sandbox file: draw.io tools do not read that file. If raw XML validation fails or the diagram is more than a few cells, switch to `drawio_save_spec_version` rather than retrying the same XML route.
7. If XML generation or conversion is unsafe, call `drawio_report_failure` and explain the recoverable path.

## Tool Selection

- `drawio_create_diagram`: create a managed draw.io diagram, optionally with initial XML or Mermaid.
- `drawio_save_spec_version`: preferred generated-diagram route; save compact pages/nodes/edges as a complete server-built XML version.
- `drawio_save_scene_version`: save complete diagrams.net XML as a new version.
- `drawio_patch_scene`: save a targeted replacement of XML, Mermaid source, descriptor, or preview fields.
- `drawio_save_mermaid_draft`: save Mermaid source for Workbench import into diagrams.net.
- `drawio_search_diagrams`: find existing diagrams.
- `drawio_get_diagram`: read current XML, Mermaid, versions, and logs before edits.
- `drawio_update_diagram_status`: mark draft, reviewed, or archived after user confirmation.
- `drawio_report_failure`: record generation, import, conversion, or export failures.

## Workbench Contract

The embedded draw.io editor is the source for manual edits. Mermaid drafts are not final diagrams until they are loaded, reviewed, and saved from the Workbench as XML versions.

## Response Style

Keep responses concise. Tell the user which route was used, which version was saved, and what can be reviewed or edited next.
