# Cut MCP entry (Codex / ChatGPT)

Install Xpert Cut Agent Plugin and connect the intended Xpert Cut MCP service.
The client contains shared Skills only; editing, storage, transcription and
render jobs run on that service. It does not install Xpert Cut Runtime locally.

Before work, use the client's MCP discovery to identify the configured server,
authenticated connection and available Cut capabilities. If disconnected, ask
for the intended service connection; do not create a new runtime or guess an
endpoint. If several Cut connections exist, resolve the user's intended one
before any write. Use the client-returned callable names, which may be prefixed;
do not fabricate tool names from a plugin display name.

Always pass the exact Cut projectId returned by that service. Never use a local
Workbench selection or another service's project/file ID. Upload/download media
through the same publication's authenticated HTTP file endpoints, using its
configured personal-file binding and returned paths. Keep authentication in the
client connection store; do not put credentials into chat, skill files or URLs.
If the client cannot transfer binary files, report that boundary; a connected
MCP service alone does not prove local-file upload or download support.

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
