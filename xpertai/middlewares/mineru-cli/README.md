# Xpert Plugin: MinerU CLI Middleware

`@xpert-ai/plugin-mineru-cli` adds MinerU document parsing support to Xpert agents by bootstrapping a managed `mineru` wrapper into the agent sandbox and teaching the agent how to use it through `sandbox_shell`. The middleware does not install external Python packages or register a standalone tool. Instead, it writes skill assets, a secret env file, a wrapper command, and a standard-library-only Python runner into the sandbox.

## Key Features

- Writes embedded MinerU skill assets (`SKILL.md`, API notes, runner scripts) into the sandbox.
- Injects `MINERU_TOKEN` through a managed secret env file instead of asking the agent to export credentials manually.
- Exposes a stable `mineru` command at `/workspace/.xpert/bin/mineru`.
- Uses a Python standard library runner that requests upload URLs, uploads local files, polls batch results, and downloads extraction archives.
- Appends MinerU-specific system guidance so the agent reads the skill file and uses `sandbox_shell` correctly.
- Re-checks bootstrap state before `mineru` shell commands and recreates sandbox assets when the secret or skill version changes.
- Validates agent drafts and warns when sandbox support or `SandboxShell` is missing.

## Quick Start

1. **Register the Plugin**
   ```sh
   PLUGINS=@xpert-ai/plugin-mineru-cli
   ```

2. **Enable Sandbox Support**
   Turn on the agent sandbox feature for the team/agent that will use MinerU.

3. **Add `SandboxShell` on the Same Agent**
   This middleware relies on the `sandbox_shell` tool exposed by the `SandboxShell` middleware.

4. **Add the MinerU Middleware**
   In the Xpert console (or agent definition), add a middleware entry with strategy `MinerUSkill`.

5. **Configure the API Key**
   Example middleware block:
   ```json
   {
     "type": "MinerUSkill",
     "options": {
       "apiKey": "your-mineru-api-key",
       "skillsDir": "/workspace/.xpert/skills/mineru",
       "wrapperPath": "/workspace/.xpert/bin/mineru"
     }
   }
   ```

6. **Ask the Agent to Parse Local Files**
   ```text
   User: Parse ./docs/report.pdf with MinerU and summarize the markdown output.
   Agent: (runs `mineru --file ./docs/report.pdf --output ./output` via sandbox_shell)
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `apiKey` | string | MinerU API token injected into the sandbox as `MINERU_TOKEN`. | required |
| `skillsDir` | string | Path inside the sandbox where `SKILL.md`, references, and runner scripts are written. | `"/workspace/.xpert/skills/mineru"` |
| `wrapperPath` | string | Absolute path of the managed `mineru` wrapper inside the sandbox. | `"/workspace/.xpert/bin/mineru"` |

## Runtime Behavior

- On first use, the middleware checks `/workspace/.xpert/.mineru-cli-bootstrap.json`.
- If bootstrap is missing, outdated, or the secret fingerprint changed, it:
  - verifies `python3` is available
  - writes skill assets under `/workspace/.xpert/skills/mineru`
  - writes `/workspace/.xpert/secrets/mineru.env`
  - writes `/workspace/.xpert/bin/mineru`
  - refreshes the bootstrap stamp
- The system prompt tells the agent to:
  - use `mineru` via `sandbox_shell`
  - read the skill file before first use
  - avoid exporting or echoing API keys manually
  - inspect generated Markdown before summarizing results
- For `sandbox_shell` calls that execute `mineru`, the middleware rewrites the command to the managed wrapper path and enforces a longer timeout:
  - `--file`: minimum `900` seconds
  - `--dir`: minimum `1800` seconds

## Sandbox Assets

The bootstrap service writes:

- `SKILL.md`
- `references/api_reference.md`
- `scripts/mineru_runner.py`
- `scripts/mineru_v2.py`
- `scripts/mineru_stable.py`
- `/workspace/.xpert/secrets/mineru.env`
- `/workspace/.xpert/bin/mineru`
- `/workspace/.xpert/.mineru-cli-bootstrap.json`

## Validation Rules

The plugin contributes draft validation warnings in Xpert when:

- the agent uses `MinerUSkill` but sandbox support is disabled
- the agent uses `MinerUSkill` without `SandboxShell` on the same agent

## Configuration Precedence

Configuration is resolved in this order, from lowest to highest priority:

1. Built-in defaults
2. Environment variables:
   - `MINERU_SKILLS_DIR`
   - `MINERU_WRAPPER_PATH`
3. Plugin-level config resolved by the host plugin config resolver
4. Middleware `options`

## Development & Testing

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-mineru-cli
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-mineru-cli
```

Run lifecycle validation after building:

```bash
node /path/to/xpert-plugins/plugin-dev-harness/dist/index.js \
  --workspace /path/to/xpert-plugins/xpertai \
  --plugin @xpert-ai/plugin-mineru-cli
```

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
