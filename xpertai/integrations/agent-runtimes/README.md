# Agent Runtimes

Native Xpert plugin providing `codex`, `pi`, `claude-code`, and `opencode` implementations of `IAgentRuntimeStrategy`. It also supplies the `AgentInvocation` middleware: ordinary tools call the host capability and never own a child graph or a provider process.

Version 0.2.0 requires contracts and plugin-sdk **3.20.0**, including the scoped execution runner capability. Release the host and SDK before this plugin. The package remains private while that release is pending. The workspace's historical lockfile still describes the older published development SDK: regenerate it after 3.20.0 is published and verify a normal frozen install before publishing the plugin. Source-branch verification below builds against fresh host dist without changing that lockfile or relinking a running platform. Installation level is **system**; organization administrators separately grant workspace access through immutable runtime bindings. No default profile or agent process is started on installation.

## Computer execution

Only OpenCode supports the new Computer runner. Configure a profile with `provider: "opencode"`, `executionEnvironment: "computer"`, a version and authorized workspace IDs. Its binding configuration must contain the matching `profileVersion` and `executionEnvironment: { "type": "computer" }`. The host resolves the current conversation, owner, environment, exact tool version, model selection and payer; the plugin cannot supply commands, credential environment variables or service URLs.

The host checkpoints a scoped process receipt before sending the prompt. Inspect/resume follows that receipt and never re-sends an uncertain task. Completion persists typed results and any explicitly requested file exports through the host checkpoint, then stops the guest supervisor. It does not archive the working directory by default. A failed checkpoint keeps the process available for a later inspection. Cancellation is confirmed only when the host reports the process exited. Human control is coordinated separately from view connections. This adapter advertises no approval, pause or takeover capability.

Earlier Computer acceptance covered OpenCode 1.18.33 platform-model tasks, checkpoint wait/resume and cancellation. That historical acceptance does not verify the current Agent-directed polling and resource-card flow; repeat live acceptance with the matching host and plugin build. Codex App Server, Claude Agent SDK and Pi retain their existing non-Computer behavior; they do not gain platform model credentials through this profile. Native Codex/Claude model-protocol tests are separate from this managed adapter's acceptance.

## Configuration

Use a versioned profile for each administered execution environment. The following is a template, not machine-specific configuration:

```json
{
  "profiles": [{
    "id": "codex-review",
    "version": "1",
    "provider": "codex",
    "workspaceIds": ["<authorized-workspace-uuid>"],
    "workspaceRoot": "/srv/xpert/agent-workspaces",
    "command": "/usr/local/bin/codex",
    "args": ["app-server"],
    "environmentKeys": ["OPENAI_API_KEY"],
    "timeoutMs": 600000
  }]
}
```

`command`, arguments, environment variable names and service URLs are administrator configuration. Launch tools accept a prompt and an optional delivery policy, not process commands or credentials. Secrets are read from the runner environment, not stored in bindings, tool arguments or execution receipts. Pi uses `pi --mode rpc`. Claude Code requires the optional peer `@anthropic-ai/claude-agent-sdk` compatible with 0.3.278. OpenCode requires `serverUrl`; `authorizationEnvironmentKey` names an environment variable containing the complete Authorization header, and `workspaceRoot` names its server-side working directory.

Process profiles create an execution directory under `workspaceRoot` and pass only explicitly allowed environment variables plus PATH/LANG. **A directory is not a security sandbox.** Deploy the plugin in an isolated worker/container with access limited to the approved workspace and credentials; use an administrator-managed wrapper command when additional isolation is required. Codex requests its read-only sandbox. Claude retains SDK default permissions and disables ambient settings. OpenCode session isolation does not isolate files; its server/working directory must be provisioned per trust boundary.

Profiles and their allowed workspaces are validated on each call. Change the profile version when configuration changes, then create a new binding. Existing invocations fail explicitly if their provider registration or profile version disappears. Do not silently repoint a profile to a different execution environment.

## Bindings and tools

An organization administrator creates a binding with `POST /api/agent-runtime-bindings`:

```json
{
  "title": "Code reviewer",
  "workspaceIds": ["<authorized-workspace-uuid>"],
  "provider": "codex",
  "reference": "codex-review",
  "configuration": { "profileVersion": "1" }
}
```

Use the returned binding ID in an `AgentInvocation` middleware configuration:

```json
{
  "bindings": [{
    "id": "<binding-uuid>",
    "name": "review_code",
    "description": "Ask the approved coding agent to review the supplied task.",
    "mode": "auto"
  }]
}
```

`auto` and historical `wait` perform a bounded initial observation through the host API. A running result returns normally to the Agent, which can call `task_status` again without sending a second task prompt. `background` immediately returns an invocation ID. Use the owner's scoped `GET /api/agent-invocations/:id`, `POST /:id/cancel`, or `POST /:id/respond` routes for lifecycle control. The response body is `{ "interactionId": "...", "response": ... }`. Codex decisions are `accept`, `decline`, or `cancel`; Claude approvals are booleans. Parent graph resume payloads use this same shape for approval handling.

Ordinary new tasks use Agent-directed status queries with a requested wait duration. The host preserves historical checkpoint wait records for compatibility, but new status calls do not create background suspension records. Human approvals retain the explicit interaction flow. A recoverable child session does not by itself guarantee automatic parent-turn recovery after an API restart.

## Capabilities and limits

| Provider | Execution and recovery | Interactions | Cancellation |
| --- | --- | --- | --- |
| Codex | App Server JSONL; process loss becomes unknown, no automatic relaunch | Command/file approval requests; unsupported requests rejected | Pending until turn completion acknowledges interruption |
| Pi | RPC JSONL; wait for agent_settled through retries; process loss becomes unknown | Extension UI unsupported and fails explicitly | Abort request; final receipt required |
| Claude Code | Agent SDK query; process loss becomes unknown | canUseTool permission callback; AskUserQuestion unsupported and denied | Abort and wait for stream termination |
| OpenCode | HTTP session/message; recover result by message identity without resend | Not advertised by this adapter | Server abort acknowledgement |

No adapter promises filesystem rollback, exactly-once remote effects, or restart recovery for an in-process runner. Explicit file references require a future materialization adapter and currently fail before launch. These are provider capability limits, not hidden fallbacks. Local runtime profiles should use trusted managed workers; a process manager here is not a distributed runner service.

## Results and resource cards

The adapters request a versioned `xpert-task-result` final JSON envelope. The shared parser validates it against the SDK schema; ordinary text or an invalid envelope remains text. The host has no provider-specific response parsing. Supported items are `analysis` (findings), `changes` (changed paths), `tests` (actual checks and status), and `file` (an explicitly requested deliverable).

Launch tools default to `delivery: { "mode": "none" }`: review, edits and tests return results without exporting files. Use `{ "mode": "files", "paths": ["report.txt"] }` for individual downloads, or `{ "mode": "archive", "paths": ["src/main.py", "result.txt"] }` only when a bundle is requested. An explicit caller path list is authoritative even if the final response omits a file item. If paths cannot be known before execution, omit `paths`; only validated final `file` declarations are selected. Directories are never implicit selections. The Computer collector verifies the persisted delivery policy, rejects path traversal and links, and bounds exports to 32 files, 1 MiB per file and 4 MiB in total. Non-Computer profiles currently report file export as unavailable.

File export has a separate status from task execution. A successful task whose export fails or produces no committed artifacts keeps its findings and test results; it must not claim a downloadable artifact exists. Repeated observations reuse the persisted result and do not execute the task again. Model-visible tool receipts include only public task status and typed results, excluding adapter-only data such as host working directories.

Launch, status and cancel tools emit the existing ChatKit `resource_card` contract through the SDK event bridge. Findings, changes and tests open the platform's authorized task-results View. Only committed artifacts receive download cards; model-declared file paths alone do not. Stable resource IDs let ChatKit upsert repeated observations in the same reply. Cards persist with the message and are excluded from model context. The View checks task ownership, Assistant scope and current binding access on every read and download, and pins exported files to their recorded artifact version.

Install matching ChatKit types/UI with resource-card support and the host/SDK result bridge before loading this plugin. This local source build does not constitute a registry release.

## Verification

From `xpertai` after building the host SDK and contracts:

```sh
XPERT_PLATFORM_ROOT=/path/to/xpert NX_DAEMON=false corepack pnpm exec nx run agent-runtimes:verify
```

The verifier builds in a temporary workspace using fresh SDK dist artifacts. It does not relink the developer's running host. Tests exercise real JSONL subprocess transport, a local HTTP fixture, an injected Claude SDK, grants/version rejection, approvals, cancellation, completion, and loss recovery. It then loads the built plugin with `plugin-dev-harness` and closes the Nest context. It never launches a real third-party agent or reads its credentials. Live account/model and sandbox acceptance are separate deployment checks.

### Task dependencies

Bindings default to `auto` (historical `wait` remains supported): the host briefly observes work and returns the actual status. `background` returns immediately. The middleware exposes only `task_status` and `task_cancel` beside the configured launchers; these lifecycle names are reserved. It does not expose a separate `task_wait` tool.

`task_status` accepts `taskIds`, `mode: any | all`, and `timeoutMs` from 0 to 60,000 (default 30,000). Zero reads immediately; a positive duration returns early when the dependency condition is satisfied or returns `pending` when the window ends. The Agent chooses when to call again, usually with 10–60 second windows, and must not relaunch unfinished tasks. Host limits remain authoritative. Waiting inside the tool does not itself perform model inference; additional Agent decisions consume normal model tokens.

`completed` includes failed or cancelled tasks, so inspect individual statuses. Other tasks continue after an any-wait. `unavailable` means the result is uncertain; never restart automatically. Required human approvals use the existing interaction path. Use a fresh conversation after updating an Assistant whose old prompt prohibited status polling. Install the compatible host/SDK before this plugin build.

All three tool roles provide localized `metadata.toolName` and `metadata.toolIcon`. Launcher bindings may set a `title` (string or `{en_US, zh_Hans}`) and a font `icon`; the default is provider-neutral delegation. Each tool accepts optional `changeSummary` for a concise activity description. It updates the existing timeline step through `ON_TOOL_MESSAGE`, is excluded from execution requests, and never replaces the tool's actual result or final status.
