# XpertAI Plugin: Codexpert Connector Middleware

`@xpert-ai/plugin-codexpert-connector` connects an Xpert agent to Codexpert coding sessions.

It exposes Codexpert context tools to the agent, runs Codexpert tasks synchronously, streams Codexpert-visible output to the user, and returns compact task metadata back to the agent.

For the Chinese documentation, see [README_zh.md](./README_zh.md).

## Current Runtime Model

- The plugin is a connector middleware, not a Codexpert runtime.
- Codexpert remains the source of truth for coding sessions, tasks, threads, executions, and environments.
- Xpert only owns agent orchestration and user-visible projection.
- The agent receives context tools plus final task metadata.
- The user sees Codexpert-visible text directly, after light cleanup.
- The plugin stores only a lightweight run mapping table for recovery and diagnostics.

## Design Principles

### Codexpert Owns Coding State

Codexpert owns MCP tools, coding session anchors, task execution, environment setup, and environment reuse.

The plugin does not clone repositories, create coding environments, or copy Codexpert task details into Xpert.

### The Plugin Connects And Projects

The plugin reads the current business principal from the Xpert runtime context, injects identity headers into Codexpert requests, and converts Codexpert stream events into Xpert-compatible visible text chunks.

### The Agent Receives Metadata

Codexpert text is projected to the user. The agent receives only compact terminal metadata, such as session id, task id, thread id, execution id, repository, branch, environment id, summary, and error.

The agent should not consume raw Codexpert stream events or summarize Codexpert output again.

## Code Entry Points

| Module | File |
| --- | --- |
| Plugin entry | `src/index.ts` |
| Middleware strategy | `src/lib/codexpert-connector.middleware.ts` |
| Codexpert HTTP / MCP client | `src/lib/codexpert-connector.client.ts` |
| Visible projection | `src/lib/codexpert-visible-projector.ts` |
| Types and config schema | `src/lib/types.ts` |
| Run mapping service | `src/lib/codexpert-connector-run.service.ts` |
| Run mapping entity | `src/lib/entities/codexpert-connector-run.entity.ts` |

The middleware strategy name is:

```text
CodexpertConnector
```

## Configuration

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `codexpertMcpUrl` | `string` | none | Codexpert MCP URL, for example `http://localhost:3001/v1/mcp`. |
| `codexpertConnectorBaseUrl` | `string` | none | Codexpert connector API base URL, for example `http://localhost:3001/api`. Do not include `/api/codexpert-connector`; the client appends the connector path. |
| `serviceToken` | `string` | none | Service token used for Codexpert MCP and connector stream requests. |
| `timeoutMs` | `number` | `600000` | Timeout for MCP calls and synchronous stream execution, in milliseconds. |
| `enableVisibleProjection` | `boolean` | `true` | Whether to project Codexpert-visible output to the user. |
| `enableStatusEvents` | `boolean` | `true` | Whether to project compact status milestones. |
| `defaultXpertId` | `string` | none | Default Codexpert coding assistant id. |
| `defaultRepoId` | `string` | none | Default repository id. |
| `defaultConnectionId` | `string` | none | Default Git connection id. |
| `defaultBranchName` | `string` | none | Default branch name. |

Example:

```json
{
  "codexpertMcpUrl": "http://localhost:3001/v1/mcp",
  "codexpertConnectorBaseUrl": "http://localhost:3001/api",
  "serviceToken": "<codexpert-service-token>",
  "timeoutMs": 600000,
  "enableVisibleProjection": true,
  "enableStatusEvents": true,
  "defaultXpertId": "<optional-codexpert-assistant-id>",
  "defaultRepoId": "<optional-repo-id>",
  "defaultConnectionId": "<optional-git-connection-id>",
  "defaultBranchName": "main"
}
```

If `codexpertMcpUrl`, `codexpertConnectorBaseUrl`, or `serviceToken` is missing, the middleware name is still registered, but no Codexpert tools are exposed.

## Identity Propagation

The plugin resolves the business principal from the current Xpert runtime context:

- `tenantId`
- `organizationId`
- `userId`

Every request to Codexpert includes:

```text
Authorization: Bearer <serviceToken>
tenant-id: <tenantId>
organization-id: <organizationId>
x-principal-user-id: <userId>
```

Rules:

- Missing `tenantId`, `organizationId`, or `userId` fails immediately.
- The plugin does not infer Codexpert users from external-platform open ids.
- Lark/Feishu users must already be bound to real business users on the Xpert side.

## Agent Tools

The plugin passes through these Codexpert MCP tools:

- `listCodingAssistants`
- `listCodexpertConversations`
- `listGitConnections`
- `listGitRepositories`
- `listGitBranches`
- `selectCodingContext`
- `resolveCodexpertConversationContext`
- `resumeCodexpertSession`

Pull request and issue-comment publishing tools are intentionally not exposed through this external connector. Codexpert/code agent owns repository writeback and PR delivery inside the coding task. If Codexpert creates a PR, the connector returns its URL as result metadata.

External Xpert agents should use this connector middleware instead of attaching the Codexpert MCP server as a standalone MCP toolset. A direct MCP toolset bypasses the connector filter and is reserved for Codexpert-side coding agents that own delivery actions.

The plugin also provides:

```text
runCodexpertTask
```

`runCodexpertTask` input:

| Field | Required | Description |
| --- | --- | --- |
| `prompt` | yes | Task prompt to send to Codexpert. |
| `taskTitle` | no | Optional task title. |
| `codingSessionId` | no | Existing Codexpert coding session. |
| `conversationId` | no | Context recovery key. |
| `threadId` | no | Context recovery key. |
| `taskId` | no | Context recovery key. |
| `xpertId` | no | Codexpert coding assistant id; falls back to `defaultXpertId`. |
| `repoId` | no | Codexpert repository id; falls back to `defaultRepoId`. |
| `connectionId` | no | Git connection id; falls back to `defaultConnectionId`. |
| `branchName` | no | Branch name; falls back to `defaultBranchName`. |
| `timeoutMs` | no | Per-call timeout override. |

Result returned to the agent:

```ts
type CodexpertTaskResult = {
  status: 'success' | 'failed' | 'timeout' | 'canceled'
  codingSessionId: string | null
  taskId: string | null
  threadId: string | null
  executionId: string | null
  repo: {
    id?: string | null
    name?: string | null
    owner?: string | null
    slug?: string | null
  } | null
  branch: string | null
  environmentId: string | null
  environmentReused: boolean | null
  summary: string | null
  error: string | null
  prUrl?: string | null
}
```

## Recommended Agent Flow

Without default context:

1. `listCodingAssistants`
2. `listGitConnections`
3. `listGitRepositories`
4. `listGitBranches`
5. `selectCodingContext`
6. `runCodexpertTask`

For an existing task or session:

1. `listCodexpertConversations` or `resolveCodexpertConversationContext`
2. `resumeCodexpertSession`
3. `runCodexpertTask`

If `defaultXpertId`, `defaultConnectionId`, `defaultRepoId`, and `defaultBranchName` are configured, `runCodexpertTask` can create a session without an explicit `codingSessionId`.

## Visible Projection

Codexpert stream events are converted into Xpert-compatible text chunks:

```ts
{
  type: 'text',
  text,
  xpertName: 'Codexpert',
  agentKey: 'codexpert'
}
```

Projection behavior:

- `text_delta` preserves spaces and Markdown as much as possible.
- The `thought` stream is filtered.
- `assistant_snapshot` is filtered once normal output text has already appeared.
- Raw metadata, debug messages, and setup logs are filtered.
- Setup noise such as dependency installation and clone progress is filtered.
- `done.summary` is only shown when no output text was projected.

Status milestones are enabled by default and deduplicated:

- `正在准备编码环境。`
- `编码环境已就绪。`
- `已开始处理。`
- `需要补充信息。`
- `已完成。`
- `Codexpert failed: <message>`

## Run Mapping Table

The plugin maintains a lightweight table:

```text
plugin_codexpert_connector_run
```

It records:

- `tenant_id`
- `organization_id`
- `user_id`
- `xpert_id`
- `conversation_id`
- `execution_id`
- `coding_session_id`
- `task_id`
- `thread_id`
- `codexpert_execution_id`
- `status`
- `last_error`
- `metadata`
- `created_at`
- `updated_at`

The table maps Xpert executions to Codexpert sessions, tasks, threads, and executions. It does not copy Codexpert task details or raw stream events.

## Local Development

Local testing needs three running pieces:

- Codexpert API, which owns coding sessions and task execution.
- Xpert API, which loads this middleware and provides the current business principal.
- The local `@xpert-ai/plugin-codexpert-connector` workspace.

### Codexpert Environment

Configure the Codexpert API environment first. The exact ports are up to your local setup, but the plugin URLs must point to the same Codexpert API instance.

For example, if Codexpert runs on `3001` and Xpert API runs on `3000`, then `codexpertMcpUrl` is `http://localhost:3001/v1/mcp`, `codexpertConnectorBaseUrl` is `http://localhost:3001/api`, and `XPERTAI_API_URL` is `http://localhost:3000/api`.

```env
# Codexpert API listen port.
PORT=<codexpert-api-port>

# Xpert API used by Codexpert when it creates tasks, environments, and related Xpert-side resources.
XPERTAI_API_URL=http://localhost:<xpert-api-port>/api

# Optional. Set this too when running the Codexpert web UI locally.
VITE_XPERTAI_API_URL=http://localhost:<xpert-api-port>/api

# Workspace API key used by Codexpert when calling Xpert APIs.
XPERTAI_WORKSPACE_API_KEY=<xpert-workspace-api-key>

# Token accepted by the Codexpert MCP endpoint.
MCP_SERVER_TOKEN=<codexpert-service-token>

# Optional additional MCP tokens. Use this when the connector should use a token
# different from MCP_SERVER_TOKEN.
MCP_SERVER_TOKENS=<optional-comma-separated-service-tokens>

# Token accepted by /api/codexpert-connector/*.
# If this is omitted, the connector endpoint also accepts MCP_SERVER_TOKEN,
# CODEXPERT_ACP_SERVICE_TOKEN, ACP_SERVICE_TOKEN, and MCP_SERVER_TOKENS.
CODEXPERT_CONNECTOR_SERVICE_TOKEN=<codexpert-service-token>

# Optional local user-id mapping when Xpert and Codexpert development data use
# different user ids for the same tester.
CODEXPERT_DEV_PRINCIPAL_USER_MAP={"<xpert-user-id>":"<codexpert-effective-user-id>"}
```

The middleware `serviceToken` must be accepted by both Codexpert request paths it calls:

- `POST /v1/mcp`
- `POST /api/codexpert-connector/sessions`
- `POST /api/codexpert-connector/sessions/:sessionId/prompts/stream`

For the simplest local setup, use the same value for `MCP_SERVER_TOKEN`, `CODEXPERT_CONNECTOR_SERVICE_TOKEN`, and the middleware `serviceToken`.

### Xpert Host Environment

The Xpert API must be able to install and load the local plugin workspace. Add the plugin workspace to `PLUGIN_WORKSPACE_ROOTS` in the Xpert API environment:

```env
PLUGIN_WORKSPACE_ROOTS=<absolute-path-to-xpert-plugins-repo>/xpertai/middlewares/codexpert-connector
```

`PLUGIN_WORKSPACE_ROOTS` may contain multiple roots separated by `;` or `,`. The local install `workspacePath` must be an absolute path on the Xpert API host and must be inside one of these allowed roots.

### Build The Plugin

From the `xpertai` workspace in the `xpert-plugins` repository:

```bash
cd <xpert-plugins-repo>
pnpm -C xpertai install
pnpm -C xpertai exec tsc -p middlewares/codexpert-connector/tsconfig.lib.json
```

### Install The Local Plugin Into Xpert

Install or refresh the local plugin in the Xpert API host:

```bash
cd <xpert-host-repo>

pnpm plugin:reinstall:local \
  @xpert-ai/plugin-codexpert-connector \
  <absolute-path-to-xpert-plugins-repo>/xpertai/middlewares/codexpert-connector \
  --api-url http://localhost:<xpert-api-port> \
  --org-id <xpert-organization-id> \
  --token <xpert-admin-jwt> \
  --build-cwd <absolute-path-to-xpert-plugins-repo>/xpertai \
  --build-command "./node_modules/.bin/tsc -p middlewares/codexpert-connector/tsconfig.lib.json"
```

You can also install it from the Xpert plugin settings UI by using:

```text
Plugin package name: @xpert-ai/plugin-codexpert-connector
Workspace path:      <absolute-path-to-xpert-plugins-repo>/xpertai/middlewares/codexpert-connector
```

### Configure The Agent Middleware

Add the `CodexpertConnector` middleware to the target Xpert agent and configure it with the Codexpert URLs and service token:

```json
{
  "codexpertMcpUrl": "http://localhost:3001/v1/mcp",
  "codexpertConnectorBaseUrl": "http://localhost:3001/api",
  "serviceToken": "<codexpert-service-token>",
  "timeoutMs": 600000,
  "enableVisibleProjection": true,
  "enableStatusEvents": true,
  "defaultXpertId": "<optional-codexpert-assistant-id>",
  "defaultRepoId": "<optional-codexpert-repo-id>",
  "defaultConnectionId": "<optional-codexpert-git-connection-id>",
  "defaultBranchName": "main"
}
```

If the default Codexpert context fields are omitted, the agent must first use the context tools to select or resume a coding context before calling `runCodexpertTask`.

### Smoke Test Checklist

- Xpert API is running and has loaded `@xpert-ai/plugin-codexpert-connector`.
- Codexpert API is running and accepts `Authorization: Bearer <codexpert-service-token>`.
- The middleware config points to the Codexpert API port, not the Xpert API port.
- The current Xpert request has `tenantId`, `organizationId`, and `userId`.
- `XPERTAI_WORKSPACE_API_KEY` lets Codexpert call the configured Xpert API.

## Boundaries

- The plugin is not a replacement for the Codexpert runtime.
- It does not implement coding environment creation, repository cloning, or task execution inside Xpert.
- It does not store Codexpert raw events.
- It requires a real business principal in the current Xpert context.
- `serviceToken` is a service-to-service credential and should not be provided by the agent or end user.
