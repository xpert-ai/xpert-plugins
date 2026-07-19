---
name: canvas-agent-skill
description: "Use when an Agent needs to use @xpert-ai/plugin-canvas middleware tools to create, inspect, patch, review, annotate, insert images into, or recover tldraw Canvas working copies, including Workbench selection context and AI image holders."
---

# Canvas Agent Skill

Use this skill when a user asks an Agent to create, update, inspect, review, annotate, or recover a Canvas document through the Xpert Canvas plugin.

The plugin has two surfaces:

- Workbench: the human review and editing surface. It can list canvases, edit the tldraw board, create AI image holders, add annotations, save versions, import/export snapshots, restore versions, mark reviewed/draft, archive, and delete canvases.
- Middleware tools: the Agent-callable system of record. These tools create Canvas metadata, apply bounded tldraw record stages, insert images, progressively query records, update lifecycle status, and report failures. Complete snapshot and version creation are not model-visible.
- View image: the Canvas Assistant template should include `@xpert-ai/plugin-view-image`. Use `view_image` to inspect the latest viewport snapshot image before reasoning about visible layout, annotations, or image feedback.
- Seedream AIGC: the Canvas Assistant template should include `@xpert-ai/plugin-volcengine` and the `seedream_aigc` builtin toolset with `seedream_text_to_image` enabled for text-to-image generation before image insertion.

Do not treat Workbench view actions as Agent middleware tools. Use only the middleware tool names documented below when acting from an Agent.

## Core Rules

1. Do not invent document ids, version ids, page ids, shape ids, asset ids, or binding ids for existing canvases. Use Workbench context, `canvas_search_documents`, `canvas_get_document`, `canvas_list_records`, or `canvas_get_record`.
2. Before editing an existing canvas, call `canvas_get_document` unless the prompt already supplies a trustworthy current revision. This is a compact summary; it does not return the scene.
3. Apply edits through `canvas_patch_records` in visible stages of at most 12 shape or record operations. Before calling, count `createShapes + updateRecords + removeRecords`; if the total exceeds 12, split the plan first, preferably into stages of 6–8 operations. The first creation call is not an exception. Create new content with simplified `createShapes`; never construct a raw tldraw create record or send a complete snapshot. Agent edits update only the working copy and never create a version.
4. Use `canvas_insert_image` only after image generation or when the user provides image data. Pass `dataUrl`, `base64`, or `workspaceFilePath`; the tool stores image data inside tldraw asset records for v1. If a generation tool labels the path as `workspacePath` or `filePath`, copy that value into `workspaceFilePath`.
5. If `env.canvasDocumentId` is present, pass it as `documentId`; do not call `canvas_create_document` for image insertion or updates to the current Workbench canvas.
6. If `env.canvasInsertionTargetJson` is present, parse it and pass it as `target` to `canvas_insert_image`. For AI image holder frames, this compact target includes the holder `shapeId`, `pageId`, `width`, and `height`.
7. Version creation is human-only. If the user requests a checkpoint, finish the working-copy edits and tell them to click **New version** in the Workbench version panel; do not attempt a version tool call.
8. Do not delete or move annotations unless the user explicitly asks. Annotation arrows and notes are review evidence.
9. Do not claim a canvas was saved unless the tool call succeeded. Tool results are the source of truth.
10. Do not route logic from display text or localized labels. Use explicit fields such as `selection.type`, `selectedShapeIds`, `kind`, `status`, and `sourceType`.
11. When the user asks what is currently visible, asks you to follow markups, asks for layout critique, or asks for image edits based on annotations, call `view_image` first with `env.canvasSnapshotImagePath` from trusted Workbench context.

## Progressive Read And Staged Write Flow

1. Call `canvas_get_document` for status, record counts, checksum, and `workingCopyRevision`.
2. Call `canvas_list_records` with that exact revision and narrow filters. Follow `nextCursor` only while `hasMore` is true.
3. Call `canvas_get_record` only for records that need exact inspection before an update or removal.
4. Use one stable `batchId` for the user request. Each `canvas_patch_records` stage uses a new `operationId`, increasing `stageIndex`, a short `stageLabel`, and `isFinalStage=true` only on the final stage.
5. Chain the `workingCopyRevision` from each receipt into the next stage's `baseRevision`.
6. Perform a batch preflight before every mutation: count all three operation arrays, and do not call while the total is above 12. For a 16-shape plan, submit 8 semantically related shapes, wait for the receipt, then submit the remaining 8 with the same `batchId`, the next `stageIndex`, a new `operationId`, and the returned `workingCopyRevision` as `baseRevision`.
7. Use `createShapes` for new `text`, `geo`, `note`, `frame`, or `arrow` shapes. Supply plain text and semantic geometry/style fields; Canvas generates omitted ids, the default/only page, valid indices, complete tldraw defaults, and richText. Never pass `createRecords`.
8. Omit a new shape `id` unless another entry in the same stage must refer to it as `parentId`. Omit `parentId` only for an empty or single-page Canvas; discover and pass the page id when multiple pages exist.
9. Use `updateRecords` or `removeRecords` with the checksum returned by a list/get read for existing ids. Reuse an `operationId` only to retry the exact same payload. If content changes or a checksum conflicts, reread the affected record and use a new operation id.

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
- Use compact `selection.shapes` only for orientation, bounds, and intent. Fetch the exact allowlisted record and checksum with `canvas_get_record` before changing geometry, style, bindings, text, asset refs, or page membership.
- If `env.canvasInsertionTargetJson` or `currentCanvas.insertionTarget` exists, use it directly as the `canvas_insert_image` positioning payload after image generation.
- If `currentCanvas.isDirty === true` or `env.canvasSceneDirty === "true"`, Workbench may still be synchronizing. Read a fresh `canvas_get_document` summary before patching.
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

After `view_image` returns, combine the visual evidence with `canvas_get_document`, filtered `canvas_list_records`, and `canvas_get_record` only when exact record edits are needed.

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
9. Do not create a version after `canvas_insert_image` succeeds. The insertion tool updates only the current working copy; version creation remains a human Workbench action.

## Tool Contracts

### `canvas_create_document`

Create a managed Canvas metadata record only. Required input: `title`. Optional inputs: `description`, `kind`, `tags`, `source`, `changeSummary`. It never accepts a snapshot. Add content in later `createShapes` stages; the first stage creates a default page when the Canvas is empty. Do not use this when `env.canvasDocumentId` identifies the current Workbench canvas.

### `canvas_patch_records`

Apply one bounded, idempotent stage without creating a version. Required inputs: `documentId`, `operationId`, `batchId`, `stageIndex`, `stageLabel`, `isFinalStage`, `baseRevision`, `changeSummary`, plus at least one `createShapes`, `updateRecords`, or `removeRecords` operation. A stage may contain at most 12 operations; count all three arrays before calling and prefer semantic stages of 6–8 operations. `createShapes` accepts strict simplified `text`, `geo`, `note`, `frame`, and `arrow` DTOs; Canvas generates complete tldraw records and converts plain text to richText. Existing-record updates/removals require their current checksum.

Minimal creation example:

```json
{
  "createShapes": [
    { "type": "text", "x": 100, "y": 100, "text": "Hello" },
    { "type": "geo", "x": 100, "y": 180, "width": 240, "height": 120, "text": "Task", "fill": "semi" },
    { "type": "arrow", "start": { "x": 340, "y": 240 }, "end": { "x": 460, "y": 240 }, "text": "Next" }
  ]
}
```

### `canvas_insert_image`

Insert a bitmap into the current canvas working copy without creating a version. Required image input: `dataUrl`, `base64`, or `workspaceFilePath`. Pass `documentId` for the current canvas. Optional `target` accepts the compact Workbench insertion target with `documentId`, `pageId`, `shapeId`, `width`, and `height`; Canvas infers holder filling, replacement, page placement, and asset metadata.

### `canvas_search_documents`

Find existing canvases by `status`, `kind`, `search`, `page`, and `pageSize`.

### `canvas_get_document`

Read compact Canvas identity, status, revision, checksum, and record counts. It never returns scene records or a snapshot.

### `canvas_list_records`

List up to 40 record summaries at an exact `expectedRevision`. Filter by `typeNames`, `shapeTypes`, `pageId`, `parentId`, or `query`; follow the opaque cursor only while `hasMore` is true.

### `canvas_get_record`

Fetch one exact allowlisted working-copy record at an exact `expectedRevision`. Use its checksum before updating or removing that record.

### `canvas_update_document_status`

Update status to `draft`, `reviewed`, or `archived`. Mark reviewed only after user or workflow confirmation.

### `canvas_report_failure`

Record a failed generation, validation, import, inspection, image insertion, or patch attempt.
