---
name: motion-agent-skill
description: Use the Motion Workbench to create motion artifacts, including animated HTML and video compositions, with human review.
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
- `motion_create_project`: create a project from title, brief, selected recipes, HTML, or video composition.
- `motion_get_project`: retrieve working copy, versions, exports, and logs.
- `motion_save_web_artifact`: persist a complete HTML document with Motion runtime attributes.
- `motion_save_video_composition`: persist a JSON video composition.
- `motion_finalize_version`: create a reviewable version from the current working copy.
- `motion_export_artifact`: export text artifacts. For MP4/GIF, use the Workbench browser exporter and save through the file action.
- `motion_update_project_status`: mark draft, reviewed, archived, or failed.
- `motion_report_failure`: record failed operations and evidence.

## HTML Motion Rules

HTML artifacts must be complete HTML documents. Use Motion attributes on editable elements:

- Triggers: `load`, `scroll`, `hover`, `click`.
- Verbs: `fade`, `slide-up`, `slide-down`, `slide-left`, `slide-right`, `zoom`, `rotate`, `blur`, `pop`, `pulse`, `shake`, `wobble`, `sink`.
- Tracks: serialize `opacity`, `x`, `y`, `scale`, `rotate`, and `blur` into `data-ma-tracks` when custom timing matters.

Keep motion useful and restrained. Always preserve reduced-motion behavior by relying on the injected runtime.

## Video Composition Rules

Video compositions are JSON objects with:

- `w`, `h`, `fps`, `bg`, and `duration`.
- `layers` for simple one-scene videos.
- `scenes` for launch-video sequences.
- `shared` for backgrounds or persistent layers.
- Layer tracks for `opacity`, `x`, `y`, `scale`, `rotate`, and `blur`.

Prefer kinetic typography, clear scene pacing, simple transitions, and a small number of meaningful visual moments.

## Failure Handling

When a save, validation, export, or recipe lookup fails:

1. Call `motion_report_failure`.
2. Include the operation name and compact evidence.
3. Continue with a smaller recoverable artifact when possible.

## Review Loop

After saving, tell the user to review in Motion Workbench. Finalize a version only after the artifact is coherent enough for comparison or export.
