# OpenAI plugins comparison and provenance

Compared on 2026-09-21 against
[`openai/plugins` commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89).
This is a source comparison, not a claim that every item in the Codex directory
has public source in that repository.

**Presets other than the four Notion workflows are independently authored Xpert packages.**
They are not copies of OpenAI's packages. Notion 1.2.0 ports those four upstream
Skills under `notion/skills/` from the pinned commit, with tool names and connection
copy rewritten. The original relocation preserved package bytes. Publishing a new
package version creates a new binding and retains older conversation pins.

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

Upstream package version is **0.1.7**. Our version **1.2.0** is this repository's
preset version, not an upgrade number of OpenAI's package. 1.1.0 was the minimal
Connector preset. 1.2.0 adds the four ported Skills and does not change the
Connector. Publish a new binding for 1.2.0. Existing conversations keep the
version they pinned. `--replace` migrates the workspace binding only.

| Upstream file/content                                                                                                                                                         | Current Xpert file/content                                                                  | What differs and why                                                                                                                                                                                                                                                                                              |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [`plugins/notion/.codex-plugin/plugin.json`](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/.codex-plugin/plugin.json)        | [`notion/plugin.json`](../notion/plugin.json)                                               | Newly authored root 1.0.0 manifest; author is Xpert AI; description and version describe this smaller preset. No Nest module or npm entrypoint                                                                                                                                                                    |
| Top-level `interface`, local `assets/` paths and OpenAI display metadata                                                                                                      | `extensions["xpertai"].interface`                                                        | Only display name and icon are projected. Plugin icon remains a URL to upstream `notion-small.svg`. Ported skills include their original skill assets and MIT LICENSE.txt. Categories, screenshots, brand colors and default prompts are not mapped                                                                                                             |
| [`plugins/notion/.mcp.json`](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/.mcp.json) with `type: "http"`                    | [`notion/mcp.json`](../notion/mcp.json) with schema and `type: "streamable-http"`           | File name and transport discriminator follow Agent Plugins 1.0.0. Server key `notion` and URL `https://mcp.notion.com/mcp` are unchanged                                                                                                                                                                          |
| MCP `oauth_resource: "https://mcp.notion.com"`                                                                                                                                | Connector dependency in [`notion/plugin.json`](../notion/plugin.json)                       | Portable schema does not contain `oauth_resource`; Connector discovery/client registration supplies the authorization flow; the discovered resource is validated and retained for exchange/refresh. Discovery passed, but user consent/private page calls have not been verified; full auth parity is not claimed |
| [`.app.json`](https://github.com/openai/plugins/blob/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/.app.json) with an OpenAI registered app ID                      | Not copied                                                                                  | An OpenAI app ID is not an Xpert connector or credential. Xpert connects directly to Notion's public MCP endpoint                                                                                                                                                                                                 |
| [`skills/notion-knowledge-capture`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-knowledge-capture)           | [`notion/skills/notion-knowledge-capture`](../notion/skills/notion-knowledge-capture) | Whole skill directory except `agents/openai.yaml`. Hosted tool names replace `Notion:` aliases. Connector wording replaces the bundled-app connection block. MIT `LICENSE.txt` kept |
| [`skills/notion-meeting-intelligence`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-meeting-intelligence)     | [`notion/skills/notion-meeting-intelligence`](../notion/skills/notion-meeting-intelligence) | Same port rules as knowledge capture |
| [`skills/notion-research-documentation`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-research-documentation) | [`notion/skills/notion-research-documentation`](../notion/skills/notion-research-documentation) | Same port rules as knowledge capture |
| [`skills/notion-spec-to-implementation`](https://github.com/openai/plugins/tree/1dc195897af4161d039b80d8471ec0a10c9bbc89/plugins/notion/skills/notion-spec-to-implementation) | [`notion/skills/notion-spec-to-implementation`](../notion/skills/notion-spec-to-implementation) | Same port rules as knowledge capture |
| Upstream Skills' literal `Notion:search`, `Notion:fetch`, app-connection instructions and schema assumptions                                                                  | Rewritten tool names plus [`notion/skills/notion-workspace/SKILL.md`](../notion/skills/notion-workspace/SKILL.md) | Hosted names are `notion-search` and `notion-fetch`. This host is not a ChatGPT client, so the unprefixed aliases are not used. `notion-workspace` remains the general skill |
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

## Notion Skills port (2026-10-10)

The four workflows now live under `notion/skills/`, not a separate
`notion-upstream/` tree. `notion-workspace` stays. Version **1.2.0** must be
published as a new binding. Conversations pinned to 1.1.0 keep that version.

Completed against commit `1dc195897af4161d039b80d8471ec0a10c9bbc89`:

1. Each copied file keeps Notion Labs' MIT `LICENSE.txt`.
2. References, examples, evaluations, and image assets were copied with the skill.
   `agents/openai.yaml` was not copied.
3. The existing root `plugin.json` and `mcp.json` stay. Transport remains
   `streamable-http`. No `oauth_resource` field was added.
4. `Notion:<tool>` was rewritten to the hosted Notion MCP name. `Notion:search`
   and `Notion:fetch` became `notion-search` and `notion-fetch`, matching
   [Notion's supported tools](https://developers.notion.com/guides/mcp/mcp-supported-tools).
   Connection copy now points at the workspace Connector and does not ask for tokens.
5. Skill markdown, JSON, text, PNG, and SVG files are inside the packer allowlist.

Authenticated Notion consent, private-page calls, and end-to-end workflow runs
were not executed in this change. Live tool schemas still win if Notion renames
a tool. See [Notion 可用性测试说明](../notion/README.md).

## Connector upgrade and additional providers

Notion's four workflows are the upstream Skill text copied in this change, and
that copy is rewritten as described above. Other packages in this catalog keep
their existing presets. This implements provider connectivity, not parity with
every Codex workflow.

| Package        | Endpoint / changes                                                                                                                           | Host dependency                                                 |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| Notion 1.2.0   | Keeps `https://mcp.notion.com/mcp` and `xpertai.connectors.notion` with `type: mcp_oauth`; adds the four ported Skills                        | Generic workspace OAuth Connector. Publish a new binding        |
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
The separately bundled plugin display icon is documented below.

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

## PDF migration

The installed Codex PDF 26.909.12148 bundle is also a Skill wrapper, with no PDF
MCP server. It uses local Python libraries, Poppler and Codex artifact-operation
and citation conventions. Xpert's `pdf` 1.0.0 is independently authored; no upstream
Skill text, artifact marker, Skill assets or executable is copied.
The separately bundled plugin display icon is documented below.

Xpert uses ReportLab, pdfplumber, pypdf and PDFium in a separate Python environment.
PDFium replaces the Poppler executable dependency and explicitly initializes forms
before rendering page widgets. The host mounts the portable Skill assets and adds
SandboxShell, SandboxFile and ViewImageMiddleware through `xpertai`.

The implementation adds bounded extraction, source preservation, page operations,
fresh render receipts, a checksum-pinned Noto TrueType font and conservative form
validation. It checks canonical field values against page widgets and their
appearances, supports ordinary ASCII text/checkbox filling and explicit flattening,
and rejects ambiguous/orphan relationships instead of attempting silent repair.
Complex forms, OCR, signatures and encrypted PDFs are not covered by this package.
Delivery uses Xpert Files; Codex-specific operation markers/citations are omitted.

Primary references: [pypdf forms](https://pypdf.readthedocs.io/en/latest/user/forms.html),
[pdfplumber](https://github.com/jsvine/pdfplumber),
[ReportLab](https://www.reportlab.com/docs/reportlab-userguide.pdf),
[PDFium Python bindings](https://pypdfium2.readthedocs.io/en/stable/), and
[pinned Noto font source](https://github.com/google/fonts/tree/2894aab31764f10f29c421bdfd2340d3b382d384/ofl/notosanssc).

## Presentations migration

The installed Codex Presentations 26.909.12148 Skill delegates authoring to the
bundled `@oai/artifact-tool`. Its local runtime distribution is private and is
not a production redistribution dependency for Xpert. No Codex Skill text,
templates, helper code or private runtime is included in this package.

Xpert Presentations 1.0.0 uses PptxGenJS 4.0.1, python-pptx and an independently
authored JSON schema, OOXML inspector/editor and Impress/PDFium renderer. Native
text, tables, images, bar/line/pie charts and chart workbooks stay editable.
Exact text edits preserve every other package part and require a current source
hash. The host contributes shell, file and image tools; delivery uses Xpert Files.
Two original themes replace dependence on proprietary templates. Rendering and
the existing browser PPTX editor are separate implementations, so both are tested.

Primary implementation references: [PptxGenJS](https://github.com/gitbrent/PptxGenJS),
[python-pptx](https://python-pptx.readthedocs.io/en/latest/), and
[LibreOffice conversion filters](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html).

V1 excludes native Google Slides, complex imported-template editing, animation
authoring and full PowerPoint fidelity. The older native Presentations plugin
remains independent; select the portable workspace resource for this workflow.

## Spreadsheets migration

Xpert Spreadsheets 1.0.0 is independently authored. Its npm SDK
`@xpert-ai/artifact-tool` 0.1.0 contains no OpenAI artifact-tool code, private
binaries or copied Skill text. It is not an API-compatible replacement.

Excelize WASM 0.1.3 authors native XLSX; Univer OSS 0.25.1 calculates the bounded
formula subset shared with the platform editor. JSZip/xmldom preserve the original
OPC package when updating cells, formula results, table headers and chart caches.
LibreOffice Calc renders a disposable copy to PDF; PDFium produces page images.
The authoritative workbook never undergoes a LibreOffice save round trip.

The independent SDK is published as `@xpert-ai/artifact-tool` on npm. Platform
desktop and PRO Docker runtimes should pin a released version and its dependency
lockfile; migrating older vendored-tarball installations is a separate host change.
The portable ZIP contains a manifest, Skill, references, launcher and display icon,
and performs no dependency installation during Agent conversations.

V1 excludes full Excel compatibility, live Google Sheets, macro execution, pivot
authoring, array/shared/structured-reference formulas and collaborative editing.
The browser saves values/formulas and preserves other package objects; it rejects
unsupported structural/formatting edits and displays native charts through PDF/PNG
previews. Source-byte checks detect changes before saving but are not an atomic
server-side compare-and-swap. See the plugin acceptance document for coverage.

Primary sources: [Excelize WASM](https://github.com/xuri/excelize-wasm),
[Univer OSS](https://github.com/dream-num/univer),
[JSZip](https://github.com/Stuk/jszip) and
[xmldom](https://github.com/xmldom/xmldom).

## Plugin display icons (2026-09-24)

Documents, PDF, Presentations and Spreadsheets reuse the corresponding root
`assets/icon.png` from the installed OpenAI Codex plugin bundle `26.909.12148`.
These are the plugins' `interface.composerIcon` assets, outside the Skill folders;
the upstream plugin manifests identify OpenAI as author and declare MIT.
Each Xpert package preserves the unchanged PNG and an `assets/README.md` with its
source and SHA-256. This reuse is limited to display icons; the implementations
and Skills remain independently authored.

Xpert's portable interface supports a single `icon` string. The manifests embed
the PNG bytes as data URLs, because the host passes this value directly to the
resource catalog without resolving relative package asset paths. Codex's separate
`composerIcon` and `logo` fields are not added to the Xpert extension.
