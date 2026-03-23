# Xpert Plugin: Zip/Unzip CLI Middleware

`@xpert-ai/plugin-zip-unzip-cli` adds sandboxed `zip` / `unzip` support to Xpert agents by preparing the agent sandbox and teaching the model how to use those system commands through `sandbox_shell`. The middleware does not register a standalone tool. It only checks or installs the binaries inside the sandbox, uploads embedded skill files, and injects usage guidance into the agent prompt.

## Key Features

- Checks whether `zip` and `unzip` are present in the sandbox on first use.
- Installs `zip` and `unzip` with `apt` automatically when the sandbox image does not already include them.
- Writes embedded skill assets (`SKILL.md` and workflow references) into the sandbox at `/workspace/.xpert/skills/zip-unzip` by default.
- Appends Zip/Unzip-specific system guidance so the agent uses `sandbox_shell` consistently.
- Re-checks bootstrap state before `sandbox_shell` commands that invoke `zip` or `unzip`.
- Blocks interactive `zip -e` password prompts, which can hang in non-interactive sandbox sessions.
- Validates agent drafts and warns when sandbox support or `SandboxShell` is missing.

## Quick Start

1. **Register the Plugin**
   ```sh
   PLUGINS=@xpert-ai/plugin-zip-unzip-cli
   ```

2. **Enable Sandbox Support**
   Turn on the agent sandbox feature for the team/agent that will handle archive tasks.

3. **Add `SandboxShell` on the Same Agent**
   This middleware depends on the `sandbox_shell` tool exposed by the `SandboxShell` middleware.

4. **Add the Zip/Unzip Middleware**
   In the Xpert console (or agent definition), add a middleware entry with strategy `ZipUnzipCLISkill`.

5. **Ask the Agent to Work with Archives**
   ```text
   User: Compress ./project into backup.zip but exclude node_modules and *.log files.
   Agent: (reads SKILL.md, then runs `zip -r backup.zip ./project -x "*/node_modules/*" "*.log"` via sandbox_shell)
   ```

## Configuration

This middleware does not expose runtime configuration in v1. Skill assets are always written to:

`/workspace/.xpert/skills/zip-unzip`

## Runtime Behavior

- On first use, the middleware checks `/workspace/.xpert/.zip-unzip-bootstrap.json`.
- If the stamp is missing or outdated, it verifies whether `zip` and `unzip` exist in `PATH`.
- If either binary is missing, it checks for `apt` and runs:
  - `DEBIAN_FRONTEND=noninteractive apt update`
  - `DEBIAN_FRONTEND=noninteractive apt install -y zip unzip`
- After bootstrap, it writes:
  - `SKILL.md`
  - `references/common-workflows.md`
  - the bootstrap stamp file
- The system prompt tells the agent to:
  - use `sandbox_shell` for all archive operations
  - read the sandbox skill file before first use
  - avoid interactive commands such as `zip -e`
  - choose `unzip -o` or `unzip -n` explicitly when overwrite behavior matters
- Non-archive `sandbox_shell` commands are passed through unchanged.

## Validation Rules

The plugin contributes draft validation warnings when:

- the agent uses `ZipUnzipCLISkill` but sandbox support is disabled
- the agent uses `ZipUnzipCLISkill` without `SandboxShell` on the same agent

## Sandbox Assets

During bootstrap, the middleware writes the following assets into the sandbox:

- `SKILL.md`
- `references/common-workflows.md`
- `/workspace/.xpert/.zip-unzip-bootstrap.json`

## Configuration Precedence

This middleware currently uses a fixed internal configuration with no user overrides.

## Development & Testing

```bash
pnpm -C xpertai exec nx build @xpert-ai/plugin-zip-unzip-cli
pnpm -C xpertai exec nx test @xpert-ai/plugin-zip-unzip-cli
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-zip-unzip-cli
```

If the local Node version is too new for the harness, use Node 20:

```bash
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-zip-unzip-cli
```

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
