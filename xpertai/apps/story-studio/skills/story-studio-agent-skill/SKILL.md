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
4. Every successful mutation returns `revision`. Use that revision for the next
   update to an existing entity. For a new character, episode, asset, scene, or
   shot id, omit `baseRevision`; the server serializes independent creates on
   the authoritative project revision, so distinct creates may run in parallel.
   Never guess or pre-compute future revisions. On conflict, use
   `currentRevision` from the error or call `story_get_project_revision` once if
   that field is unavailable. Re-read only affected content when retrying could
   overwrite concurrent edits.
5. Keep `changeSummary` concise and describe the visible business change.
6. Never invent tenant, organization, workspace, user, Assistant, or conversation
   identifiers; the middleware resolves them from trusted runtime context.
7. Start production writing with `story_get_production_context`. When
   `exists=false`, call `story_initialize_production` with only the production
   brief. Initialization automatically creates `episode-1` from the project
   title and synopsis. Update that exact id for the first full script; do not
   create another order-1 episode. Never call the legacy `story_save_production` or
   `story_start_production` whole-document contracts.
8. Add exactly one character, episode, asset, scene header, or shot per
   mutation. A character is a `kind=character` asset aggregate containing its
   identity, role, visual description, voice reference, generation prompt, and
   media candidates; there is no separate character collection. Create and
   update it only with `story_upsert_production_character`, and use that asset id
   as `dialogue.speakerId`. Independent new ids may be submitted together with
   no `baseRevision`; existing-id updates must use the exact latest revision.
   `story_upsert_production_scene` never accepts shots; create the scene header,
   then call `story_upsert_production_shot` once per shot. Give every shot a
   stable id, composition, action, camera direction, and bounded duration. Use
   `dialogue: { text, speakerId, type }` only when the shot has spoken text.
   For silent or action-only shots, omit `dialogue` or pass `dialogue=null`;
   never use a speaker id to mean the visible character.
9. Pass every `targetDurationSeconds` as an integer number of seconds, never a
   string, clock value, or localized duration. Validate the completed draft with
   `story_validate_production`; validation is not human approval. On a schema
   type error, correct only the named field and retry once. On malformed args,
   return to production context and continue with one bounded mutation instead
   of reconstructing a whole document. `episode.script` is a JSON string: never
   place raw ASCII double quotation marks inside the script text. Use
   typographic quotation marks such as `“…”` or `「…」` for dialogue and keep
   line breaks as valid JSON string escapes.
10. For an asset-bible reference set, use `seedream_text_to_image` once per
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
11. The user starts paid video generation only through **Generate Take** in the
    Story Studio Workbench. Never call Seedance, Veo, Kling, or any provider
    video submission tool directly from the Agent.
12. Treat durable Story Studio video tasks as the only source of status. Use
    `story_list_shot_video_tasks` or `story_get_video_task` without relying on
    chat history. Use `story_refresh_video_task` only to refresh an existing
    task; it must never create paid work.
13. A Take exists only when its task reports `completed` and includes a
    candidate id. Until then, do not claim success. Do not expose provider task
    ids, provider URLs, Toolset ids, credentials, or raw provider responses.
14. Use `story_cancel_video_task` only after explicit user instruction. Use
    `story_retry_video_task` only after an explicit retry request and never as
    an automatic response to failure. Use `story_select_shot_video` only after
    the user chooses a completed Take. Do not directly attach managed task
    results with `story_attach_generated_video`.
15. For professional assembly or export, prepare the versioned
    `StoryCutHandoff v1`, deliver its exact contract to Cut, and record Cut's
    authoritative receipt.
16. Use `story_report_failure` when a requested project operation cannot be
    completed, including a stable failure code and a recoverable flag.
17. Treat moving a project into review, completed, failed, or archived as an
    explicit human-review decision.
