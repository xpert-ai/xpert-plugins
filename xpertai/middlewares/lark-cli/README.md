# Xpert Plugin: Lark CLI Middleware

`@xpert-ai/plugin-lark-cli` is a CLI middleware plugin for the Xpert platform. It bootstraps the Lark CLI tool into the sandbox, downloads AI Agent Skills from the larksuite/cli GitHub repository, and teaches the agent how to interact with Lark/Feishu through `sandbox_shell`.

## What It Does

- Registers a middleware strategy named `LarkCLISkill`
- Installs `@larksuite/cli` npm package in the sandbox
- Downloads 19 AI Agent Skills from the larksuite/cli GitHub repository
- Supports optional shared proxy settings for both npm package and skill downloads
- Supports optional npm registry or mirror overrides for installing `@larksuite/cli`
- Supports both user-level (OAuth) and bot-level (App ID/Secret) authentication
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
| `authMode` | `'user'` \| `'bot'` | Authentication mode: user-level (OAuth) or bot-level (App ID/Secret) | No | `'user'` |
| `appId` | string | Lark App ID for bot-level authentication | Yes (if authMode='bot') | - |
| `appSecret` | string | Lark App Secret for bot-level authentication | Yes (if authMode='bot') | - |

## Runtime Behavior

1. On `beforeAgent`, the plugin ensures the Lark CLI is installed, skills are downloaded, and bot credentials are synced if configured.
2. On `wrapModelCall`, it appends a `<skill>...</skill>` block with Lark CLI usage instructions.
3. On `wrapToolCall`, it intercepts `sandbox_shell` calls that execute `lark-cli` commands.
4. Bootstrap state is tracked in `/workspace/.xpert/.lark-cli-bootstrap.json`, including the configured `proxy` and `npmRegistryUrl`.
5. Any change to `proxy`, `npmRegistryUrl`, the installed `lark-cli` binary, or the required `lark-shared` skill file triggers a fresh bootstrap.

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
