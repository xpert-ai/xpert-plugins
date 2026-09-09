# Xpert Plugin: Lark CLI Middleware

`@xpert-ai/plugin-lark-cli` is a CLI middleware plugin for the Xpert platform. It bootstraps the Lark CLI tool into the sandbox, downloads AI Agent Skills from the larksuite/cli GitHub repository, and teaches the agent how to interact with Lark/Feishu through `sandbox_shell`.

## What It Does

- Registers a middleware strategy named `LarkCLISkill`
- Installs the pinned `@larksuite/cli@1.0.93` npm package in the sandbox
- Downloads the complete official Skill bundle from the `v1.0.93` release commit (`2aebe8970f0a472dfc864b6ac3d19d080e75041f`), including `lark-slides` references, XML schema, examples, and validation scripts
- Preserves the upstream MIT license alongside the installed Skill bundle
- Supports optional shared proxy settings for both npm package and skill downloads
- Supports optional npm registry or mirror overrides for installing `@larksuite/cli`
- Supports user-level (OAuth), bot-level (App ID/Secret), and Feishu workspace connector authentication
- Validates that `node` is available in the sandbox
- Appends the Lark CLI skill description to the model system prompt
- Detects Lark CLI execution via `sandbox_shell`
- Securely syncs bot credentials into `/workspace/.xpert/secrets/`
- Warns in draft validation when sandbox or `SandboxShell` is missing

## Plugin Config

Configure organization-wide download behavior at plugin level:

```json
{
  "proxy": "http://proxy.example.com:7890",
  "npmRegistryUrl": "https://registry.npmmirror.com"
}
```

| Field | Type | Description | Default |
|-------|------|-------------|---------|
| `proxy` | string | Optional shared HTTP(S) proxy URL used for both `npm install` and GitHub skill downloads during bootstrap | unset |
| `npmRegistryUrl` | string | Optional npm registry or mirror URL used only for `npm install -g @larksuite/cli` | unset |

## Middleware Config

| Field | Type | Description | Required | Default |
|-------|------|-------------|----------|---------|
| `authMode` | `'user'` \| `'bot'` \| `'connector'` | Authentication mode: user-level (OAuth), bot-level (App ID/Secret), or Feishu workspace connector | No | `'user'` |
| `appId` | string | Lark App ID for bot-level authentication | Yes (if authMode='bot') | - |
| `appSecret` | string | Lark App Secret for bot-level authentication | Yes (if authMode='bot') | - |
| `connectorId` | string | Optional workspace connector ID for connector authentication; when omitted, the platform resolves the active Feishu connector | No | - |

## Runtime Behavior

1. On `wrapModelCall`, it appends a `<skill>...</skill>` block with Lark CLI usage instructions when a sandbox backend is available.
2. The `lark-cli-skill-ensure` tool installs and verifies the complete Skill bundle before the Agent reads `lark-slides/SKILL.md`.
3. The `lark-cli-auth-ensure` and `lark-cli-wait-user` tools check authentication lazily. In connector mode, they use the active workspace Feishu OAuth connector and do not start device login.
4. On `wrapToolCall`, it intercepts `sandbox_shell` calls that execute `lark-cli` commands and then lazily installs Lark CLI, downloads skills, and syncs credentials before the command runs.
5. In bot mode, credentials are synced into `/workspace/.xpert/secrets/`. In connector mode, runtime-only connector credentials are written under `/workspace/.xpert/secrets/lark-cli-connectors/` and sourced for the wrapped command.
6. Bootstrap state is tracked in `/workspace/.xpert/.lark-cli-bootstrap.json`, including the configured `proxy` and `npmRegistryUrl`.
7. Any change to `proxy`, `npmRegistryUrl`, the pinned CLI/Skill version, the installed `lark-cli` binary, or required Slides files triggers a fresh bootstrap.
8. For presentation tasks, the Agent must read `lark-slides/SKILL.md`, create a `slide_plan.json`, generate and lint SML/XML, publish through `lark-cli slides`, and read the result back for validation.
9. When a presentation also needs a local copy, the Agent runs `lark-cli drive +export` and reports the resulting sandbox-relative `.pptx` path. The Lark plugin does not add a separate workspace-persistence tool.

## Available Skills

The following skills are downloaded from the larksuite/cli GitHub repository:

| Skill | Description |
|-------|-------------|
| `lark-shared` | App config, auth login, identity switching (auto-loaded) |
| `lark-calendar` | Calendar events, agenda, free/busy queries |
| `lark-im` | Send/reply messages, group chat management |
| `lark-doc` | Create, read, update documents |
| `lark-drive` | Upload, download files, manage permissions |
| `lark-sheets` | Create, read, write spreadsheets |
| `lark-slides` | Plan, create, validate, inspect, and edit native Feishu presentations |
| `lark-base` | Tables, fields, records, dashboards |
| `lark-task` | Tasks, task lists, subtasks |
| `lark-mail` | Browse, search, send emails |
| `lark-contact` | Search users, get profiles |
| `lark-wiki` | Knowledge spaces, nodes |
| `lark-event` | Real-time event subscriptions |
| `lark-vc` | Meeting records, minutes |
| `lark-whiteboard` | Whiteboard/chart rendering |
| `lark-minutes` | Meeting minutes metadata |
| `lark-openapi-explorer` | Explore underlying APIs |
| `lark-skill-maker` | Custom skill creation |
| `lark-workflow-meeting-summary` | Meeting summary workflow |
| `lark-workflow-standup-report` | Standup report workflow |

## Slides / PPT Capability

The middleware provides the complete open-source `lark-slides` authoring workflow and keeps `lark-cli` as its execution layer:

```text
Xpert Agent -> slide_plan.json -> SML/XML + lint -> lark-cli slides -> native Feishu Slides -> readback/screenshot validation
```

Supported operations include creating native presentations, adding or deleting slides, updating a full slide, replacing individual blocks, uploading slide media, reading presentation XML, taking slide screenshots, and importing an existing PPTX through Drive before editing it as Slides.

This capability does not call Feishu's private Doubao PPT generation service or expose the Feishu template gallery. Template-driven generation requires an accessible PPTX file or an existing Feishu presentation that the authorized user can read.

The upstream CLI and Skill bundle are provided by [larksuite/cli](https://github.com/larksuite/cli) under the MIT License. The Xpert plugin itself remains AGPL-3.0.

## Development & Testing

Build the plugin:

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-lark-cli
```

Run tests:

```bash
pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-lark-cli
```

Validate plugin lifecycle with the harness:

```bash
node /path/to/xpert-plugins/plugin-dev-harness/dist/index.js \
  --workspace /path/to/xpert-plugins/xpertai \
  --plugin @xpert-ai/plugin-lark-cli
```

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
