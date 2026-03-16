# Xpert Plugin: Playwright CLI Middleware

`@xpert-ai/plugin-playwright-cli` adds browser automation support to Xpert agents by bootstrapping `@playwright/cli` inside the agent sandbox and teaching the agent how to use it through `sandbox_shell`. Instead of registering a standalone tool, the middleware prepares the sandbox runtime, injects Playwright usage guidance into the system prompt, and keeps `playwright-cli` commands aligned with a managed Chromium configuration.

## Key Features

- Bootstraps `@playwright/cli` globally inside the sandbox on first use.
- Installs the Chromium browser runtime required by `playwright-cli`.
- Writes embedded skill assets (`SKILL.md` plus reference docs) into the sandbox for agent self-guidance.
- Appends a Playwright-specific system prompt so the agent uses `sandbox_shell` with `playwright-cli` instead of unsupported alternatives.
- Re-checks bootstrap state before Playwright shell commands and re-installs automatically if the sandbox container was reset.
- Injects a managed config for `playwright-cli open` so Chromium is used by default when no browser/config is specified.
- Caps `playwright-cli open` shell calls to a short timeout so the browser session starts quickly without blocking the workflow.
- Validates agent drafts and warns when sandbox support or `SandboxShell` is missing.

## Installation

```bash
pnpm add @xpert-ai/plugin-playwright-cli
# or
npm install @xpert-ai/plugin-playwright-cli
```

> **Note**: Ensure the host service already provides `@xpert-ai/plugin-sdk`, `@metad/contracts`, `@nestjs/common@^11`, `@nestjs/event-emitter`, `@langchain/core@^0.3`, `zod`, and `chalk`. These are treated as peer/runtime dependencies in the host environment.

## Quick Start

1. **Register the Plugin**  
   Start Xpert with the package in your plugin list:
   ```sh
   PLUGINS=@xpert-ai/plugin-playwright-cli
   ```
   The plugin registers the global `PlaywrightCliPluginModule`.
2. **Enable Sandbox Support**  
   Turn on the agent sandbox feature for the team/agent that will run browser automation.
3. **Add `SandboxShell` on the Same Agent**  
   This middleware relies on the `sandbox_shell` tool exposed by the `SandboxShell` middleware.
4. **Add the Playwright Middleware**  
   In the Xpert console (or agent definition), add a middleware entry with strategy `PlaywrightCLISkill`.
5. **Optionally Configure the Bootstrap Behavior**  
   Example middleware block:
   ```json
   {
     "type": "PlaywrightCLISkill",
     "options": {
       "cliVersion": "latest",
       "skillsDir": "/workspace/.xpert/skills/playwright-cli"
     }
   }
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `cliVersion` | string | Version of `@playwright/cli` to install globally in the sandbox. | `"latest"` |
| `skillsDir` | string | Path inside the sandbox where `SKILL.md` and reference files are written. | `"/workspace/.xpert/skills/playwright-cli"` |

## Runtime Behavior

- On first use, the middleware checks `/workspace/.xpert/.playwright-cli-bootstrap.json` to determine whether the sandbox is already bootstrapped.
- If bootstrap is missing or outdated, it installs `@playwright/cli`, installs Chromium via `playwright-cli install chromium`, writes skill assets, and refreshes the stamp file.
- A managed config is written to `/workspace/.xpert/playwright-cli/cli.config.json` and is automatically injected into `playwright-cli open` commands when the command does not already specify `--browser` or `--config`.
- The middleware appends a system prompt that tells the agent to:
  - use `playwright-cli` rather than `playwright` or `npx playwright`
  - read the sandbox skill file before first use
  - prefer headless, non-interactive workflows
  - avoid `codegen`, UI mode, and `show`
- When the agent calls `sandbox_shell` with a Playwright command, the middleware ensures bootstrap has completed before the command runs.
- For `playwright-cli open` commands, `timeout_sec` is automatically capped to `15` seconds so the shell call returns promptly after the browser is launched. If the shell call times out, the browser session may still remain active in the sandbox.
- Non-Playwright `sandbox_shell` commands are passed through unchanged.

## Validation Rules

The plugin contributes draft validation warnings in Xpert when:

- the agent uses `PlaywrightCLISkill` but sandbox support is disabled
- the agent uses `PlaywrightCLISkill` without `SandboxShell` on the same agent

## Sandbox Assets

During bootstrap, the plugin writes the following assets into the sandbox:

- `SKILL.md` with recommended `playwright-cli` command patterns
- reference documents for advanced topics such as session management, request mocking, tracing, storage state, video recording, test generation, and running custom code
- a managed Playwright config that pins default browser startup to Chromium
- a bootstrap stamp file used to avoid unnecessary reinstallation

## Configuration Precedence

Configuration is resolved in this order, from lowest to highest priority:

1. Built-in defaults
2. Environment variables:
   - `PLAYWRIGHT_CLI_VERSION`
   - `PLAYWRIGHT_SKILLS_DIR`
3. Plugin-level config resolved by the host plugin config resolver
4. Middleware `options`

## Development & Testing

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-playwright-cli
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-playwright-cli
```

TypeScript output is emitted to `middlewares/playwright-cli/dist`.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
