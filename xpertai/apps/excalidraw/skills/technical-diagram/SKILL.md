---
name: technical-diagram
description: Model architecture, flow, sequence, comparison, UML, AI agent, RAG, memory, and microservice diagrams as explicit DiagramIR; select built-in Excalidraw templates; render deterministically; validate structure and geometry; inspect SVG/PNG previews; and run a bounded targeted visual-correction loop.
---

# Technical Diagram Engineering

Use DiagramIR for technical diagrams that should be semantic, repeatable, editable, and reviewable in Excalidraw. Do not invent Excalidraw element JSON when the technical diagram engine middleware is available.

## Required workflow

Before creating DiagramIR, call `excalidraw_list_typography_presets`, choose a managed built-in `fontFamilyId`, and do not invent font ids or URLs.

1. Classify the diagram: architecture, data-flow, flowchart, sequence, comparison, timeline, mind-map, agent, memory, class, use-case, state-machine, ER, network topology, or other.
2. Search with `excalidraw_template_list`; inspect promising templates with `excalidraw_template_inspect`.
3. Instantiate a template or call `excalidraw_diagram_create` with a complete `schemaVersion: 1` DiagramIR.
4. Use stable semantic IDs. Add or correct one group, node, or edge per upsert call and pass the latest `expectedRevision`.
5. Call `excalidraw_diagram_validate`; fix every error before rendering and assess each warning.
6. Call `excalidraw_diagram_render`, then `excalidraw_diagram_create_preview` without a run ID to start a quality run.
7. Inspect the returned PNG when image reading is available. Check clipping, hierarchy, whitespace, overlap, label placement, routing, arrow-label collisions, and excessive crossings.
8. Record one result with `excalidraw_diagram_record_visual_review`: `passed` only after inspection, targeted `needs_revision`, or explicit `skipped` when inspection is unavailable.
9. For `needs_revision`, change only diagnosed DiagramIR items, validate and render again, then create another preview with the same `qualityRunId`. Stop after two correction passes and hand an `exhausted` run to the user.

## DiagramIR principles

- Model meaning, not drawing primitives. Use semantic node kinds such as `model`, `vector-store`, `user`, and `actor`.
- Use explicit `groupId`, `layer`, `order`, endpoints, ports, and `flow`; never infer them from localized labels.
- Prefer short node labels and optional descriptions. Keep edge labels to three words when possible.
- Use `primary` for the main request path, `control` for triggers, `read`/`write` for data, `async` for events, `transform` for conversions, and `feedback` for loops.
- Use `layered` for system/data architectures, `flow` for processes, `sequence` for interactions, `radial` for concept maps, `matrix` for comparisons, and `explicit` only for required coordinates.
- Choose light/dark, clean/sketch, and neutral/semantic independently from graph meaning.

## Layout guidance

- Architecture: interface or clients → gateway → services → storage/observability.
- Data flow: label data-bearing edges and keep control edges distinct.
- Flowchart: use process and decision node kinds; avoid long labels inside diamonds.
- Sequence: order participants left to right and messages by occurrence.
- Agent systems: separate input, agent/model core, tools, memory, and output; mark feedback explicitly.
- Memory systems: keep read and write paths as distinct edges.
- UML and ER: preserve relationship types and multiplicity in edge labels; do not substitute proximity for semantics.

## Quality and edit safety

- Treat invalid references, duplicate IDs, out-of-bounds nodes, overlaps, and edges crossing unrelated nodes as blocking.
- Preserve unaffected semantics and layout. Correct ports or routing hints before changing the whole layout; increase canvas size or spacing before shrinking text.
- Keep request/response, read/write, sync/async, and feedback distinctions during simplification.
- DiagramIR is not reverse-synchronized from manual Excalidraw edits. Never replace a `diverged` scene without explicit user approval and `replaceDiverged=true`.
- Quality reports and preview file references are completion evidence. A successful tool call is required before claiming validation, rendering, or visual review passed.

## Attribution

The diagram taxonomy, semantic vocabulary, routing discipline, and bounded generation workflow are adapted from `yizhiyanhua-ai/fireworks-tech-graph` at commit `14be3ad3b05389a5d603562c207eb37157637127`, distributed under the MIT License. This skill uses Excalidraw-native themes and the Xpert DiagramIR implementation rather than the upstream Python/Cairo renderer.

## Native MCP and recovery

MCP calls require explicit drawingId for existing drawings and a stable operationId for mutations. Reuse an operationId only with identical input. Read the scene revision for scene replacement/restore, and the IR revision for technical edits; diagram_validate writes a new IR revision. save_scene_version updates the working scene; checkpoint_version freezes history.

Use create_preview or convert_mermaid for headless work. Persist jobId and cursor, use wait_job (up to 45 seconds per call) until terminal, and resume with get_job after reconnecting. Read PNG content with read_preview before visual review. DiagramIR quality images carry their IR revision and can differ from the actual scene. A conversion conflict retains its result for read_export and never overwrites current work.

All Excalidraw tools, including public sharing, declare direct invocation under application policy. Do not request host.input confirmation or send a confirmation boolean. Public links still require an explicit drawingId, expectedRevision and operationId; stale revisions must fail. Use only platform Artifact URLs and revoke with revoke_artifact_link.

`excalidraw_diagram_render` requires both `expectedRevision` (DiagramIR) and `expectedSceneRevision` (canvas) over MCP. Read the drawing again before replacing the scene.

Tool results are compact DTOs. Drawing summaries are flat (drawingId, sceneRevision, versionNumber); read history with list_versions. diagram_get returns ir without quality history. Read paged issues with diagram_get_quality_report (issueOffset/issueLimit, reviewOffset/reviewLimit). Export metadata appears only in the first chunk. Do not expect entity fields, data/item wrappers on parent reads, or echoed input.

Tool DTOs are available as JSON text as well as structuredContent. Read returned IDs/revisions/URLs directly; no shell fallback is needed for text-only clients. Use validation issue paths or targetIds to repair the reported defects. Follow nextIssueOffset with diagram_get_quality_report for persisted reports; a failed create has no report to read. Retain changedIds for subsequent scene edits and the effective review decision/attempt for the correction limit.

Tool output recovery: `resultStatus: "unavailable"` means the detailed result could not be prepared. Preserve the known business status and IDs; read the returned drawing/job or retry identical arguments with the same `operationId`. Do not start a new write to recover a missing response.
