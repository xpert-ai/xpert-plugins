# Xpert Plugin: MarkItDown Middleware

`@xpert-ai/plugin-markitdown` bootstraps Microsoft's [MarkItDown](https://github.com/microsoft/markitdown) inside the agent sandbox and teaches the agent to convert files and URLs to Markdown through `sandbox_shell`.

## Knowledge Document Parser

The plugin also registers the `markitdown` knowledge parser for PDF, DOCX, PPTX, HTML/HTM, TXT and Markdown/MD. It runs conversion through platform Sandbox Jobs using the `document/python-3.12/v1` Runtime. The host supplies the tenant, organization and knowledge-base file scope; parser options cannot override it.

Knowledge conversion uses the platform's pinned Python and dependency lock. It does not use `MARKITDOWN_PYTHON`, agent CLI bootstrap settings, or install dependencies during a conversion. Scanned PDF pages are preserved as images for the knowledge base's image-understanding step; enable a vision model when OCR is needed. The parser reports empty and invalid files as failures.

Requirements:

- Plugin SDK 3.15.18 or later.
- A host version that provides the document Python Runtime and trusted `fileScope` to document transformers. Updating the SDK alone is insufficient.
- For local development, run `corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-python` from the host checkout before use. `verify:local-document-python` checks the environment without installing it.
- For deployed environments, build/publish the platform document Python image and configure its Runtime binding before enabling this parser.

## Upgrade From Organization Scope

Sandbox Actions require a system-level plugin. This release therefore changes MarkItDown from organization scope to system scope; the old organization installation cannot be upgraded in place.

1. Record existing organization plugin settings and the agents using `MarkItDownSkill`.
2. Preserve organization-specific `pipIndexUrl` and `pipExtraIndexUrl` on the corresponding agents' middleware options. Shared values may be configured as system defaults.
3. A platform administrator must remove legacy organization installations, then install the updated plugin at system scope. Do not retain both scopes for the same package: Sandbox Action registration rejects this combination.
4. Restart the API through the platform's normal plugin lifecycle, verify the Runtime is healthy, and reprocess a test document. Confirm existing agent CLI skills still use their intended bootstrap settings.

No document re-upload is required. The existing `MarkItDownSkill` strategy and its agent-level options remain available after migration.

## What This Middleware Does

- Installs `markitdown` via pip inside the sandbox on demand.
- Writes the embedded `SKILL.md` asset into the sandbox for agent self-guidance.
- Injects a short MarkItDown-specific `<skill>` prompt into model calls when sandbox support is available.
- Re-checks bootstrap state before real `markitdown` shell commands and refreshes the sandbox when version, extras, or skill assets drift.
- Warns when `MarkItDownSkill` is configured without sandbox support or without `SandboxShell` on the same agent.

## Quick Start

1. Register the plugin:

   ```sh
   PLUGINS=@xpert-ai/plugin-markitdown
   ```

2. Enable the sandbox feature for the target team or agent.

3. Add `SandboxShell` to the same agent.

4. Add a middleware entry with strategy `MarkItDownSkill`.

5. Optionally configure bootstrap behavior:

   ```json
   {
     "type": "MarkItDownSkill",
     "options": {
       "version": "latest",
       "extras": "all",
       "skillsDir": "/workspace/.xpert/skills/markitdown",
       "pipIndexUrl": "https://pypi.tuna.tsinghua.edu.cn/simple",
       "pipExtraIndexUrl": "https://mirrors.aliyun.com/pypi/simple"
     }
   }
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `version` | string | Version of `markitdown` to install via pip in the sandbox. | `"latest"` |
| `extras` | string | Pip extras to install, for example `all`, `pdf`, `docx`, `pptx`, `xlsx`, `xls`, `outlook`, `az-doc-intel`, `audio-transcription`, or `youtube-transcription`. | `"all"` |
| `skillsDir` | string | Path inside the sandbox where `SKILL.md` is written. | `"/workspace/.xpert/skills/markitdown"` |
| `pipIndexUrl` | string | Custom pip index URL for downloading packages (e.g., "https://pypi.tuna.tsinghua.edu.cn/simple"). | `undefined` (use pip default) |
| `pipExtraIndexUrl` | string | Additional pip index URL as fallback. | `undefined` |

## Runtime Behavior

- Bootstrap state is tracked in `/workspace/.xpert/.markitdown-bootstrap.json`.
- The middleware checks both the bootstrap stamp and the real sandbox state:
  - `markitdown` must still exist on `PATH`
  - the current `skillsDir` must still contain the skill assets
  - the configured `version` and `extras` must still match the recorded stamp
- If `markitdown` is already available on `PATH` but no bootstrap stamp exists yet, the middleware rewrites the managed assets and stamp without forcing a reinstall.
- If the tool is already present but skill assets are missing, the middleware rewrites the assets without reinstalling the package.
- If `version` or `extras` change, the middleware reruns pip install and refreshes the stamp.
- Only actual `markitdown` invocations are intercepted in `sandbox_shell`; plain text mentions such as `echo markitdown` are ignored.

## OCR, Plugins, and Azure

- This middleware no longer documents `ocr` as an official MarkItDown extra.
- In practice, OCR is usually supplied by an installed third-party plugin and enabled with `--use-plugins`.
- Azure Document Intelligence is supported through `-d -e` when the sandbox install includes `az-doc-intel` or `all`.

Examples:

```bash
markitdown report.pdf -o report.md
cat page.html | markitdown -x html
markitdown --list-plugins
markitdown --use-plugins scanned.pdf -o scanned.md
markitdown -d -e "https://your-resource.cognitiveservices.azure.com/" form.pdf -o form.md
```

## Sandbox Assets

During bootstrap, the plugin writes these files into the sandbox:

- `SKILL.md`

The injected prompt tells the agent to read that file before first use instead of embedding all CLI details directly in the system prompt.

## Validation Rules

The plugin contributes warnings when:

- `MarkItDownSkill` is used while sandbox support is disabled
- `MarkItDownSkill` is used without `SandboxShell` on the same agent

## Development and Validation

Run these commands from the repository root:

```bash
env NX_DAEMON=false pnpm -C xpertai exec nx build @xpert-ai/plugin-markitdown
env NX_DAEMON=false pnpm -C xpertai exec nx test @xpert-ai/plugin-markitdown --runInBand
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin ./middlewares/markitdown
```

The build output is written to `xpertai/middlewares/markitdown/dist`.
