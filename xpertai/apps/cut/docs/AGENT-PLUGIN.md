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
node --test scripts/build-agent-plugin.test.mjs
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
