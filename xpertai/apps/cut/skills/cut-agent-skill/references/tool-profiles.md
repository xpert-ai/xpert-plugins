# Cut tool profiles

`tool-profiles.json` is the versioned shared mapping from profile IDs to exact
Cut tool names and relevant Skills. A Skill may need several profiles in sequence;
loading a Skill does not authorize every write in its workflow.

## Native Xpert

Native Xpert registers exactly six tools: four base queries, `cut_discover_tools`
and `cut_execute_tool`. It does not inject all operation schemas or switch model
bindings. Call discovery with `profiles: []` to list the catalogue, or with the
smallest relevant profile IDs to retrieve operation descriptions and JSON schemas.
Then call the executor with `profile`, `operation`, and `arguments` matching the
discovered schema. Original operation names mentioned by Skills refer to these
internal operations when only the gateway is available.

Example: discover `timeline-visual`, then execute `cut_update_transform` through
that profile with the exact project, clip, baseRevision and changeSummary required
by its returned schema. Discovery does not edit anything or authorize a write.
Retain existing content approval and revision requirements.

Use `detail-reads` for project, clip, media, job, segment, proposal and caption
reads. Use `task-control` for job cancellation and `proposal-manage` for reviewed
proposal decisions. These profiles remain discoverable across all stages without
relying on previous selection history. After resuming or history compression,
rediscover work via `cut_list_project_resources`, then read its current state.

Use `diagnostics` only for actual failures, `proposal-undo` for requested undo,
and `version-finalize` for explicitly requested saved versions. Verification does
not authorize edits. Do not repeat approval already granted for the same scope.

## Portable MCP clients

The MCP endpoint continues to publish its existing 43 tools, 8 Resource Templates
and 4 Prompts. The native discovery/execution gateways are not MCP tools. A remote client
must use its own tool-selection support; instructions alone cannot change schemas
in its model request. Use the actual tools returned by the connected endpoint.

Codex supports static `enabled_tools` under the plugin MCP configuration. The
source script `scripts/codex-tool-profiles.mjs` emits a configuration fragment from
the same catalogue. It does not edit configuration, credentials or install state.
Static presets must include the union of all workflow stages and pending task
needs; they do not switch automatically between model rounds. Keep the default
full MCP catalogue when such a static restriction would prevent completion.
