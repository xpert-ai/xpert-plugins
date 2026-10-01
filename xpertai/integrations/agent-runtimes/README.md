# Agent Runtimes

Native Xpert plugin providing `codex`, `pi`, `claude-code`, and `opencode` implementations of `IAgentRuntimeStrategy`. It also supplies the `AgentInvocation` middleware: ordinary tools call the host capability and never own a child graph or a provider process.

Requires the host SDK build containing `AgentRuntimeStrategy` and `AgentInvocationRuntimeCapability` (this source branch). The package remains private until the SDK changes are released and its peer version is updated to that release. The existing SDK semver range alone does not imply that published builds expose these new APIs. Release the host and SDK before this plugin. Installation level is **system**; organization administrators separately grant workspace access through immutable runtime bindings. No default profile or agent process is started on installation.

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

`command`, arguments, environment variable names and service URLs are administrator configuration. Tools accept only a prompt. Secrets are read from the runner environment, not stored in bindings, tool arguments or execution receipts. Pi uses `pi --mode rpc`. Claude Code requires the optional peer `@anthropic-ai/claude-agent-sdk` compatible with 0.3.278. OpenCode requires `serverUrl`; `authorizationEnvironmentKey` names an environment variable containing the complete Authorization header, and `workspaceRoot` names its server-side working directory.

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
    "mode": "wait"
  }]
}
```

`wait` checkpoints the parent through the host API. Resume the existing parent run after completion or an interaction; it inspects the existing invocation instead of sending a second prompt. `background` immediately returns an invocation ID. Use the owner's scoped `GET /api/agent-invocations/:id`, `POST /:id/cancel`, or `POST /:id/respond` routes for lifecycle control. The response body is `{ "interactionId": "...", "response": ... }`. Codex decisions are `accept`, `decline`, or `cancel`; Claude approvals are booleans. Parent graph resume payloads use this same shape for approval handling.

This package does not install a background wake-up scheduler or a new approval UI. Completion receipts persist while the parent is paused; the existing host resume route drives continuation. A host job can use the scoped capability to implement a wait policy without putting polling tools in the LLM loop.

## Capabilities and limits

| Provider | Execution and recovery | Interactions | Cancellation |
| --- | --- | --- | --- |
| Codex | App Server JSONL; process loss becomes unknown, no automatic relaunch | Command/file approval requests; unsupported requests rejected | Pending until turn completion acknowledges interruption |
| Pi | RPC JSONL; wait for agent_settled through retries; process loss becomes unknown | Extension UI unsupported and fails explicitly | Abort request; final receipt required |
| Claude Code | Agent SDK query; process loss becomes unknown | canUseTool permission callback; AskUserQuestion unsupported and denied | Abort and wait for stream termination |
| OpenCode | HTTP session/message; recover result by message identity without resend | Not advertised by this adapter | Server abort acknowledgement |

No adapter promises filesystem rollback, exactly-once remote effects, or restart recovery for an in-process runner. Explicit file references require a future materialization adapter and currently fail before launch. These are provider capability limits, not hidden fallbacks. Local runtime profiles should use trusted managed workers; a process manager here is not a distributed runner service.

## Verification

From `xpertai` after building the host SDK and contracts:

```sh
XPERT_PLATFORM_ROOT=/path/to/xpert NX_DAEMON=false corepack pnpm exec nx run agent-runtimes:verify
```

The verifier builds in a temporary workspace using fresh SDK dist artifacts. It does not relink the developer's running host. Tests exercise real JSONL subprocess transport, a local HTTP fixture, an injected Claude SDK, grants/version rejection, approvals, cancellation, completion, and loss recovery. It then loads the built plugin with `plugin-dev-harness` and closes the Nest context. It never launches a real third-party agent or reads its credentials. Live account/model and sandbox acceptance are separate deployment checks.
