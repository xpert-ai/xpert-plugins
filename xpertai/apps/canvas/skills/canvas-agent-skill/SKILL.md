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
- Seedream AIGC: the Canvas Assistant template should include `@xpert-ai/plugin-volcengine` and the `seedream_aigc` builtin toolset with `seedream_text_to_image` enabled for text-to-image generation before image insertion.

Do not treat Workbench view actions as Agent middleware tools. Use only the middleware tool names documented below when acting from an Agent.

## Core Rules

1. Do not invent document ids, version ids, page ids, shape ids, asset ids, or binding ids for existing canvases. Use Workbench context, `canvas_search_documents`, `canvas_get_document`, or `canvas_get_record`.
2. Before editing an existing canvas, call `canvas_get_document` unless the current prompt already contains trustworthy Workbench context with the document id and version ref. By default this reads the latest autosaved working copy.
3. Prefer `canvas_patch_records` for targeted edits; it updates the working copy and does not create a version. Use `canvas_save_snapshot` only when the user explicitly asks for a new version, full snapshot import, or intentional complete replacement.
4. Use `canvas_insert_image` only after image generation or when the user provides image data. Pass `dataUrl`, `base64`, or `workspaceFilePath`; the tool stores image data inside tldraw asset records for v1. If a generation tool labels the path as `workspacePath` or `filePath`, copy that value into `workspaceFilePath`.
5. If `env.canvasDocumentId` is present, pass it as `documentId`; do not call `canvas_create_document` for image insertion or updates to the current Workbench canvas.
6. If `env.canvasInsertionTargetJson` is present, parse it and pass it as `target` to `canvas_insert_image`. For AI image holder frames, this compact target includes the holder `shapeId`, `pageId`, `width`, and `height`.
7. After `canvas_insert_image` succeeds, do not call `canvas_save_snapshot` unless the user asked for a whole-canvas replacement and you have a complete valid tldraw snapshot.
8. Do not delete or move annotations unless the user explicitly asks. Annotation arrows and notes are review evidence.
9. Do not claim a canvas was saved unless the tool call succeeded. Tool results are the source of truth.
10. Do not route logic from display text or localized labels. Use explicit fields such as `selection.type`, `selectedShapeIds`, `kind`, `status`, and `sourceType`.
11. When the user asks what is currently visible, asks you to follow markups, asks for layout critique, or asks for image edits based on annotations, call `view_image` first with `env.canvasSnapshotImagePath` or the `snapshotImagePath` returned by `canvas_get_document`.

## Workbench Selection Context

The Workbench can send `assistant.context.set` when the user selects shapes. That request state is not automatically visible to the model unless the assistant prompt renders it through prompt variables.

When the prompt includes these variables, use them before searching broadly:

- `env.canvasDocumentId`
- `env.canvasVersionId`
- `env.canvasPageId`
- `env.canvasSelectionJson`
- `env.canvasSelectedShapeJson`
- `env.canvasInsertionTargetJson`
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
    "insertionTarget": {
      "type": "canvas.insertionTarget.v2",
      "documentId": "document-id",
      "pageId": "page:page",
      "shapeId": "shape:id",
      "width": 512,
      "height": 683
    },
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
          "pageId": "page:page",
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
- If `env.canvasInsertionTargetJson` or `currentCanvas.insertionTarget` exists, use it directly as the `canvas_insert_image` positioning payload after image generation.
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

## Seedream Text-To-Image Flow

Use `seedream_text_to_image` when the user asks to create, fill, replace, or place an AI-generated image on the Canvas.

1. Read `env.canvasInsertionTargetJson` first. If it is non-empty and not null, use it as the exact Canvas insertion target.
2. Otherwise read `env.canvasContextJson`. If exactly one selected shape has `isAiImageHolder`, `meta.canvasAiImageHolder`, or `meta.cowartAiImageHolder`, treat it as the target holder.
3. For a holder target, use its `width` and `height` as the target display size, and include the target size and aspect ratio in the Seedream prompt so the generated image is composed for that slot.
4. Choose the Seedream `size` by aspect ratio:
   - `1:1` -> `2048x2048`
   - `3:2` -> `2496x1664`
   - `2:3` -> `1664x2496`
   - `4:3` -> `2304x1728`
   - `3:4` -> `1728x2304`
   - `16:9` -> `2560x1440`
   - `9:16` -> `1440x2560`
   - fallback -> `2048x2048`
5. Call `seedream_text_to_image` with the final visual prompt and chosen `size`. Do not call `canvas_insert_image` until Seedream returns a generated file.
6. From the Seedream result, pass `workspaceFilePath`, plus `mimeType` when useful, into `canvas_insert_image`.
7. Always pass `documentId` from `env.canvasDocumentId` or the insertion target when present. For holder targets, pass the parsed insertion target as `target`; the inserted image becomes a child of the holder and moves with it.
8. If no holder is selected, do not ask the user to create one. Insert the generated image into the current page using `pageId` when available, a requested display size when provided, or the generated bitmap aspect ratio.
9. Do not call `canvas_save_snapshot` after `canvas_insert_image` succeeds. The insertion tool updates the current working copy and does not create a version.

## Tool Contracts

### `canvas_create_document`

Create a managed canvas metadata record. Required input: `title`. Optional inputs: `description`, `kind`, `tags`, `source`, `snapshot`, `viewState`, `selectionSummary`, `changeSummary`. Do not use this when `env.canvasDocumentId` identifies the current Workbench canvas.

### `canvas_save_snapshot`

Save a complete valid tldraw snapshot as a new version. Required input: `documentId`, `snapshot`. Optional inputs: `viewState`, `selectionSummary`, `snapshotImage`, `sourceType`, `changeSummary`. Workbench autosaves current viewport images separately; Agents may omit `snapshotImage` when they only have JSON. Do not call this after `canvas_insert_image` unless the user explicitly asked for a new version or you are replacing the whole canvas with a complete snapshot.

### `canvas_patch_records`

Patch the current tldraw working copy without creating a version. Required input: `documentId`. Optional inputs: `putRecords`, `removeRecordIds`, `viewStatePatch`, `selectionSummary`, `changeSummary`.

### `canvas_insert_image`

Insert a bitmap into the current canvas working copy without creating a version. Required image input: `dataUrl`, `base64`, or `workspaceFilePath`. Pass `documentId` for the current canvas. Optional `target` accepts the compact Workbench insertion target with `documentId`, `pageId`, `shapeId`, `width`, and `height`; Canvas infers holder filling, replacement, page placement, and asset metadata.

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
