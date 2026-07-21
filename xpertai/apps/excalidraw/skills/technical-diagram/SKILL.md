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
