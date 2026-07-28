---
name: story-studio-agent-skill
description: Manage scoped Story Studio projects, structured production plans, Seedance video candidates, browser sequence review, revision-safe Cut handoff, explicit review gates, and failure reporting.
---

# Story Studio Agent Skill

Use Story Studio middleware tools as the project system of record.

1. Search existing projects before creating a duplicate.
2. Create a project only after the user has supplied or approved its title and
   basic production format.
3. Read `story_get_project_summary` before changing an existing project.
4. Pass the returned revision as `baseRevision` to every mutation.
5. Keep `changeSummary` concise and describe the visible business change.
6. Never invent tenant, organization, workspace, user, Assistant, or conversation
   identifiers; the middleware resolves them from trusted runtime context.
7. Save one coherent production document with `story_save_production`: reviewed
   sources, a logline/theme/tone and ordered beats, timed episode scripts, an
   asset bible, and ordered scenes. Give every shot a stable id, composition,
   action, camera direction, and bounded duration.
8. For an asset-bible visual reference, use `seedream_text_to_image` with the
   asset prompt plus the production visual style. Use 3:4 for characters,
   16:9 for locations, and 1:1 for props or style references. After Seedream
   returns a completed Workspace image, refresh the project revision and call
   `story_attach_generated_asset_image` with the exact asset id, Workspace
   path, provider receipt, and `select=true`. Never attach base64 or a provider
   URL.
9. When the user approves video generation, use the configured
   `seedream_aigc` Toolset. For a speaking character with a public
   `voiceReference` URL, use `seedance_multimodal_reference_to_video` in
   `text_image_audio` mode with the selected storyboard frame and reference
   audio. Otherwise use `seedance_image_to_video`. Prefer Seedance 2.0 Fast at
   720p with the project aspect ratio and always set `generate_audio=true`.
   Preserve exact dialogue, speaker, dialogue type, sound effects, and mouth
   behavior in the prompt. If the provider rejects a frame with
   `InputImageSensitiveContentDetected.PrivacyInformation`, retry that shot
   once with `seedance_text_to_video`, the same continuity-rich prompt, and
   `generate_audio=true`. Never replace a failed audio generation with a silent
   fallback.
10. Query each submitted task with `seedance_video_query`. A submitted task is
   not a video result. Continue only when the tool returns a completed status
   and a Workspace MP4.
11. Read the current project revision again, then call
   `story_attach_generated_video` with the exact scene and shot, Workspace
   path, prompt, provider receipt, and `select=true` when the user's generation
   action authorizes replacing the selected still for that shot. Never attach
   base64 or a provider URL.
12. Claim that a shot video exists only after the completed Seedance Workspace
    MP4 has been attached. Story Studio previews selected shot videos directly
    in the browser; do not request or claim a separate animatic render.
13. For professional assembly or export, prepare the versioned
    `StoryCutHandoff v1`, deliver its exact contract to Cut, and record Cut's
    authoritative receipt.
14. Use `story_report_failure` when a requested project operation cannot be
   completed, including a stable failure code and a recoverable flag.
15. Treat moving a project into review, completed, failed, or archived as an
   explicit human-review decision.
