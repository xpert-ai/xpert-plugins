---
name: motion-agent-skill
description: Use the Motion Workbench to create animated HTML and native HyperFrames video compositions, with legacy-video compatibility and human review.
---

Use this skill when creating, editing, reviewing, versioning, or exporting Motion artifacts through the Xpert Motion plugin.

## Goal

Turn natural-language intent into a tasteful Motion project:

1. Search or inspect Motion recipes.
2. Create a scoped Motion project.
3. Save animated HTML or video composition working copies.
4. Finalize reviewable versions.
5. Export artifacts through workspace files.
6. Report failures with recoverable evidence.

## Tools

Use the tools in this order unless the user asks for a direct lookup:

- `motion_search_recipes`: find recipes by query, surface, target, runtime, export kind, and status.
- `motion_get_recipe`: inspect a selected recipe manifest, skill text, and implementation files.
- `motion_create_project`: create a project from title, brief, selected recipes, HTML, or native HyperFrames source. A new `video` project defaults to HyperFrames.
- `motion_get_project`: retrieve working copy, versions, exports, and logs.
- `motion_save_web_artifact`: persist a complete HTML document with Motion runtime attributes.
- `motion_save_hyperframes_composition`: persist a complete self-contained native HyperFrames HTML composition. Use this for new video projects.
- `motion_save_video_composition`: persist a JSON composition only when `motion_get_project` identifies the existing project as `legacy_canvas`.
- `motion_finalize_version`: create a reviewable version from the current working copy.
- `motion_export_artifact`: export text artifacts. MP4/GIF on HyperFrames projects queues Producer; legacy projects continue to use the Workbench browser exporter.
- `motion_update_project_status`: mark draft, reviewed, archived, or failed.
- `motion_report_failure`: record failed operations and evidence.

## HTML Motion Rules

HTML artifacts must be complete HTML documents. Use Motion attributes on editable elements:

- Triggers: `load`, `scroll`, `hover`, `click`.
- Verbs: `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `zoom`, `rotate`, `blur`, `pop`, `pulse`, `shake`, `wobble`, `sink`.
- Tracks: serialize `opacity`, `x`, `y`, `scale`, `rotate`, and `blur` into `data-ma-tracks` when custom timing matters.

Keep motion useful and restrained. Always preserve reduced-motion behavior by relying on the injected runtime.

## HyperFrames Video Rules

New video projects use a complete native HyperFrames HTML document as the source of truth:

- Include one root with `data-composition-id`, positive `data-width`, `data-height`, and `data-duration`.
- Give editable elements stable `data-hf-id` values and explicit `data-start` / `data-duration` timing when relevant.
- Keep the document self-contained. Inline CSS, scripts, fonts, and data-URI media; production Sandbox Jobs have no network access.
- Use the public HyperFrames SDK document model. Preview is handled by Player; production MP4/GIF is handled by Producer.
- Never require or generate a HyperFrames Studio embedding.
- After saving, use `motion_export_artifact` with `mp4` or `gif` to queue a production render. Report the queued state truthfully; do not claim completion until the export record is `succeeded`.

## Legacy Video Compatibility

Only existing `legacy_canvas` projects use JSON compositions with:

- `w`, `h`, `fps`, `bg`, and `duration`.
- `layers` for simple one-scene videos.
- `scenes` for launch-video sequences.
- `shared` for backgrounds or persistent layers.
- Layer tracks for `opacity`, `x`, `y`, `scale`, `rotate`, and `blur`.

Canvas/WebCodecs is retained for quick local preview and historical-project export. Do not convert a legacy project implicitly, and do not add new engine-level features to this path.

## Failure Handling

When a save, validation, export, or recipe lookup fails:

1. Call `motion_report_failure`.
2. Include the operation name and compact evidence.
3. Continue with a smaller recoverable artifact when possible.

## Review Loop

After saving, tell the user to review in Motion Workbench. Finalize a version only after the artifact is coherent enough for comparison or export.
