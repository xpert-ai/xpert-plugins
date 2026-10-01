---
name: cut-export
description: Use for Cut background rendering, export variants, render progress, cancellation, and authenticated file delivery.
---

# Cut export

Load `cut-agent-skill` first for identity, authorization and revision rules; use `cut-verification` for the requested preflight and output checks.

1. Confirm the requested format, quality, audio and variants from the user's instructions. Read the latest project revision and relevant imported media. Every media clip must resolve to an imported `mediaAssetId`. A request to export does not implicitly request a cover, new captions, a saved milestone or other edits.
2. Reuse an existing pending job or successful export only when its source revision and export settings match the request. For durable/background output, use `cut_start_headless_export` with the exact `baseRevision` and at most five variants. Template values replace `{{variable}}`; `mediaAssetMap` maps explicit compatible imported asset IDs.
3. Respect the running renderer's limits and validation errors. The current service caps staged media at 4 GiB, duration at 600 seconds and frames at 18,000; duration and frame limits both apply. Browser export is a user-visible Workbench path for an explicitly chosen local render or unsupported backend inputs. If unavailable, report the limitation and propose a scoped alternative instead of opening a browser or silently splitting output.
4. Track every returned plugin job ID with `cut_get_analysis_job`. MCP request/Task completion does not itself mean the independently queued media job finished or acquired a longer sandbox budget. Continue until `succeeded` with `resultExportId`, or report a terminal failure/cancellation. Keep variant results separate.
5. On failure, inspect machine-readable failureCode and existing retry state. Do not resubmit a running job, repeat deterministic failures, or change the project snapshot merely to retry. Use `cut_cancel_analysis_job` when explicitly requested.
6. Read the matching export summary with `cut_list_project_resources` and `resource: exports`. Read `cut_get_export` through `cut://projects/{projectId}/exports/{exportId}` for its authorized portable file reference, then deliver through the authorized file route: standalone MCP uses the publication HTTP download endpoint with its credential and returned relative file reference; Workbench uses its file-download action. Keep credentials out of messages and URLs. Export existence is not proof of a completed download.
7. Run the available `cut-verification` checks. Completion reports the downloadable output/file reference, format, source revision and job/export IDs; identify failed variants and unverified playback separately. Never claim a finished MP4 merely because submission returned a job ID.
