# Canvas

Canvas is an Agentic visual workspace for Xpert and data-xpert. It combines a tldraw infinite canvas, a human Workbench, an Assistant template, and Agent middleware tools so people and AI can create, review, annotate, version, and refine visual work in one place.

Use Canvas when a conversation needs a shared visual surface: project planning boards, moodboards, wireframes, annotation-driven image iteration, AI image slots, and reviewable whiteboards that remain editable after the Agent has contributed.

## Product Highlights

- Infinite canvas for whiteboards, visual plans, moodboards, wireframes, and image boards.
- Canvas Workbench for human review, direct editing, annotation, version browsing, restore, import, and export.
- Canvas Assistant template that carries the current document, selected shapes, insertion target, and snapshot image into the Agent conversation.
- AI image holders that let users reserve exact slots for generated images, then ask the Agent to fill or replace those slots.
- Agent middleware tools for creating canvases, patching tldraw records, inserting images, saving versions, searching documents, reading records, updating status, and reporting failures.
- Autosaved working copies plus explicit versions, with snapshot images stored in the Xpert workspace for visual inspection.

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
2. Sketch or arrange content in the Workbench while Canvas autosaves the working copy.
3. Select a frame, image holder, annotation, or other shape and ask Canvas Assistant to act on that context.
4. Let the Agent inspect the latest viewport snapshot, generate images, insert assets, or patch selected records.
5. Save an explicit version when a review milestone is reached, then restore or compare versions later.

## How Canvas Fits Into Xpert

- Workbench view: the interactive product surface for creating, editing, annotating, importing, exporting, versioning, and reviewing canvases.
- Canvas Assistant: a ready-to-use Assistant template for visual workflows, including generated image placement and annotation-aware edits.
- Agent middleware tools: the structured automation layer that lets Agents safely create documents, update records, insert images, and record failures.
- Installable skill: guidance for Agents so they use Canvas context, selection data, snapshots, and image insertion targets correctly.
- Workspace snapshots: the current viewport image is written to `files/canvas/documents/{documentId}/snapshots/current.png`; saved versions keep their own images under `files/canvas/documents/{documentId}/snapshots/versions/`.

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
