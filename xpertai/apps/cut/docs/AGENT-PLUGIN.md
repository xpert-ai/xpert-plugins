# Xpert Cut Agent Plugin

## Two installation entries, one editing workflow

- **Xpert users:** install `@xpert-ai/plugin-cut` through the existing
  `.xpertai-plugin/plugin.json` entry. Xpert owns Cut Runtime, Workbench, storage,
  permissions, transcription, render jobs and the Cut MCP Publication.
- **Codex / ChatGPT users:** install **Xpert Cut Agent Plugin**, then authenticate
  the intended **Xpert Cut MCP** connection. The client package contains shared
  Skills, portable metadata and an MCP connection declaration. It does not run
  NestJS, Whisper, FFmpeg, a database or another Cut server locally.

The five directories under `skills/` are the only editable workflow source.
Xpert loads them directly. MCP Prompts include the same skill bodies and MCP
entry instructions. The portable package copies those files byte-for-byte.
`references/xpert.md` and `references/mcp.md` describe the environment-specific
identity, read and file-transfer entry points; editing rules stay shared.

## Install from source into Codex

Prerequisites: Node.js 20+ and a Codex CLI supporting `plugin add`. The installer
checks PATH, then the Codex/ChatGPT desktop app bundles on macOS. For a custom
location, pass `--codex-path /absolute/path/to/codex`. No Xpert backend build or npm
installation is needed for this client installer.

From `xpertai/apps/cut`:

```sh
node scripts/install-codex.mjs
```

Enter your Cut MCP Publication URL, then its MCP API Key at the hidden prompt.
Obtain the key from the corresponding Xpert MCP publication/plugin connection
settings. The key must belong to that service and have publication access.
Do not enter an OpenAI API key or an Xpert browser login token.
The installer sends `Authorization: Bearer <key>` and verifies MCP initialization
and discovery of the published `cut_list_clips` tool before installation.
It never invokes editing tools or opens a browser.

For a desktop-local service only:

```sh
node scripts/install-codex.mjs --allow-local-http
```

This allows HTTP only on loopback hosts. Remote services require HTTPS.
Authentication is still required for local services.

The installer manages `~/.local/share/xpert-cut-codex/` as a private local plugin
source and registers it using the Codex CLI. It installs
`xpert-cut-agent@xpert-cut-codex-local`, independently of other configured MCPs.
It does not edit an existing `cut_local` connection or other installed plugins.
Connection settings are retained in `connection.json`; the generated local
plugin's `mcp.json` contains the authentication header. These credential files
use owner-only permissions on POSIX systems, and the installation directory is
private. Codex also maintains its own plugin cache. Do not share either local
installation or cache; use the credential-free builder below for distribution.

After installation, reload Codex and start a new task to load the Skills and MCP.
After pulling source updates, run:

```sh
node scripts/install-codex.mjs --update
```

Updates revalidate and reuse the saved address and key, rebuild shared Skills,
and reinstall through Codex with a new local cache version. To change services
or rotate a key, edit the managed `connection.json` locally and run `--update`.
If validation fails, the existing installation is preserved. If CLI registration
fails after local files are prepared, correct the CLI problem and retry with
`--update`; the managed source and credentials remain available.

A 401 means the service rejected authentication; verify the MCP key. A 403 means
publication access needs checking. A successful connection without the expected
Cut tool indicates a different or incompletely configured publication.
This script targets desktop Codex; it does not install into remote ChatGPT.

## Build for a selected MCP service

From the Cut source directory, with Node.js available:

```sh
node scripts/build-agent-plugin.mjs \
  --mcp-url https://your-xpert-host.example/api/mcp/p/your-publication \
  --output /absolute/existing/parent/xpert-cut-agent
```

Replace the example URL with the actual Cut MCP Publication URL. The output
parent must exist, the final directory must be new, and output must be outside
the Cut source directory. The builder accepts HTTPS and rejects credentials,
query strings and fragments. Configure authentication through the client;
never add bearer tokens to this command, the package or version control.

For desktop development, `--allow-local-http` also permits HTTP on `localhost`,
`127.0.0.1` or `[::1]` only. This opt-in does not permit remote HTTP or embedded
credentials. Loopback packages connect to the desktop's local service and cannot
be used by a remote ChatGPT service.

The output is a self-contained folder:

```text
xpert-cut-agent/
  plugin.json             # Agent Plugins 1.0 manifest, OpenAI presentation
  mcp.json                # streamable-http connection to the selected Cut MCP
  skills/                 # identical shared workflows and entry references
  assets/                 # Cut logo and composer icon
  README.md
```

The portable manifest's release version comes from the Cut package version.
There is no package.json, install hook, runtime binary or backend source in the
client output. The Xpert npm package keeps its existing file allowlist and entry;
the portable root manifest is not added to the Xpert npm archive.

The source-root `mcp.json` has an empty server map intentionally: it is not a
preconfigured connection and contains no invented public endpoint. Use the
builder for a connection-ready distribution. A direct source install supplies
skills only until a connection is configured separately.

## Installation and connection

Use the generated folder with a supported local/repo plugin marketplace for
local development. Local-source availability varies by client surface. For a
public ChatGPT/Codex listing, submit the portable package through the OpenAI
plugin publishing flow and register the reachable HTTPS MCP endpoint. A local
folder or this GitHub PR does not create a public marketplace listing.

On clients that require a registered MCP connection, register the chosen
Publication in developer mode and authenticate it using the host-supported
method. The package never embeds an account-specific registered-app ID. Public
ChatGPT access also depends on account/workspace plugin and developer-mode
availability; a desktop-local URL is not a publicly reachable service.

After installation, verify discovery of Cut tools and Resource Templates, read
an authorized existing project, then perform the explicitly requested workflow.
Multiple Cut services must be disambiguated before writing; file references and
project IDs remain bound to the selected service. Upload/download uses that
Publication's authenticated file endpoints and requires client file-transfer
support. The agent reports unsupported transfer instead of claiming delivery.

## Checks

```sh
node --test scripts/build-agent-plugin.test.mjs scripts/install-codex.test.mjs scripts/codex-mcp-check.test.mjs scripts/install-codex-cli.test.mjs scripts/codex-cli.test.mjs
```

With a compatible `codex` executable, run the real CLI integration test in an
isolated temporary Codex configuration:

```sh
CUT_TEST_CODEX=1 node --test scripts/install-codex-cli.test.mjs scripts/codex-cli.test.mjs
```

The package test checks endpoint binding, identical shared skill content,
recursive references, absence of runtime files and refusal to overwrite output
or embed credentials. Source tests also check Assistant binding and MCP Prompt
routing. Live client authentication, remote reachability, elicitation and binary
transfer still need acceptance on the intended service.

Specification: [OpenAI portable plugin packaging](https://developers.openai.com/plugins/build/plugins).
The portable entry is root `plugin.json` plus `mcp.json`; the older
`.codex-plugin/plugin.json` layout is a compatibility option, not the source of
truth for this package.

## Tool profiles in Codex

The shared catalogue is `skills/cut-agent-skill/references/tool-profiles.json`.
Native Xpert registers four base queries plus discovery/execution gateways;
operation schemas are returned on demand inside the plugin. Codex's public
configuration supports a static allowlist for the existing MCP tools.
The MCP endpoint therefore retains the full compatible tool directory by default.

From the Cut source, inspect profiles or generate a static configuration fragment:

```sh
node scripts/codex-tool-profiles.mjs --list
node scripts/codex-tool-profiles.mjs --profiles timeline-visual
node scripts/codex-tool-profiles.mjs --profiles speech-evidence,proposal-create,proposal-manage,caption-authoring,caption-commit,export-video --pending-jobs
```

The output targets `xpert-cut-agent@xpert-cut-codex-local`; use `--plugin` for a
different installed plugin ID. Merge `enabled_tools` into the matching table in
Codex configuration, preserving credentials and other settings; do not duplicate
the table. Reload the client. These commands never modify local configuration.
Select the union of all required stages for static presets. An eight-tool visual
preset is not suitable for an entire speech/captions/export workflow.

Reference: [Codex MCP configuration](https://developers.openai.com/codex/mcp).

## Native decorated registration

`CutToolProvider` is the single registered provider for Middleware and native MCP.
Its `@XpertTool` methods expose the four base queries on both surfaces, all other
published operations on MCP only, and discovery/execution gateways on Middleware
only. Operation metadata lives in `cut-operation-definitions.ts`; original scoped
business implementations remain in the internal Cut operation registry.
Resources and prompts are supplied by `getMcpExtensions`; they are not converted
into model tools. Transcription and export retain their task policies. Shared
input validation runs before the stricter MCP project/file checks. Native calls
retain the existing Workbench context hooks and scoped file capability.

This migration requires SDK 3.18.6 or later within major version 3, containing
the decorated MCP extensions. Do not deploy this plugin with an older SDK. The legacy
`CutNativeToolset`/`CutToolsetStrategy` exports remain for compatibility, but are
not registered by the plugin; there is no second provider claiming `cut`.
