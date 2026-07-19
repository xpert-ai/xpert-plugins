# Canvas

Canvas is an Agentic visual workspace for Xpert and data-xpert. It combines a tldraw infinite canvas, a human Workbench, an Assistant template, and Agent middleware tools so people and AI can create, review, annotate, version, and refine visual work in one place.

Use Canvas when a conversation needs a shared visual surface: project planning boards, moodboards, wireframes, annotation-driven image iteration, AI image slots, and reviewable whiteboards that remain editable after the Agent has contributed.

## Product Highlights

- Infinite canvas for whiteboards, visual plans, moodboards, wireframes, and image boards.
- Canvas Workbench for human review, direct editing, annotation, version browsing, restore, import, and export.
- Canvas Assistant template that carries the current document, selected shapes, insertion target, and snapshot image into the Agent conversation.
- AI image holders that let users reserve exact slots for generated images, then ask the Agent to fill or replace those slots.
- Agent middleware tools for metadata-only creation, simplified staged shape creation, targeted record patches, image insertion, progressive record reads, status updates, and failure reporting. Agent tools update the working copy but never create versions.
- Progressive disclosure is enforced by the contract: `canvas_get_document` returns counts and revision only, `canvas_list_records` returns at most 40 summaries per page, and `canvas_get_record` drills into one exact record. Before writing, the Agent counts all planned create/update/remove operations and splits totals above the hard limit of 12 into semantic stages, preferably 6–8 operations each; every accepted stage returns a compact receipt for the next stage. New `text`, `geo`, `note`, `frame`, and `arrow` shapes use simplified DTOs; Canvas generates tldraw ids, parents, indices, defaults, and rich text server-side.
- Platform Collaboration/Yjs is the live source of truth: Workbench edits and Agent record updates merge at tldraw-record granularity and stream into every open Canvas session.
- Live collaborator and Agent presence, plus explicit versions and viewport snapshot images stored in the Xpert workspace for visual inspection.
- Human-controlled Artifact sharing: queue a strongly-bound tldraw revision/page, render it in the platform sandbox-browser pool, and publish a self-contained read-only viewer; this never creates a Canvas version or a duplicate publication model.

## Screenshot Slots

Add product screenshots here when they are ready. Suggested paths are only placeholders.

| Slot | Suggested Asset | Show |
| --- | --- | --- |
| Workbench overview | `assets/screenshots/workbench-overview.png` | Document list, main tldraw canvas, toolbar, and version/log inspector. |
| AI image holder flow | `assets/screenshots/ai-image-holder.png` | A selected holder frame and an Agent-generated image inserted into it. |
| Annotation review | `assets/screenshots/annotation-review.png` | Markups, arrows, and text notes used as review instructions for the Agent. |
| Version history | `assets/screenshots/version-history.png` | Saved versions, restore controls, and a clear current-version state. |

## Typical Workflows

1. Start a canvas from a user request, template prompt, imported tldraw snapshot, or Workbench action.
2. Sketch or arrange content in the Workbench while record diffs sync through the platform collaboration session; background autosave maintains viewport and selection projections.
3. Select a frame, image holder, annotation, or other shape and ask Canvas Assistant to act on that context.
4. Let the Agent inspect a summary, list only the records needed for the next decision, and submit bounded stages; accepted Yjs updates appear in the open Workbench immediately.
5. A human saves an explicit version from the Workbench version panel when a review milestone is reached, then restores or compares versions later.
6. A human can open Share to publish a fixed Artifact snapshot or keep one stable link on the latest explicitly published Artifact content. Public links require explicit confirmation.

## How Canvas Fits Into Xpert

- Workbench view: the interactive product surface for creating, editing, annotating, importing, exporting, versioning, and reviewing canvases.
- Canvas Assistant: a ready-to-use Assistant template for visual workflows, including generated image placement and annotation-aware edits.
- Agent middleware tools: the structured automation layer that lets Agents safely create documents, update records, insert images, and record failures.
- Installable skill: guidance for Agents so they use Canvas context, selection data, snapshots, and image insertion targets correctly.
- Workspace snapshots: the current viewport image is written to `files/canvas/documents/{documentId}/snapshots/current.png`; saved versions keep their own images under `files/canvas/documents/{documentId}/snapshots/versions/`.
- Artifact share: Managed Queue carries only the export id; a versioned `canvas.export` Sandbox Action reads the authoritative snapshot through Workspace Files, renders with tldraw in Playwright, and returns an integrity-checked portable file reference. The platform still owns Artifact, ArtifactVersion, and durable link state; `CanvasArtifactExport` stores only async job state and evidence.

## Best For

- Product and project teams turning rough ideas into shared visual plans.
- Designers and content teams iterating on generated imagery with human markup.
- Agents that need a durable visual memory instead of one-off chat attachments.
- Review workflows where every AI edit should be inspectable, restorable, and auditable.

## Included Package Surfaces

- Marketplace app metadata for Xpert and data-xpert.
- Canvas Workbench extension view.
- Canvas Agent middleware.
- Canvas Assistant template.
- Canvas Agent Skill under `skills/`.
- Logo and composer icon assets under `assets/`.

## Verify

```bash
pnpm test
pnpm build
```
