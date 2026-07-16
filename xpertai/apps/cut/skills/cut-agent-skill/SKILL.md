---
name: cut-agent-skill
description: Use Cut Agent tools to create video projects, search scoped media evidence, create reviewable edit proposals, apply revision-safe timeline edits, finalize versions, and coordinate browser or Sandbox Job MP4 export.
---

# Cut Agent workflow

1. Call `cut_get_project` before modifying an existing project and retain its revision.
2. Import media with `cut_import_media`; pass a runtime workspace path or portable file reference, never base64.
3. For a simple explicit edit, use the narrow atomic tool and include `baseRevision` plus a concise `changeSummary`.
4. For a complex, destructive, or goal-level rough cut, search exact evidence with `cut_search_media_segments`, inspect it with `cut_get_media_segment`, and create `cut_create_edit_proposal`. Every proposal item must cite evidence.
5. Let the user review the proposal diff, risk, evidence, and preview in Workbench. Use `cut_update_edit_proposal` only for explicit item decisions, and `cut_apply_edit_proposal` only after approval with exact project and proposal revisions.
6. Never silently apply, rebase, or recreate a stale/rejected proposal. Use `cut_revert_edit_proposal` only after an explicit undo request and only at the exact applied project revision. Never bypass proposal review with `cut_save_project`.
7. Use `cut_save_project` only when a complete IR replacement is genuinely required.
8. Use `cut_update_project_settings` for project width, height, fps, or background. Keep its default `preserve` policy unless the user explicitly asks to reframe the composition with `contain`, `cover`, or `stretch`.
9. Read source orientation only from media `codedWidth`, `codedHeight`, `displayWidth`, `displayHeight`, and `rotationDegrees`. A clip `transform.rotation` is an intentional composition edit, not source metadata; never clear or invert it merely because the project dimensions changed.
10. On revision conflict, reload; never overwrite a dirty Workbench copy.
11. Finalize meaningful milestones with `cut_finalize_version`.
12. Use the Workbench browser export for an immediate one-off render. For durable, background, multi-size, templated, or localized-media output call `cut_start_headless_export` at the exact current `baseRevision`. Submit at most five variants; template values replace `{{variable}}` in text clips, and `mediaAssetMap` explicitly maps a source asset UUID to another compatible imported project asset UUID. Every media clip must refer to an imported `mediaAssetId`.
13. Poll each returned job with `cut_get_analysis_job`. Do not claim the MP4 is saved until status is `succeeded` and `resultExportId` is present. Use `cut_cancel_analysis_job` for explicit cancellation; retry failures by their machine-readable `failureCode` rather than changing the project snapshot.
14. Record import, validation, media-load, save, or export failures with `cut_report_failure`.

The project document is versioned schema `1`. Time values are seconds. Clips may not extend beyond the project duration. `split.at` is absolute project time; trim and move times are also absolute project time.
