# OpenAI plugins comparison and provenance

Compared on 2026-09-21 against
[`openai/plugins` commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89).
This is a source comparison, not a claim that every item in the Codex directory
has public source in that repository.

**All current presets are independently authored Xpert packages.**
They are not copies of OpenAI's packages, and Notion's four upstream workflows
have not been ported. The original relocation preserved package bytes. The subsequent Connector upgrade
publishes new bindings and retains the old conversation versions.

## Can an OpenAI package be used directly?

| Package form                                                           | Current Xpert behavior                                                                  | Required adaptation                                                                   |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------- |
| Standard Agent Plugins 1.0.0 root `plugin.json`, `skills/`, `mcp.json` | Portable components can be imported if they satisfy the supported schema and transports | Check each Skill's tools and host assumptions; display metadata may need `xpertai` |
| Legacy `.codex-plugin/plugin.json`, `.mcp.json`                        | Not recognized as a standard package by the current importer                            | Add a standard root manifest and explicitly translate the MCP configuration           |
| OpenAI `.app.json` registered-app reference                            | Does not provide Xpert a usable MCP endpoint or account authorization                   | Connect an independently supported provider endpoint and authorize the user in Xpert  |
| Desktop tools, hooks or OpenAI runtime-dependent Skills                | Not provided by this implementation                                                     | Separate host capability work; changing file names is insufficient                    |

Unknown `com.openai` metadata may be retained in a portable package, but Xpert
does not execute those OpenAI extensions. Import success does not establish Skill
or tool compatibility. See [OpenAI packaging documentation](https://developers.openai.com/plugins/build/plugins).

## Notion: exact differences

Upstream package version is **0.1.7**. Our version **1.1.0** is an independent preset
version, not an upgrade of OpenAI's package.

| Upstream file/content                                                                                                                                                         | Current Xpert file/content                                                                  | What differs and why                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plugins/notion/.codex-plugin/plugin.json`](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/.codex-plugin/plugin.json)        | [`notion/plugin.json`](../notion/plugin.json)                                               | Newly authored root 1.0.0 manifest; author is Xpert AI; description and version describe this smaller preset. No Nest module or npm entrypoint                                                                                                                                                                    |
| Top-level `interface`, local `assets/` paths and OpenAI display metadata                                                                                                      | `extensions["xpertai"].interface`                                                        | Only display name and icon are projected. Icon uses a URL to upstream `notion-small.svg`; no upstream asset file is bundled. Categories, screenshots, brand colors and default prompts are not mapped                                                                                                             |
| [`plugins/notion/.mcp.json`](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/.mcp.json) with `type: "http"`                    | [`notion/mcp.json`](../notion/mcp.json) with schema and `type: "streamable-http"`           | File name and transport discriminator follow Agent Plugins 1.0.0. Server key `notion` and URL `https://mcp.notion.com/mcp` are unchanged                                                                                                                                                                          |
| MCP `oauth_resource: "https://mcp.notion.com"`                                                                                                                                | Connector dependency in [`notion/plugin.json`](../notion/plugin.json)                       | Portable schema does not contain `oauth_resource`; Connector discovery/client registration supplies the authorization flow; the discovered resource is validated and retained for exchange/refresh. Discovery passed, but user consent/private page calls have not been verified; full auth parity is not claimed |
| [`.app.json`](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/.app.json) with an OpenAI registered app ID                      | Not copied                                                                                  | An OpenAI app ID is not an Xpert connector or credential. Xpert connects directly to Notion's public MCP endpoint                                                                                                                                                                                                 |
| [`skills/notion-knowledge-capture`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-knowledge-capture)           | Not copied                                                                                  | Structured knowledge-capture workflow, references and examples are absent                                                                                                                                                                                                                                         |
| [`skills/notion-meeting-intelligence`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-meeting-intelligence)     | Not copied                                                                                  | Meeting-preparation workflow, references and examples are absent                                                                                                                                                                                                                                                  |
| [`skills/notion-research-documentation`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-research-documentation) | Not copied                                                                                  | Research/report workflow, templates and examples are absent                                                                                                                                                                                                                                                       |
| [`skills/notion-spec-to-implementation`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-spec-to-implementation) | Not copied                                                                                  | Specification-to-task workflow, references and examples are absent                                                                                                                                                                                                                                                |
| Upstream Skills' literal `Notion:search`, `Notion:fetch`, app-connection instructions and schema assumptions                                                                  | New [`notion/skills/notion-workspace/SKILL.md`](../notion/skills/notion-workspace/SKILL.md) | A single generic search/read/requested-write Skill follows live tool schemas and Xpert's connection UI. It is not a line-for-line rewrite of the four upstream Skills                                                                                                                                             |
| Upstream `agents/openai.yaml`, `plugin.lock.json`, marketplace entries                                                                                                        | Not copied                                                                                  | OpenAI-specific discovery/runtime metadata is not required by this standard package                                                                                                                                                                                                                               |

## Exa: exact provenance

Neither `plugins/exa/` nor an Exa entry exists in the inspected public repository's
[default marketplace](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/.agents/plugins/marketplace.json)
or [API marketplace](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/.agents/plugins/api_marketplace.json).
The screenshot establishes that Codex lists Exa; it does not identify a downloadable
public package. This comparison does not assert that no Exa package exists elsewhere.

The following files are all newly authored, with no OpenAI source copied:

- `exa/plugin.json`: standard metadata and Xpert display extension.
- `exa/mcp.json`: Streamable HTTP configuration for the provider-documented
  `https://mcp.exa.ai/mcp` endpoint.
- `exa/skills/exa-research/SKILL.md`: public search/read guidance using the live tool
  schema, citations and explicit handling of provider limits.
- `exa/README.md`: setup and capability boundaries.

Source: [Exa's official MCP documentation](https://exa.ai/docs/get-started/exa-mcp).
Live Xpert execution reached `web_search_exa`, but the provider returned free-tier
rate limiting. This is not evidence of successful search results or Codex feature parity.

## Future reuse of upstream Notion Skills

Prefer a pinned upstream snapshot plus a small, reviewable patch when porting the
four workflows. Keep such work under this repository, for example
`agent-plugins/notion-upstream/`, without silently replacing the current preset.

1. Pin the upstream commit and retain each copied file's license/attribution.
2. Preserve all Skill-relative references, examples and required assets. Copying
   only the four `SKILL.md` files leaves their referenced material unavailable.
3. Add the portable manifest/MCP files and document the exact field conversions.
4. Replace host-specific connection instructions and reconcile tool names and
   schemas against the authenticated Notion MCP tools. Do not assume stripping
   `Notion:` is enough.
5. Review the packaging allowlist for required reference/license/assets files;
   the packer permits reviewed Skill assets and rejects hidden files, caches and symlinks.
6. Test each workflow, OAuth consent/revocation and requested-write approval, then
   publish a new binding. Existing conversations must retain their pinned versions.

This upstream workflow port is not part of the current minimal implementation.

## Connector upgrade and additional providers

No OpenAI Skill or executable source was copied for these additions. Each package
has one original minimal Skill which follows the authenticated server's live tool
schemas. This implements provider connectivity, not parity with every Codex workflow.

| Package        | Endpoint / changes                                                                                                                           | Host dependency                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Notion 1.1.0   | Keeps `https://mcp.notion.com/mcp`; adds `xpertai.connectors.notion` with `type: mcp_oauth`; removes legacy installer OAuth selection     | Generic workspace OAuth Connector                                |
| Linear 1.0.0   | New standard manifest, `https://mcp.linear.app/mcp`, original issue/project Skill                                                            | Generic workspace OAuth Connector                                |
| Supabase 1.0.0 | New standard manifest, `https://mcp.supabase.com/mcp?read_only=true`, original read-only Skill; query explicitly limits the provider's tools | Generic workspace OAuth Connector; path-based metadata discovery |
| Sentry 1.0.0   | New standard manifest, `https://mcp.sentry.dev/mcp`, original diagnostics Skill                                                              | Generic workspace OAuth Connector                                |
| Canva CN 1.0.0 | New standard manifest, `https://mcp.canva.cn/mcp`, original design Skill                                                                     | Existing `canva` Connector, resource `https://mcp.canva.cn`     |
| Exa 1.0.0      | Unchanged package and anonymous endpoint                                                                                                     | None                                                            |

These differences are inspectable in each package's `plugin.json`, `mcp.json`,
`skills/` and README. In the native Canva plugin the strategy declaration changes
from obsolete `connectionScope: 'user'` to
`authorizationModes: ['personal', 'shared']`: the host now creates shared workspace
bindings and rejects new personal authorization. Existing private credentials
require explicit administrator reconnection; they are not copied. Its OAuth
application setup stays in System Integrations.

The host introduces a generic Connector OAuth strategy, not a per-provider server
module. Credentials, browser-bound callback sessions, Assistant access checks, refresh and
disconnect reuse the existing Connector service. Old personal MCP OAuth resource versions require a new Connector-backed version. OpenAI/ChatGPT authorization is not imported.

A standards-compliant upstream package may still import directly when it uses
supported transports and host-independent Skills. Legacy Codex manifests, registered
app IDs and desktop-only execution are not made portable by this OAuth change.

## Documents migration (2026-09-23)

The installed Codex Documents 26.909.12148 bundle was inspected as reference material.
Its main implementation is Skill instructions, references and local document scripts,
not an MCP server. Its embedded license differs from the manifest's MIT label and
restricts redistribution. No upstream Skill text, executable or template is copied.
The separately bundled plugin display icon is [documented with the asset](../documents/assets/README.md).

`documents` 1.0.0 is independently authored for Xpert. It preserves the workflow
of writing DOCX, inspecting document structure, rendering pages, visually checking
them and iterating. It uses python-docx, a pinned Python environment, LibreOffice
Writer and PDFium. Rendering uses a separate LibreOffice profile and fresh output
directory; macOS supplies its installed font directories to headless Fontconfig.

| Codex capability/assumption | Xpert implementation |
| --- | --- |
| Legacy plugin manifest | Standard root `plugin.json`, portable Skill assets |
| Bundled desktop dependency cache | Dedicated desktop venv or PRO sandbox image |
| Shell and file tools | `xpertai.middlewares`: SandboxShell and SandboxFile |
| Page image inspection | Installed ViewImageMiddleware and an image-capable model |
| Render helper | Independently written LibreOffice/PDFium pipeline and SHA-256 receipt |
| Comments/redlines | Paragraph comments and conservative single-run tracked replacement |
| Artifact links | Xpert conversation workspace file delivery |

This is a first Documents implementation, not full Codex feature parity. Complex
OOXML edits need deliberate handling; native Google Docs requires a separate
Connector. The older native `xpertai/skills/documents` package is not replaced.
