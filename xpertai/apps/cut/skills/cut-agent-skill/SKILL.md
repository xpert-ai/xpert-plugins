---
name: cut-agent-skill
description: Use Cut Agent tools to create video projects, search scoped media evidence, create reviewable edit proposals, apply revision-safe timeline edits, finalize versions, and coordinate browser or Sandbox Job MP4 export.
---

# Cut Agent workflow

1. Call `cut_get_project` before modifying an existing project. It returns only a compact overview, resource counts, the current revision, and `availableReads`; retain that revision.
2. Disclose details progressively. Use `cut_list_tracks` for structure, `cut_list_clips` for bounded filtered pages, `cut_get_clip` for one exact clip, `cut_list_media_assets`/`cut_get_media_asset` for safe media metadata, and `cut_list_project_resources` for one paged collection of jobs, versions, exports, caption drafts, proposals, or logs. Pass `expectedRevision` from `cut_get_project` and refresh the overview on conflict.
3. Never request, reconstruct, or replace the complete project IR through Agent tools. Use narrow mutations or `cut_apply_batch`; the full document is reserved for the Workbench host path.
4. Import media with `cut_import_media`; pass a runtime workspace path or portable file reference, never base64.
5. For a simple explicit edit, use the narrow atomic tool and include `baseRevision` plus a concise `changeSummary`.
6. For a complex, destructive, or goal-level rough cut, search exact evidence with `cut_search_media_segments`, inspect it with `cut_get_media_segment`, and create `cut_create_edit_proposal`. Every proposal item must cite evidence.
7. Let the user review the proposal diff, risk, evidence, and preview in Workbench. Use `cut_update_edit_proposal` only for explicit item decisions, and `cut_apply_edit_proposal` only after approval with exact project and proposal revisions.
8. Never silently apply, rebase, or recreate a stale/rejected proposal. Use `cut_revert_edit_proposal` only after an explicit undo request and only at the exact applied project revision. Never bypass proposal review with a whole-document replacement.
9. Use `cut_update_project_settings` for project width, height, fps, or background. Keep its default `preserve` policy unless the user explicitly asks to reframe the composition with `contain`, `cover`, or `stretch`.
10. Read source orientation only from media `codedWidth`, `codedHeight`, `displayWidth`, `displayHeight`, and `rotationDegrees`. A clip `transform.rotation` is an intentional composition edit, not source metadata; never clear or invert it merely because the project dimensions changed.
11. On revision conflict, reload; never overwrite a dirty Workbench copy.
12. Finalize meaningful milestones with `cut_finalize_version`.
13. For speech cleanup, transcribe the source and run visible Workbench media analysis first. Call `cut_create_speech_cleanup_proposal`; it maps transcript filler cues and silence evidence to the current timeline and proposes end-to-start `ripple_delete_ranges` edits so picture and sound stay synchronized. Show the proposal and apply it only after approval. Retain the exact applied ranges.
14. Add a title cover with `cut_add_cover` only after speech cleanup. It inserts full-canvas color/title tracks, shifts the program later, and increases project duration. Retain its duration as the caption timeline offset.
15. After cleanup and cover insertion, create captions with `cut_create_caption_draft`, passing the exact applied cleanup ranges as `timelineCuts` and the cover duration as `timelineOffsetSeconds`. This retimes transcript cues to the final program timeline.
16. To translate captions, read the complete source draft, translate every cue without changing meaning or timing, and call `cut_create_translated_caption_draft` with one entry for every source `captionId`. For simultaneous bilingual or multilingual burned-in tracks, call `cut_commit_caption_drafts` once with 1–4 same-project-revision drafts; do not commit them sequentially because the first commit advances the project revision.
17. Use the Workbench browser export for an immediate one-off render and whenever referenced media exceeds the Sandbox Job input limit of 350 MiB. The Workbench disables Headless MP4 and explains this fallback before submission. For durable, background, multi-size, templated, or localized-media output whose referenced media stays within that limit, call `cut_start_headless_export` at the exact current `baseRevision`. Submit at most five variants; template values replace `{{variable}}` in text clips, and `mediaAssetMap` explicitly maps a source asset UUID to another compatible imported project asset UUID. Every media clip must refer to an imported `mediaAssetId`.
18. Poll each returned job with `cut_get_analysis_job`. Do not claim the MP4 is saved until status is `succeeded` and `resultExportId` is present. Use `cut_cancel_analysis_job` for explicit cancellation; retry failures by their machine-readable `failureCode` rather than changing the project snapshot.
19. Record import, validation, media-load, save, or export failures with `cut_report_failure`.

The project document is versioned schema `1`. Time values are seconds. Clips may not extend beyond the project duration. `split.at` is absolute project time; trim and move times are also absolute project time.
