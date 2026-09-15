---
name: cut-agent-skill
description: Use for Cut project setup, importing media, revision-safe timeline edits, and routing speech, caption, verification, or export work.
---

# Cut basics

## Route by the requested outcome

Use `cut-speech-editing` for speech cleanup or evidence-backed rough cuts, `cut-captions` for transcription and subtitles, `cut-verification` for checking proposals and results, and `cut-export` for rendering and delivery. Load only the workflow needed for the current step through the available skill reader. These skills are packaged with Cut; if one is unavailable, report the missing skill instead of inventing its workflow.

## MCP reads and workflow discovery

The names below describe the shared Cut operations. In standalone MCP, discover
Resource Templates and use `resources/read` for these reads instead of calling
nonexistent tools:

| Operation | Resource URI |
| --- | --- |
| `cut_get_project` | `cut://projects/{projectId}` |
| `cut_get_clip` | `cut://projects/{projectId}/clips/{clipId}` |
| `cut_get_media_asset` | `cut://projects/{projectId}/media/{mediaAssetId}` |
| `cut_get_analysis_job` | `cut://projects/{projectId}/jobs/{jobId}` |
| `cut_get_media_segment` | `cut://projects/{projectId}/segments/{segmentId}` |
| `cut_get_edit_proposal` | `cut://projects/{projectId}/proposals/{proposalId}` |
| `cut_get_caption_draft` | `cut://projects/{projectId}/caption-drafts/{draftId}` |
| `cut_get_export` | `cut://projects/{projectId}/exports/{exportId}` |

Use the discovered optional query parameters for revision checks and caption
pagination. List/search operations remain tools. List exports using
`cut_list_project_resources` with `resource: exports`, then read the exact
`cut_get_export` Resource for its authorized portable file reference. Only use file paths/checksums actually returned by an
authorized interface; if the current surface omits them, report that delivery
or verification gap rather than derive a path from an export ID.

For clients without a skill reader, retrieve the next stage through MCP
`prompts/get`: `cut_plan_rough_cut` includes speech editing,
`cut_translate_captions` includes captions/transcription,
`cut_review_edit_proposal` includes verification, and `cut_prepare_export`
includes export. Each includes the base rules as well.

## Project and file identity

1. In Workbench, the host supplies `cut.currentProject`; middleware may resolve an omitted projectId to that selection. For standalone MCP, pass the exact Cut `projectId` returned by creation or a project read. A Cut project ID is never a platform Assistant ID or file owner.
2. Read `cut_get_project` before edits. Use its current revision as `baseRevision`, and pass `expectedRevision` to bounded reads. Follow `availableReads`: tracks, clips, media assets, and paged project resources. Read all pages needed for the requested scope, not the entire IR.
3. Import through `cut_import_media` with a runtime path or authorized portable file reference. Standalone MCP uploads/downloads use the publication's authenticated HTTP file endpoints and personal-file binding. Reuse returned file references; never fabricate a catalog or pass base64.
4. Use narrow mutations with `changeSummary`. Validate multi-step edits with `cut_apply_batch` before applying. On a conflict, refresh and compare the affected content; never silently overwrite a dirty Workbench or replace the whole project document.
5. Times are seconds. Keep source-media times distinct from project-timeline times. Use media orientation metadata for source facts; preserve clip transforms when changing project settings unless reframing was requested.
6. Create `cut_finalize_version` snapshots only when explicitly requested. Internal revisions are concurrency tokens, not user-visible saved versions.

## Content authorization

Reuse existing user approval for the same edits. Before a write, match the user's instruction to the exact project, affected content/ranges, and operation. An explicit instruction such as deleting specified ranges or committing reviewed captions already authorizes that content change. Inspect evidence and validate it, then proceed without asking the user to approve it again.

A broad outcome such as "make this better" does not approve newly selected destructive cuts. Prepare a concrete proposal with ranges, evidence and impact and ask only for the unresolved decisions. Honor explicit requests to preview or wait. Expanded scope, changed selections or rejected proposals require a new decision. A revision conflict requires re-reading; reuse approval only if the authorized content and effects are still demonstrably identical, and never silently rebase a stale proposal.

Platform authorization is independent: comply with tool confirmation/elicitation, access checks, proposal state and revision CAS. Conversation approval is not a platform approval token and must never bypass those checks.

Completion: report the resulting project ID/revision and actual changes. Report failures with `cut_report_failure`; keep completed writes distinct from pending jobs and unavailable evidence.
