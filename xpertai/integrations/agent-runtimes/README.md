# Agent Runtimes

Native Xpert plugin providing `codex`, `codex-computer`, `pi`, `claude-code`, and `opencode` implementations of `IAgentRuntimeStrategy`. It also supplies the `AgentInvocation` middleware: ordinary tools call the host capability and never own a child graph or a provider process.

Version 0.2.0 requires contracts and plugin-sdk **3.20.0**, including the scoped execution runner capability. Release the host and SDK before this plugin. The package remains private while that release is pending. The workspace's historical lockfile still describes the older published development SDK: regenerate it after 3.20.0 is published and verify a normal frozen install before publishing the plugin. Source-branch verification below builds against fresh host dist without changing that lockfile or relinking a running platform. Installation level is **system**; organization administrators separately grant workspace access through immutable runtime bindings. No default profile or agent process is started on installation.

## Computer execution

OpenCode 1.18.33 and Codex 0.159.2 support the Computer runner. Configure a profile with `provider: "opencode"` or `provider: "codex-computer"`, `executionEnvironment: "computer"`, a version and authorized workspace IDs. Its binding configuration must contain the matching `profileVersion` and `executionEnvironment: { "type": "computer" }`. The host resolves the current conversation, owner, environment, exact tool version, model selection and payer; the plugin cannot supply commands, credential environment variables or service URLs.

The host checkpoints a scoped process receipt before sending the prompt. Inspect/resume follows that receipt and never re-sends an uncertain task. Completion persists typed results and any explicitly requested file exports through the host checkpoint, then stops the guest supervisor. It does not archive the working directory by default. A failed checkpoint keeps the process available for a later inspection. Cancellation is confirmed only when the host reports the process exited. Human control is coordinated separately from view connections. This adapter advertises no approval, pause or takeover capability.

Earlier Computer acceptance covered OpenCode 1.18.33 platform-model tasks, checkpoint wait/resume and cancellation. That historical acceptance does not verify the current Agent-directed polling and resource-card flow; repeat live acceptance with the matching host and plugin build. The non-Computer Codex App Server, Claude Agent SDK and Pi retain their existing behavior; they do not gain platform model credentials through this profile. Native Codex/Claude model-protocol tests are separate from this managed adapter's acceptance.

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
| Computer Codex | Managed single-prompt JSONL service; reconnect observes the existing execution, guest loss becomes unknown | Not advertised by this adapter | Host process termination required |
| Pi | RPC JSONL; wait for agent_settled through retries; process loss becomes unknown | Extension UI unsupported and fails explicitly | Abort request; final receipt required |
| Claude Code | Agent SDK query; process loss becomes unknown | canUseTool permission callback; AskUserQuestion unsupported and denied | Abort and wait for stream termination |
| OpenCode | HTTP session/message; recover result by message identity without resend | Not advertised by this adapter | Server abort acknowledgement |

No adapter promises filesystem rollback, exactly-once remote effects, or restart recovery for an in-process runner. Explicit file references require a future materialization adapter and currently fail before launch. These are provider capability limits, not hidden fallbacks. Local runtime profiles should use trusted managed workers; a process manager here is not a distributed runner service.

## Results and resource cards

The adapters request a versioned `xpert-task-result` final JSON envelope. The shared parser validates it against the SDK schema; ordinary text or an invalid envelope remains text. The host has no provider-specific response parsing. Supported items are `analysis` (findings), `changes` (changed paths), `tests` (actual checks and status), and `file` (an explicitly requested deliverable).

Task-specific evidence requirements apply to the envelope's summary as well: complete source/test code must not be replaced by a claim that files exist. A host-requested JSON-encoded review report stays a JSON string in summary and is validated by the Project Task host. OpenCode progress derives from assistant messages matching the submitted message ID; the earliest such message supplies the actual start time. The adapter reports activity without inventing a completion percentage.

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


## Computer Codex transport

Computer Codex uses `codex exec --json --skip-git-repo-check -` with host-selected permission arguments. The host supplies the exact executable/version, temporary model configuration, grant and run directory. The managed guest accepts exactly one prompt; its authenticated loopback endpoint retains bounded JSONL events while the supervisor lives. API reconnects inspect this receipt without sending another prompt. It is not a distributed exactly-once execution guarantee: guest loss remains unknown.

Success requires process exit code 0, `turn.completed`, a final public `agent_message`, and no terminal error event. An intermediate success sentence or a partial output is not completion. The final public message uses the existing typed task-result envelope. No private reasoning is displayed. Output is bounded to 2 MiB / 10,000 records; overflow fails the task rather than returning a truncated success.

Computer mode is noninteractive; it does not implement the App Server approval UI, running messages, or session continuation. Cancellation is confirmed only after host process termination. The separate `codex-computer` strategy declares session recovery and no interactions; existing `codex` App Server capabilities are unchanged. Evidence-only independent review remains restricted to Computer OpenCode; Codex implementations can be reviewed there using pinned evidence.

Files are exported only when requested with `delivery`, using the same host collector as OpenCode. Durable result checkpoint precedes guest cleanup. Failed export keeps the execution outcome and reports a separate export failure. Per-invocation directories/configuration and owner/conversation/generation checks isolate operations; the Computer is still shared by its authorized owner, not a separate security sandbox per invocation.

### Qwen Code on Computer

`qwen-computer` is a managed background adapter for Qwen Code **0.24.7**.
Configure a profile with `provider: "qwen-computer"`,
`executionEnvironment: "computer"`, a stable `id`/`version` and authorized
`workspaceIds`. Select a binding to that profile on the Assistant. Commands,
model endpoints and credentials are resolved by the host, not profile callers.
The host must provide a compatible Qwen `CliModelProfile.background` transport.

Recovery observes the checkpointed Computer process; it never resubmits stdin.
Cancellation requires confirmed process exit. Success requires both exit code 0
and one successful primary Qwen result event, with no terminal error. Earlier
tool permission denials are retained as diagnostic facts; they do not override a
successful final result after the CLI recovered. Missing/duplicate/child-only
results cannot complete the invocation.
File exports and durable result-before-cleanup use the same implementation as
Computer Codex. Execution success does not accept a business Project task.

The host selects CLI permission behavior through the existing tenant
`modelExecutionPolicy.cliPermissions`: default `allow`, optional `restricted`
overrides by tool ID (`qwen`, `codex`, `opencode`). Qwen `allow` uses YOLO;
`restricted` keeps file edits and Node shell approval. Noninteractive executions
cannot request human approval. The effective mode is recorded on new launch
receipts; Runtime bindings cannot override it. Independent evidence-only review
retains the existing OpenCode deny-all tool policy.

Qwen/Codex final receipt checks persist bounded, redacted diagnostics in
`handle.metadata.completion` before stopping the guest. Facts include error code,
exit code, final event type/subtype and an available denied tool/command. Public
`invocation.error` carries the concrete reason to the main Agent and execution
View. Categories distinguish permission denial, CLI error, missing/ambiguous
final result, invalid protocol, process failure/nonzero exit, missing exit code,
incomplete activity and unavailable runner. This does not make CLI success a
business-task acceptance or reinterpret historical generic failures.

Permission/diagnostic verification (2026-10-07): TypeScript build, 62 Runtime
tests and the dist-first lifecycle harness passed. Host checks covered 128 tests.
An isolated real Qwen 0.24.7 process against a local model-protocol fixture allowed
`mkdir` with YOLO and denied it with restricted approvals. The latter still
emitted a successful final event, confirming why execution receipt success must
remain separate from business acceptance. No live model-backed project task or
running platform/plugin deployment was changed by this check.

Earlier acceptance (2026-10-07, before configurable permissions): 47 plugin tests, dist-first lifecycle and the real
Qwen Code task loop passed. A denied first attempt remained failed/blocked;
a corrected retry exported a Node.js program and JSON as two immutable artifacts.
The coordinator automatically resumed, reran the program and independent asserts,
and accepted the task. Failed history and live execution cards were retained.
See the host's `docs/plans/2026-10-06-project-tasks-stage5-acceptance.md` for scope
and limits. That Qwen-only result does not qualify the later Kimi/CodeBuddy adapters; see their separate acceptance below.


### Optional public execution activity

Computer Qwen Code, Codex, CodeBuddy, Kimi Code, Claude Code and OpenCode declare activity version 1 (`presentation: coding`). With a matching host, adapters map allowlisted public text/tool/command/file events into `context.activity`, persist a source checkpoint and flush final activity before recording the result and stopping the runner. No extra Activity Provider registry is required. Hosts without the optional recorder keep the normal execution/result flow.

Qwen/Codex consume the paged Computer JSONL bridge; a source generation change or lost buffer is reported as a gap. Qwen's own long-output preview marker remains explicitly truncated. OpenCode reconciles cumulative parts for the current parent message; a bounded latest-message fallback records a source gap rather than claiming full coverage. Only explicit protocol fields become command/file details. Hidden reasoning is excluded; an unrecognized tool remains a generic tool.

Direct background calls emit one host-owned execution Resource Card. Project dispatch already supplies its execution card, so it does not emit a duplicate. Final non-file summaries live in the independent execution view; delivered file artifacts keep their existing cards.

Protocol and lifecycle verification against local SDK/contracts builds:

```sh
XPERT_PLATFORM_ROOT=/path/to/xpert-pro node integrations/agent-runtimes/scripts/verify.mjs --source-checkout
```

The verifier stages built peer packages in a temporary directory, runs public-protocol tests and the dist-first plugin lifecycle harness, then copies the verified dist back. It does not deploy or relink the running platform.

`--source-checkout` explicitly validates unreleased source: the host's Changesets plan must advance both peer packages into the declared ranges, and built manifests must match the source manifests. It does not rewrite peer versions or imply npm availability. The current release target is contracts/plugin-sdk **3.20.0**. Without this option the verifier requires built host versions to satisfy the declared peers and fails before building otherwise. After the host release, run without the option and regenerate the plugin workspace lockfile against the published packages before making this plugin public.


### CodeBuddy, Kimi Code and Claude Code on Computer

The following additional providers use the same managed Computer JSONL lifecycle:

| Provider | Tool/version | Background permission modes | Completion receipt |
| --- | --- | --- | --- |
| `codebuddy-computer` | CodeBuddy 2.161.1 | `allow`, `restricted` | One successful primary `result` event |
| `kimi-computer` | Kimi Code 2.1.1 | `allow` only | Final assistant reply, matched tool results and final `session.resume_hint` |
| `claude-computer` | Claude Code 2.1.63 | `allow`, `restricted` | One successful primary `result` event |

Every successful receipt also requires exit code 0, complete protocol collection
and no terminal error. CodeBuddy/Claude share the primary-result parser with
Qwen; recoverable tool failures are retained in Activity. Kimi uses its native
public-message parser. It does not expose trustworthy tool success/exit-code
fields, so those tool outcomes remain `unknown`; the overall process result is
verified independently. Thinking, settings, resume commands and private metadata
are not projected into the public process stream.

Kimi 2.1.1 is the Node `@moonshot-ai/kimi-code` CLI, not the earlier Python CLI.
The host's optional `CliModelProfile.background.promptArgument` passes its prompt
as one literal argv value. Other tools continue to use stdin. No shell expansion,
PTY, prompt replay or additional Runtime registry is introduced. A private Kimi
agent restricts tools and removes subagents; the fixed version forces automatic
approval in prompt mode, so the host rejects `restricted` before creating a
process. Do not bypass that rejection by changing the requested mode in a binding.

Claude/CodeBuddy use only Bash/Read/Write/Edit/Glob/Grep, an empty MCP configuration
and disabled ambient settings. Host-selected `allow` uses `bypassPermissions`;
`restricted` uses `dontAsk` with file tools and `Bash(node:*)`. CLI approval controls
are not a filesystem sandbox. Existing interactive launch behavior is unchanged.
These Computer providers have no interactive approval or follow-up message API;
the separate `claude-code` Agent SDK provider remains unchanged.

Configure each profile with its provider, `executionEnvironment: "computer"`,
stable `id`/`version` and authorized workspace IDs. Bind and publish it on the
Assistant exactly like `qwen-computer`. All three support observed-session
recovery, confirmed cancellation, explicit file export, public Activity and the
existing execution Resource Card. They do not extend independent evidence review
beyond the existing OpenCode path. Aider remains interactive-only in Computer;
installation or text output is not a qualified background completion protocol.

Acceptance on 2026-10-07: **78 protocol tests**, dist-first lifecycle loading,
**90 host tests** and **11 real Docker supervisor tests** passed. Three real
model-backed project tasks each dispatched once, exported a Node program and JSON,
automatically resumed the coordinator, reran actual checks and reached `done` by
explicit acceptance. Each conversation had two successful runs and one execution
card; authorized downloads verified all six files. CodeBuddy/Kimi/Claude exposed
7/5/5 Activity items respectively. This is API/SDK acceptance, not another Desktop
visual test. Full scoped receipts remain in the host's protected local environment.

Primary protocol references: [CodeBuddy headless mode](https://www.codebuddy.ai/docs/cli/headless),
[Kimi Code command reference](https://www.kimi.com/code/docs/en/kimi-code-cli/reference/kimi-command.html).
Fixed installed-version help/source and real execution receipts take precedence
when current online documentation describes a newer protocol.
