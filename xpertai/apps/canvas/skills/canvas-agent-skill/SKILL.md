---
name: canvas-agent-skill
description: "Use when an Agent needs to use @xpert-ai/plugin-canvas middleware tools to create, inspect, patch, version, review, annotate, insert images into, or recover tldraw Canvas documents, including Workbench selection context and AI image holders."
---

# Canvas Agent Skill

Use this skill when a user asks an Agent to create, update, inspect, review, annotate, or recover a Canvas document through the Xpert Canvas plugin.

The plugin has two surfaces:

- Workbench: the human review and editing surface. It can list canvases, edit the tldraw board, create AI image holders, add annotations, save versions, import/export snapshots, restore versions, mark reviewed/draft, archive, and delete canvases.
- Middleware tools: the Agent-callable system of record. These tools create canvas records, save snapshots, patch tldraw records, insert image data URLs, search/read metadata, fetch exact records, update lifecycle status, and report failures.
- View image: the Canvas Assistant template should include `@xpert-ai/plugin-view-image`. Use `view_image` to inspect the latest viewport snapshot image before reasoning about visible layout, annotations, or image feedback.

Do not treat Workbench view actions as Agent middleware tools. Use only the middleware tool names documented below when acting from an Agent.

## Core Rules

1. Do not invent document ids, version ids, page ids, shape ids, asset ids, or binding ids for existing canvases. Use Workbench context, `canvas_search_documents`, `canvas_get_document`, or `canvas_get_record`.
2. Before editing an existing canvas, call `canvas_get_document` unless the current prompt already contains trustworthy Workbench context with the document id and version ref. By default this reads the latest autosaved working copy.
3. Prefer `canvas_patch_records` for targeted edits. Use `canvas_save_snapshot` only for a full snapshot import or intentional complete replacement.
4. Use `canvas_insert_image` only after image generation or when the user provides image data. Pass `dataUrl` or `base64`; the tool stores image data inside tldraw asset records for v1.
5. If the selected shape is an AI image holder frame, pass that frame id as `anchorShapeId`; the image will be inserted as a child of the frame and sized to the holder.
6. Do not delete or move annotations unless the user explicitly asks. Annotation arrows and notes are review evidence.
7. Do not claim a canvas was saved unless the tool call succeeded. Tool results are the source of truth.
8. Do not route logic from display text or localized labels. Use explicit fields such as `selection.type`, `selectedShapeIds`, `kind`, `status`, and `sourceType`.
9. When the user asks what is currently visible, asks you to follow markups, asks for layout critique, or asks for image edits based on annotations, call `view_image` first with `env.canvasSnapshotImagePath` or the `snapshotImagePath` returned by `canvas_get_document`.

## Workbench Selection Context

The Workbench can send `assistant.context.set` when the user selects shapes. That request state is not automatically visible to the model unless the assistant prompt renders it through prompt variables.

When the prompt includes these variables, use them before searching broadly:

- `env.canvasDocumentId`
- `env.canvasVersionId`
- `env.canvasPageId`
- `env.canvasSelectionJson`
- `env.canvasContextJson`
- `env.canvasSceneDirty`
- `env.canvasSnapshotImagePath`
- `env.canvasSnapshotImageUpdatedAt`
- `env.canvasSceneSource`

If `env.canvasContextJson` is non-empty, parse it as JSON. The expected shape is:

```json
{
  "currentCanvas": {
    "documentId": "document-id",
    "title": "Canvas title",
    "currentVersionId": "version-id",
    "currentVersionNumber": 12,
    "isDirty": true,
    "sceneSource": "autosave",
    "snapshotImagePath": "files/canvas/documents/document-id/snapshots/current.png",
    "snapshotImageUpdatedAt": "2026-06-25T15:22:28.459Z",
    "selection": {
      "type": "canvas.selection.v1",
      "pageId": "page:page",
      "selectedShapeIds": ["shape:id"],
      "selectedShapeCount": 1,
      "shapes": [
        {
          "id": "shape:id",
          "type": "frame",
          "x": 10,
          "y": 20,
          "w": 512,
          "h": 683,
          "isAiImageHolder": true
        }
      ],
      "capturedAt": "2026-06-25T15:22:28.459Z"
    }
  }
}
```

Selection rules:

- Treat `currentCanvas.selection.type === "canvas.selection.v1"` as the only valid machine-readable selection discriminator.
- If a valid selection exists, modify only `selectedShapeIds` unless the user explicitly asks to affect neighboring or unselected shapes.
- Use compact `selection.shapes` only for orientation, bounds, and intent. Fetch full record JSON with `canvas_get_record` before changing exact geometry, style, bindings, text, asset refs, or page membership.
- If `currentCanvas.isDirty === true` or `env.canvasSceneDirty === "true"`, Workbench may still be autosaving. Use the newest autosaved working copy from `canvas_get_document` before patching.
- If `currentCanvas.snapshotImagePath` or `env.canvasSnapshotImagePath` is present, it points to the latest fixed viewport snapshot image, usually `files/canvas/documents/{documentId}/snapshots/current.png`.

## Visual Snapshot Reading

Use `view_image` when visual understanding matters:

- Current board description, visual QA, layout critique, or “what did I draw?”
- Annotation-driven image iteration, such as arrows/text pointing to regions to change
- Comparing what is visible in the viewport with a requested change
- Any task where tldraw JSON alone would be a guess about rendered appearance

Call shape:

```json
{
  "path": "files/canvas/documents/document-id/snapshots/current.png"
}
```

After `view_image` returns, combine the visual evidence with `canvas_get_document` or `canvas_get_record` when exact record edits are needed.

## Tool Contracts

### `canvas_create_document`

Create a managed canvas metadata record. Required input: `title`. Optional inputs: `description`, `kind`, `tags`, `source`, `snapshot`, `viewState`, `selectionSummary`, `changeSummary`.

### `canvas_save_snapshot`

Save a complete valid tldraw snapshot as a new version. Required input: `documentId`, `snapshot`. Optional inputs: `viewState`, `selectionSummary`, `snapshotImage`, `sourceType`, `changeSummary`. Workbench autosaves current viewport images separately; Agents may omit `snapshotImage` when they only have JSON.

### `canvas_patch_records`

Patch the current tldraw snapshot. Required input: `documentId`. Optional inputs: `putRecords`, `removeRecordIds`, `viewStatePatch`, `selectionSummary`, `changeSummary`.

### `canvas_insert_image`

Insert a bitmap into a canvas. Required image input: `dataUrl` or `base64`. Optional positioning inputs: `documentId`, `pageId`, `anchorShapeId`, `placement`, `displayWidth`, `displayHeight`, `matchAnchor`, `shapeMeta`, `assetMeta`.

### `canvas_search_documents`

Find existing canvases by `status`, `kind`, `search`, `page`, and `pageSize`.

### `canvas_get_document`

Read compact canvas metadata, the latest autosaved working-copy scene by default, current version metadata, versions, optional logs, and compact scene summary. Set `includeSnapshot=true` only when a full snapshot is required. Use `versionId` or `versionNumber` to read a historical version.

### `canvas_get_record`

Fetch one exact tldraw record from the latest autosaved working copy by default, or from a requested `versionId` / `versionNumber`. Use this before targeted selected-shape or asset edits.

### `canvas_update_document_status`

Update status to `draft`, `reviewed`, or `archived`. Mark reviewed only after user or workflow confirmation.

### `canvas_report_failure`

Record a failed generation, validation, import, inspection, image insertion, or patch attempt.
