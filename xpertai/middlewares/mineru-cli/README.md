# Xpert Plugin: MinerU CLI Middleware

`@xpert-ai/plugin-mineru-cli` is a CLI middleware plugin for the Xpert platform. It bootstraps a MinerU Python skill into the sandbox, appends MinerU usage guidance to the system prompt, and securely provisions the MinerU API token inside the sandbox when the MinerU script is executed through `sandbox_shell`.

## What It Does

- Registers a middleware strategy named `MinerUCLISkill`
- Writes `SKILL.md` and `scripts/mineru.py` into the sandbox under `/workspace/.xpert/skills/mineru-cli`
- Validates that `python3` is available in the sandbox
- Appends the MinerU skill description to the model system prompt
- Detects MinerU script execution via `sandbox_shell`
- Securely syncs the MinerU API token into `/workspace/.xpert/secrets/mineru_token` when an API token is configured
- Warns in draft validation when sandbox or `SandboxShell` is missing

## Middleware Config

| Field      | Type   | Description | Required | Default |
| ---------- | ------ | ----------- | -------- | ------- |
| `apiToken` | string | Optional MinerU API token securely provisioned inside the sandbox for the MinerU CLI script | No | `process.env.MINERU_TOKEN` |

## Runtime Behavior

1. On `beforeAgent`, the plugin ensures the skill files exist in the sandbox, writes a bootstrap stamp, and syncs the managed token file when configured.
2. On `wrapModelCall`, it appends a `<skill>...</skill>` block derived from `SKILL.md`.
3. On `wrapToolCall`, it only intercepts `sandbox_shell` calls that execute:

```bash
python3 /workspace/.xpert/skills/mineru-cli/scripts/mineru.py ...
```

When `apiToken` is configured, the middleware provisions the token into the sandbox under `/workspace/.xpert/secrets/mineru_token` and the script reads it automatically. The command itself is not rewritten with secrets. If no token is configured, the script falls back to MinerU's lightweight API.

Converted files are written into a per-run directory in the current working directory. Local files use `mineru_<source_name>`, URL inputs use the URL file name when available, URLs without a stable file name fall back to `mineru_<task_id>`, and repeated conversions append `_2`, `_3`, and so on instead of overwriting prior results.

## Development & Testing

Build the plugin:

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-mineru-cli
```

Run tests:

```bash
pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-mineru-cli
```

Validate plugin lifecycle with the harness:

```bash
node /path/to/xpert-plugins/plugin-dev-harness/dist/index.js \
  --workspace /path/to/xpert-plugins/xpertai \
  --plugin @xpert-ai/plugin-mineru-cli
```

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
