---
name: cut-captions
description: Use for transcription, subtitle import, cue correction, translation, timeline retiming, and committing reviewed caption tracks.
---

# Cut captions

Load `cut-agent-skill` first for identity, authorization and revision rules.

1. Reuse a successful transcript or suitable draft for the same source before starting another job. For a new backend transcription, default to `mode: sandbox_whisper`; it uses the fixed Runtime Whisper model without an Assistant or external model provider. Use `platform` only on an explicit user request when native Assistant-based STT context and provider are available; standalone MCP uses Sandbox Whisper. If the explicit platform request fails, report the error rather than silently switching engines. Do not invent standalone model binding or configure `runtime.transcription`. Browser-local Whisper is a user-triggered Workbench action, not a backend mode.
2. Use `language: zh`, `en`, or `und` as appropriate. Poll the returned `cut_get_analysis_job` until terminal status; only use a transcript after `succeeded` and a result transcript ID. Resume an existing queued/running job instead of duplicating it. On failure report the job ID, stage and error; cancel only when requested.
3. Read the relevant transcript segments and timing provenance. Estimated or unavailable timing is not model-aligned: return the recognized text and explain that alignment is required, then stop before creating, committing or exporting synchronized captions. With reliable timestamps, check silence, repetitions and omitted words in small-model output. Import existing SRT/VTT/ASS with `cut_import_subtitle` when that is the requested source.
4. After applied cuts and an optional requested cover, use `cut_create_caption_draft` with the exact source-time `timelineCuts` and `timelineOffsetSeconds`. Verify source-to-timeline mapping against the edited clips, especially repeated media or playback-rate changes; do not blindly pass project-time ranges as source cuts.
5. Read all draft pages needed for correction or translation. Use `cut_update_caption_draft` for corrections. For `cut_create_translated_caption_draft`, provide exactly one translation per source `captionId`, preserving meaning and timing. Keep the source draft intact.
6. Apply the base content-authorization rule before committing. A request to generate and commit captions authorizes that workflow; a request to preview first stops at the draft. Commit 1-4 language drafts atomically with `cut_commit_caption_drafts` for multilingual tracks. Use current project `baseRevision` and each draft's current revision; draft `sourceRevision` is provenance, not a requirement that all drafts share the same project revision.
7. Verify first/last cues, cut boundaries, cover offset and language-track overlap with `cut-verification`. Export subtitle files with `cut_export_subtitle` only when requested. Completion identifies committed tracks or review-pending draft IDs, plus any unverified transcription accuracy.
