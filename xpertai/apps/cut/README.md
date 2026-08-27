# Cut

Cut is an Agentic non-linear video editor for Xpert. It combines a remote React Workbench, scoped project persistence, Workspace Files media, revision-safe Agent timeline operations, reviewable AI captions, in-browser MP4 export, and bounded background MP4 rendering through Managed Queue and Sandbox Jobs.

The first implementation is pinned to OpenCut's `pre-rewrite` tag at commit `238750c0250650f1254cf7a4738f8e8c8a0c268c`. See `assets/upstream/ATTRIBUTION.md`. The plugin deliberately owns a compact versioned IR instead of persisting OpenCut internals so a future OpenCut Editor API/headless adapter can be added without rewriting Xpert persistence.

The MP4 exporter renders H.264 video and, when AAC encoding is available, mixes explicit unmuted audio-track clips into the output. One-off exports run in Workbench; durable background, templated, and multi-aspect exports run through the registered `cut.render-mp4@1.1.5` Sandbox Action with fixed revision snapshots, portable Workspace Files inputs, resource limits, cancellation, retry, and traceable outputs. See [`docs/AI-PRODUCT-ROADMAP.zh-CN.md`](docs/AI-PRODUCT-ROADMAP.zh-CN.md) for the OpenCut AI comparison and staged Agentic product plan, [`docs/EDITOR-API-ROADMAP.md`](docs/EDITOR-API-ROADMAP.md) for the evidence required before adopting a future OpenCut API/headless runtime, [`docs/GATE-VERIFICATION.md`](docs/GATE-VERIFICATION.md) for the executable Workbench gate harness, and [`docs/GOAL-COMPLETION-AUDIT.zh-CN.md`](docs/GOAL-COMPLETION-AUDIT.zh-CN.md) for the completed requirement-by-requirement audit and real-host evidence.

Server transcription runs as a Managed Queue job against the current Xpert's configured Speech-to-Text model. It stores only a portable Workspace Files reference in the queue payload, supports idempotent start/retry/cancellation, and creates a reviewable caption draft rather than writing unreviewed text directly to the timeline. Current shared STT providers return plain text, so generated cue timings are explicitly marked as estimated until a timestamp-capable provider contract is available.

Local Workbench transcription runs Transformers.js/Whisper in an isolated browser Worker. It loads the pinned ONNX Runtime browser files and Whisper Q4 model only after the user starts transcription, reuses browser caches, decodes and resamples media to 16 kHz mono, and does not upload media bytes to the Xpert server. The `sandbox_whisper` mode remains network-disabled: it resolves the exact `Xenova/whisper-tiny:q4` model and ONNX Runtime from the hash-verified `browser/ai-playwright-1.61/v1` Runtime Artifact instead of carrying them in the Cut npm package. Local jobs can be cancelled by terminating the Worker. WebGPU remains disabled until its JSEP runtime has a separate compatibility gate.

Local media intelligence turns project assets into scoped, queryable evidence without changing the timeline. The Workbench computes audio activity/silence intervals and sampled video shot boundaries in the browser, then persists the completed evidence with project revision and content-hash idempotency protection. Agent tools can search transcript, audio, and shot evidence by media/time range and retrieve an exact segment; every result includes a media locator, time range, evidence type, relevance score, and preview URL plus thumbnail time. OCR, visual descriptions, embeddings, and server-side background video analysis remain later extensions.

Evidence-backed edit proposals separate Agent planning from timeline mutation. A proposal is bound to an exact source revision and snapshot; every bounded operation cites validated media-segment evidence and receives a system-enforced risk floor. Workbench users can inspect the diff and read-only timeline preview, enable or disable individual items, reject the proposal, or atomically apply it. Apply/revert use recoverable compare-and-swap state machines: retries are idempotent, stale proposals cannot overwrite the project, and reverting is allowed only before any later edit.

## MCP publication

Cut has one business implementation and two host-managed entry points. Agent middleware and MCP Publication both execute the same project, media, timeline, caption, proposal, and export operations through `CutMiddleware`. MCP does not maintain a second Cut document model or editing kernel.

Cut is a host-native MCP capability provider:

- The plugin contributes the `cut` native Toolset through `.xpertai-plugin/plugin.json`.
- The Toolset is installed independently from the Cut App, Cut Assistant Template, and Cut Agent Skill.
- Xpert discovers the native declarations and publishes selected capabilities through an authenticated MCP Streamable HTTP service.
- Xpert owns API Key/OAuth authentication, approval policy, rate limits, audit, Tasks, and the public endpoint.
- Cut does not start a stdio child process. `XPERT_MCP_STDIO_RUNTIME_ENABLED` is not required for these capabilities.
- The former `cut_ir_create_project`, `cut_ir_validate_project`, `cut_ir_apply_operations`, and `cut_ir_compare_projects` compatibility tools and their standalone MCP server have been removed.

### Capability model

The original 50 `CutMiddleware` operations are classified exactly once as 43 Tools or 7 Resource Templates. Two of the 43 Tools additionally support the MCP Task execution mode. The four workflow Prompts are separate guidance templates and are not counted as original operations.

| MCP capability | Count | Meaning |
| --- | ---: | --- |
| Tools | 43 | Mutations, searches, list operations, imports, proposal/caption workflows, and lifecycle commands. |
| Resource Templates | 7 | Read-only lookup operations exposed as `cut://` resources rather than duplicate Tools. |
| Task-capable Tools | 2 | Long-running transcription and headless export; these are included in the 43 Tools. |
| Prompts | 4 | Multilingual rough-cut, proposal-review, caption-translation, and export workflows. |

The Resource Templates are:

| Capability key | URI template |
| --- | --- |
| `cut_get_project` | `cut://projects/{projectId}` |
| `cut_get_clip` | `cut://projects/{projectId}/clips/{clipId}` |
| `cut_get_media_asset` | `cut://projects/{projectId}/media/{mediaAssetId}` |
| `cut_get_analysis_job` | `cut://projects/{projectId}/jobs/{jobId}` |
| `cut_get_media_segment` | `cut://projects/{projectId}/segments/{segmentId}` |
| `cut_get_edit_proposal` | `cut://projects/{projectId}/proposals/{proposalId}` |
| `cut_get_caption_draft` | `cut://projects/{projectId}/captions/{draftId}` |

The Task-capable Tools are:

- `cut_start_transcription`
- `cut_start_headless_export`

Both declare optional Task execution with a maximum lifetime of one hour. A compatible client can use the normal Tool call or the MCP Task lifecycle supported by the host.

The Prompts are:

- `cut_plan_rough_cut`
- `cut_review_edit_proposal`
- `cut_translate_captions`
- `cut_prepare_export`

Each Prompt requires `projectId`, accepts an optional goal, and accepts a language such as `zh-Hans` or `en`.

<details>
<summary>All 43 Tool names</summary>

```text
cut_accept_story_handoff
cut_create_project
cut_list_tracks
cut_list_clips
cut_list_media_assets
cut_list_project_resources
cut_import_media
cut_apply_edit
cut_apply_batch
cut_add_clip
cut_delete_clips
cut_duplicate_clips
cut_update_clip_timing
cut_update_transform
cut_update_project_settings
cut_update_text
cut_update_audio
cut_update_effects
cut_update_mask
cut_update_transition
cut_manage_track
cut_ripple_delete_ranges
cut_add_cover
cut_import_subtitle
cut_start_transcription
cut_cancel_analysis_job
cut_start_headless_export
cut_search_media_segments
cut_create_edit_proposal
cut_create_speech_cleanup_proposal
cut_update_edit_proposal
cut_apply_edit_proposal
cut_reject_edit_proposal
cut_revert_edit_proposal
cut_list_transcript_segments
cut_create_caption_draft
cut_create_translated_caption_draft
cut_update_caption_draft
cut_commit_caption_draft
cut_commit_caption_drafts
cut_export_subtitle
cut_finalize_version
cut_report_failure
```

</details>

### Installation and publication

1. Install or reload `@xpert-ai/plugin-cut` in Xpert.
2. Open the plugin detail, find the **MCP** section parallel to **Applications**, and install **Cut MCP Capabilities** for the **Organization** target. Do not use the Cut App or Assistant Template initialization action for MCP.
3. Open **Operations → MCP services** and create a service name and slug.
4. In **Capabilities**, refresh the organization capability catalog, select the Cut capabilities to expose, and configure their public names and policies.
5. Configure **Authentication** with API Key and/or OAuth, review **Permission policy** and **Instructions**, then enable the service.
6. Connect an MCP client to `<xpert-base-url>/api/mcp/p/<slug>` using the configured Bearer credential. The client can then discover the selected Tools, Resources, and Prompts and can use Tasks when supported.

The service editor tabs have the following roles:

| Tab | Purpose |
| --- | --- |
| Basic information | Service name, slug, status, and public endpoint. |
| Capabilities | Select and rename public Tools, Resources, and Prompts; configure per-capability execution policy. |
| Authentication | Create/revoke/rotate API Keys or configure OAuth. Secrets are shown only at creation or rotation time. |
| Permission policy | Approval and execution restrictions for exposed capabilities. |
| Instructions | Server-level guidance returned to MCP clients. |
| Audit | Invocation, principal, result, latency, and error records. |
| Test | Verify authentication, initialization, discovery, and selected capability calls before external use. |

### Scope and file inputs

MCP Publication is tenant/organization scoped and does not belong to an Xpert Workspace:

- Installing **Cut MCP Capabilities** creates an organization Toolset with no `workspaceId`.
- `cut_create_project` creates an organization-scoped Cut project with no workspace binding.
- Every operation on an existing project requires an explicit `projectId`.
- An organization publication does not inherit a current Xpert Workspace. It can address an existing workspace-bound Cut project only through an explicit `projectId` inside the authenticated tenant and organization; no workspace is inferred from the MCP connection.
- The host derives tenant, organization, principal, and execution identity from the authenticated MCP request; callers cannot replace that scope by passing identifiers in normal Tool input.

`cut_import_media`, `cut_import_subtitle`, and Story handoff media do not accept a local path or URL from an external client. The file must first be registered through Xpert file storage, and the caller must pass the returned portable `platform.workspace.files` reference. That reference carries its authoritative tenant/catalog/scope and file path. The host validates it against the authenticated tenant and organization before Cut reads the bytes.

The `workspacePath` inside a portable file reference is a normalized file-runtime path; it does not make the MCP service workspace-scoped and it is not an implicit “current workspace”. MCP never guesses which workspace or file scope to use.

Existing development databases may still contain a legacy workspace-scoped `cut-ir` MCP Toolset created by an older package. It is not provided by the current Cut plugin and should be removed before testing the organization-native installation.

OpenCut's current rewrite still lists Editor API, MCP, and Headless as future work, so Cut does not advertise a fictional OpenCut adapter. The exact upstream evidence and activation gates are recorded in [`docs/EDITOR-API-ROADMAP.md`](docs/EDITOR-API-ROADMAP.md).

## Local verification

```bash
pnpm --filter @xpert-ai/plugin-cut test
pnpm --filter @xpert-ai/plugin-cut build
pnpm --filter @xpert-ai/plugin-cut prepack
```

The normal browser gate injects a deterministic Worker double. An opt-in network smoke test exercises the real Whisper model and pinned browser runtime:

```bash
CUT_E2E_REAL_WHISPER=1 pnpm --filter @xpert-ai/plugin-cut test:e2e
```

## npm release

Prepare and validate the immutable release tarball before generating an npm OTP:

```bash
pnpm --filter @xpert-ai/plugin-cut release:prepare
```

The prepared tarball and its SHA-256 manifest are written to the ignored `apps/cut/.release/` directory. Validate the fast publish phase without changing the registry:

```bash
pnpm --filter @xpert-ai/plugin-cut release:publish -- --dry-run
```

Then run the publish command. It verifies the prepared package again before prompting with hidden input; generate or read the fresh npm OTP only when that prompt appears. It does not rebuild the package:

```bash
pnpm --filter @xpert-ai/plugin-cut release:publish
```
