---
name: story-studio-agent-skill
description: Manage scoped Story Studio projects, structured production plans, Seedance video candidates, browser sequence review, revision-safe Cut handoff, explicit review gates, and failure reporting.
---

# Story Studio Agent Skill

Use Story Studio middleware tools as the project system of record.

1. Search existing projects before creating a duplicate.
2. Create a project only after the user has supplied or approved its title and
   basic production format.
3. For the first mutation, use the trusted revision from Workbench context,
   project creation/search, or a content read such as `story_get_production`.
   If no trusted revision exists, call `story_get_project_revision`, which
   returns only the project id and revision. Do not read the full project summary
   only to obtain a revision number.
4. Every successful mutation returns `revision`; chain it into the next call as
   `baseRevision`. On conflict, use `currentRevision` from the error or call
   `story_get_project_revision` once if that field is unavailable. Re-read only
   affected content when retrying could overwrite concurrent edits.
5. Keep `changeSummary` concise and describe the visible business change.
6. Never invent tenant, organization, workspace, user, Assistant, or conversation
   identifiers; the middleware resolves them from trusted runtime context.
7. To create the first saved production document, prefer
   `story_start_production` with the production basis, declared characters, and
   exactly one first scene. Use `story_save_production` only when you already
   have one coherent complete document: reviewed sources, a logline/theme/tone
   and ordered beats, timed episode scripts, an asset bible, and ordered scenes.
8. After a production document exists, prefer `story_upsert_production_scene`
   for one scene and `story_upsert_production_shot` for one shot. Give every
   shot a stable id, composition, action, camera direction, and bounded duration.
   In the smaller tools, use
   `dialogue: { text, speakerId, type }` only when the shot has spoken text.
   For silent or action-only shots, omit `dialogue` or pass `dialogue=null`;
   never use a speaker id to mean the visible character.
9. For an asset-bible reference set, use `seedream_text_to_image` once per
   requested continuity view or expression with the asset prompt plus the
   production visual style. Use 3:4 for characters, 16:9 for locations, and
   1:1 for props or style references. Call
   `story_attach_generated_asset_image` sequentially for each completed
   Workspace image with the exact asset id, Workspace path, provider receipt,
   current `baseRevision`, and the exact `assetReference` requested by the
   Workbench. Use `select=true` only for the primary continuity view and never
   for an expression. Use each successful attachment receipt revision as the
   next `baseRevision`; do not read a project summary between attachments.
   Never attach base64 or a provider URL.
10. The user starts paid video generation only through **Generate Take** in the
    Story Studio Workbench. Never call Seedance, Veo, Kling, or any provider
    video submission tool directly from the Agent.
11. Treat durable Story Studio video tasks as the only source of status. Use
    `story_list_shot_video_tasks` or `story_get_video_task` without relying on
    chat history. Use `story_refresh_video_task` only to refresh an existing
    task; it must never create paid work.
12. A Take exists only when its task reports `completed` and includes a
    candidate id. Until then, do not claim success. Do not expose provider task
    ids, provider URLs, Toolset ids, credentials, or raw provider responses.
13. Use `story_cancel_video_task` only after explicit user instruction. Use
    `story_retry_video_task` only after an explicit retry request and never as
    an automatic response to failure. Use `story_select_shot_video` only after
    the user chooses a completed Take. Do not directly attach managed task
    results with `story_attach_generated_video`.
14. For professional assembly or export, prepare the versioned
    `StoryCutHandoff v1`, deliver its exact contract to Cut, and record Cut's
    authoritative receipt.
15. Use `story_report_failure` when a requested project operation cannot be
   completed, including a stable failure code and a recoverable flag.
16. Treat moving a project into review, completed, failed, or archived as an
   explicit human-review decision.
