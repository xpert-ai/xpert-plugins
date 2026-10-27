# Agent Runtimes

## Automatic runtime selection

Install the plugin and add `AgentInvocation` middleware with empty options (`{}`).
There is no plugin configuration schema or binding form. All original backends are
retained: Codex App Server, Claude Agent SDK, Pi RPC, external OpenCode, and the six
Computer adapters. Codex/Claude interactive approvals retain their host interaction
flow; Computer transports keep their noninteractive behavior.

At tool invocation, the host discovers deployed, authorized presets. A single choice
is selected automatically; multiple choices are returned for the Agent to select.
The host generates profile IDs, revisions, workspace bindings and isolated paths.
Users never enter UUIDs, commands, endpoint URLs, versions or credentials. Existing
Assistant/conversation access is rechecked; Computer additionally uses its existing
Computer/model/CLI admission. Explicitly disabled presets stay disabled across
revisions. No backend inherits an administrator identity.

### Installed strategy declarations

The host discovers `managedProfiles` from the scoped `AgentRuntimeRegistry`. Each
installed strategy implements `resolveManagedDeployment(reference, scope)` to return
its process/SDK/service launch settings, or `undefined` when its dependencies or
connection are unavailable. The host has no runtime-specific environment variable,
provider allowlist, or deployment inventory. Third-party providers use the same SDK
contract without changing platform configuration.

Codex, Pi and Claude strategies own their protocol defaults (`codex app-server`,
`pi --mode rpc`, and the Claude SDK). These declarations do not install executables
or create authentication. A deployment-specific installed strategy can resolve its
binary path, model/credentials and endpoint through its injected dependencies or
existing connections. It must preserve isolation and credential audiences. Default
process/SDK settings do not inherit the API server's environment or secrets. The
optional Claude SDK dependency must be installed separately.

The OpenCode adapter retains both Computer and remote HTTP execution. Its base
strategy does not guess an external URL: a service-owning installed strategy
provides the `service` spec through `resolveManagedDeployment`; without that
connection the remote preset is unavailable. The service must share the generated
workspace volume at the same canonical path. Computer continues to use its existing
host runner and platform model gateway; direct transports retain their own model
and credential behavior.

Resolution is read-only and follows actor authorization. Settings must remain stable
for a given deployment; the host validates the discriminated contract and fingerprints
settings plus strategy provenance. Changed settings or an uninstalled strategy invalidate
old bindings. The scoped host capability rechecks access before handing ephemeral launch
settings to the adapter. Commands, credentials and endpoint URLs never enter persisted
targets, receipts or model-visible results. Workspace directories derive from the host's
existing asset data path; neither tool input nor the strategy chooses the root.

Old plugin `profiles`, middleware `bindings` and old receipts are not accepted or
migrated. Stored records are not deleted. Update old middleware options to `{}`.
This replaces configuration and authorization plumbing while retaining protocols.
Requires host contracts/plugin-sdk **3.28.0 or newer**, including managed-runtime
deployments and completion evidence v2. The workspace uses published npm **3.28.0**
packages. The plugin remains private; verification does not publish or deploy it.

## Execution lifecycle

Computer uses the host's scoped runner and model credentials. Direct adapters use
only the deployment settings supplied for the current authorized target. A durable receipt precedes prompt dispatch. Recovery observes that
receipt and never repeats an uncertain task. Results and requested exports are
checkpointed before guest shutdown; failed persistence keeps the runner available
for reconciliation. No adapter promises rollback or exactly-once remote effects.
Explicit file inputs remain unsupported and fail before launch.

## Results and resource cards

The adapters request a versioned `xpert-task-result` final JSON envelope. The shared parser validates it against the SDK schema; ordinary text or an invalid envelope remains text. The host has no provider-specific response parsing. Supported items are `analysis` (findings), `changes` (changed paths), `tests` (actual checks and status), and `file` (an explicitly requested deliverable).

Task-specific evidence requirements apply to the envelope's summary as well: complete source/test code must not be replaced by a claim that files exist. A host-requested JSON-encoded review report stays a JSON string in summary and is validated by the Project Task host. OpenCode progress derives from assistant messages matching the submitted message ID; the earliest such message supplies the actual start time. The adapter reports activity without inventing a completion percentage.

Launch tools default to `delivery: { "mode": "none" }`: review, edits and tests return results without exporting files. Use `{ "mode": "files", "paths": ["report.txt"] }` for individual downloads, or `{ "mode": "archive", "paths": ["src/main.py", "result.txt"] }` only when a bundle is requested. An explicit caller path list is authoritative even if the final response omits a file item. If paths cannot be known before execution, omit `paths`; only validated final `file` declarations are selected. Directories are never implicit selections. The Computer collector verifies the persisted delivery policy, rejects path traversal and links, and bounds exports to 32 files, 1 MiB per file and 4 MiB in total. Non-Computer profiles currently report file export as unavailable.

File export has a separate status from task execution. A successful task whose export fails or produces no committed artifacts keeps its findings and test results; it must not claim a downloadable artifact exists. Repeated observations reuse the persisted result and do not execute the task again. Model-visible tool receipts include only public task status and typed results, excluding adapter-only data such as host working directories.

Launch, status and cancel tools emit the existing ChatKit `resource_card` contract through the SDK event bridge. Findings, changes and tests open the platform's authorized task-results View. Only committed artifacts receive download cards; model-declared file paths alone do not. Stable resource IDs let ChatKit upsert repeated observations in the same reply. Cards persist with the message and are excluded from model context. The View checks task ownership, Assistant scope and current binding access on every read and download, and pins exported files to their recorded artifact version.

Install matching ChatKit types/UI with resource-card support and the host/SDK result bridge before loading this plugin. This local source build does not constitute a registry release.

## Tools

`delegate_task` performs a bounded initial wait, then returns the real task status.
`task_status` accepts unique task IDs, `mode: any | all`, and `timeoutMs` from 0 to
60,000 (default 30,000). Pending tasks retain their IDs; do not relaunch them.
`task_cancel` requests cancellation; only confirmed process exit means cancelled.
All three tools carry localized display names/icons and optional `changeSummary`.

## Verification

Verify the published npm dependencies after a frozen workspace install:

```sh
corepack pnpm install --frozen-lockfile --ignore-scripts
NX_DAEMON=false corepack pnpm exec nx run agent-runtimes:verify-published
```

This target uses the workspace's installed SDK/contracts, validates their declared
peer ranges, and never substitutes a platform source checkout or its dist output.
It runs the same protocol, packed-artifact and dist-only lifecycle checks described
below. Add `XPERT_RUNTIME_GUEST_TEST_IMAGE=node:22-bookworm` to also run direct
process/Claude SDK protocol fixtures inside a network-isolated Linux container.
These fixtures do not call model providers or establish live Computer acceptance.

After building the matching host SDK/contracts, from `xpertai`:

```sh
XPERT_PLATFORM_ROOT=/path/to/xpert-pro NODE_ENV=production NX_DAEMON=false corepack pnpm exec nx run agent-runtimes:verify-source
```

The verifier compiles against fresh host dist, runs protocol and authorization
boundary fixtures, packs and extracts the distributable, rejects source files and
retired adapters, reruns tests against the extracted package with `NODE_ENV=production`,
and loads that package through `plugin-dev-harness` with no mocks. Only verified
fresh build output replaces local dist. External model/Computer transport is
simulated in plugin tests; the host PostgreSQL test uses a disposable real database.
This validates unreleased source artifacts, not public npm availability or real
model-provider execution. Publish/install matching host and SDK packages before
releasing the plugin.

## Computer Codex transport

Computer Codex uses `codex exec --json --skip-git-repo-check -` with host-selected permission arguments. The host supplies the exact executable/version, temporary model configuration, grant and run directory. The managed guest accepts exactly one prompt; its authenticated loopback endpoint retains bounded JSONL events while the supervisor lives. API reconnects inspect this receipt without sending another prompt. It is not a distributed exactly-once execution guarantee: guest loss remains unknown.

Success requires process exit code 0, `turn.completed`, a final public `agent_message`, and no terminal error event. An intermediate success sentence or a partial output is not completion. The final public message uses the existing typed task-result envelope. No private reasoning is displayed. Output is bounded to 2 MiB / 10,000 records; overflow fails the task rather than returning a truncated success.

Computer mode is noninteractive; it does not implement the App Server approval UI, running messages, or session continuation. Cancellation is confirmed only after host process termination. The `codex-computer` strategy declares session recovery and no interactions. Evidence-only independent review remains restricted to Computer OpenCode; Codex implementations can be reviewed there using pinned evidence.

Files are exported only when requested with `delivery`, using the same host collector as OpenCode. Durable result checkpoint precedes guest cleanup. Failed export keeps the execution outcome and reports a separate export failure. Per-invocation directories/configuration and owner/conversation/generation checks isolate operations; the Computer is still shared by its authorized owner, not a separate security sandbox per invocation.

### Qwen Code on Computer

`qwen-computer` is a managed background adapter for Qwen Code **0.24.7**.
Its built-in preset is discovered automatically. The host resolves commands,
model endpoints and credentials from the current execution. No profile or binding
selection is required from a user.
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

`--source-checkout` labels unreleased source verification explicitly. Built host
manifests must match source manifests. It does not rewrite versions or imply a
registry release. The automatic-runtime extension is covered by the host Changeset.

### CodeBuddy, Kimi Code and Claude Code on Computer

The following additional providers use the same managed Computer JSONL lifecycle:

| Provider             | Tool/version       | Background permission modes | Completion receipt                                                          |
| -------------------- | ------------------ | --------------------------- | --------------------------------------------------------------------------- |
| `codebuddy-computer` | CodeBuddy 2.161.1  | `allow`, `restricted`       | One successful primary `result` event                                       |
| `kimi-computer`      | Kimi Code 2.1.1    | `allow` only                | Final assistant reply, matched tool results and final `session.resume_hint` |
| `claude-computer`    | Claude Code 2.1.63 | `allow`, `restricted`       | One successful primary `result` event                                       |

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

## Original-host control and descendant completion (phase 3.2)

This change requires the published host/SDK **3.28.0** `completionEvidence: 2` contract. Local Codex, Pi and Claude executions are bound to the original host boot and execution generation. A different API replica persists cancellation; the original host reconciles it. A missing host or ambiguous receipt never authorizes another start. Business results are saved before process cleanup; failed final persistence retains the original receipt for another observation attempt.

Local process profiles now require Python 3. The Linux supervisor adopts orphaned descendants, including children that leave the original process group, and reports completion only after reaping the entire owned family. Claude uses the installed SDK's `spawnClaudeCodeProcess` hook. Platforms without this supervision capability, including the current macOS fallback, can stop the known process group but return `unknown` without descendant evidence. Use a verified Linux/Computer path when confirmed termination is required.

Computer adapters require a new runner receipt with `supervision: 1` and matching invocation/process/environment-instance evidence. Legacy `exited` replies remain unconfirmed. Persisted business outcomes survive cleanup and are consumed on recovery without another prompt. Remote OpenCode creates one session per invocation; legacy, mismatched-generation or reused sessions are not aborted. Its `abort=true` and idle responses do not certify remote background-tool exit, so this remote mode does not claim strong completion support.

Pause drains already admitted turns and their required synchronous dependencies; it does not send cancellation or suspend a process in the middle of a tool. The host owns pause/resume admission and independent/shared task boundaries.

Run source validation from the `xpertai` workspace root with fresh platform dist:

```sh
XPERT_PLATFORM_ROOT=/path/to/xpert \
XPERT_RUNTIME_GUEST_TEST_IMAGE=node:22-bookworm \
NX_DAEMON=false corepack pnpm exec nx run agent-runtimes:verify-source
```

The optional guest image runs the process protocol fixtures and installed Claude SDK transport in a disposable network-isolated Linux container. It does not invoke real model services or establish full provider CLI acceptance. The normal verifier also loads and unloads the built plugin through `plugin-dev-harness`. No publishing, installation into a running platform, or deployment is performed.
