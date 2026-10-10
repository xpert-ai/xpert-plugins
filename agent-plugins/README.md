# Xpert Agent Plugins

These Xpert-authored Agent Plugins 1.0.0 packages provide sandbox document workflows
and connections to providers' official MCP endpoints. They use standard `plugin.json`,
Skills and optional `mcp.json`, with the versioned `xpertai` extension for
middleware and Connector dependencies. Package directories
contain no npm entrypoint, server module, installation script or credential.

| Package    | Capabilities                                 | Authorization                                                         |
| ---------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `documents` | DOCX creation, comments, revisions and page review | Interactive sandbox, Documents runtime and image-capable model |
| `pdf` | PDF creation, extraction, page operations, forms and visual review | Interactive sandbox, PDF runtime and image-capable model |
| `presentations` | Editable PPTX generation, conservative text edits and slide review | Interactive sandbox, Presentations runtime and image-capable model |
| `spreadsheets` | Native XLSX, formulas, charts/tables, conservative cell edits and page review | Interactive sandbox, Spreadsheets runtime and image-capable model |
| `exa`      | Public web search and page reading           | Anonymous starter quota                                               |
| `asana`    | Tasks, projects, and portfolios the user can access | Workspace Connector OAuth; scope `default` |
| `notion`   | Workspace search, capture, research, and spec-to-task workflows | Workspace Connector OAuth                                     |
| `slack`    | Channels, canvases, and files the user can access | Workspace Connector OAuth; own Slack app                          |
| `google-drive` | Drive, Docs, Sheets, and Slides          | Workspace Connector OAuth; Google preview program and web client       |
| `github`   | Repositories, issues, and pull requests      | Workspace Connector OAuth; own GitHub OAuth App                        |
| `figma`    | Internal-only Figma file reads and requested writes | Workspace Connector OAuth; Figma catalog and Developer Terms  |
| `monday`   | Boards, items, and docs the user can access | Workspace Connector OAuth; minimum scope TBD |
| `linear`   | Issues, projects and team workflows          | Workspace Connector OAuth                                              |
| `atlassian` | Jira, Confluence, and other Atlassian cloud data the user can access | Workspace Connector OAuth; minimum scope is the v2 protected-resource list |
| `supabase` | Database/project inspection                  | Workspace Connector OAuth; MCP endpoint forces read-only mode          |
| `stripe`   | Stripe account reads and requested API writes | Workspace Connector OAuth; scope `mcp` |
| `sentry`   | Errors, issues and diagnostics               | Workspace Connector OAuth                                              |
| `clickup`  | Tasks, docs, and workspace hierarchy the user can access | Workspace Connector OAuth; scopes `read` and `write` |
| `canva-cn` | Design operations exposed by Canva China MCP | Existing shared `canva` Connector and configured System Integration |
| `canva`    | Global Canva designs the connected user can access | Workspace Connector OAuth key `canva-global`; does not replace `canva-cn` |

Notion 1.2.0 ports four upstream Skills with rewritten tool names. The other
presets in this catalog stay as they are. See [provenance and exact differences](docs/UPSTREAM.md).

Slack is a new package for the official remote MCP server. It does not copy the OpenAI-registered Slack client id or `.app.json`. See [provenance and exact differences](docs/UPSTREAM.md).

Google Drive is a new package for Google's remote Docs, Sheets, and Slides MCP servers. It complements the local `documents`, `pdf`, `presentations`, and `spreadsheets` packages and does not replace them. No upstream client secret is copied. See [provenance and exact differences](docs/UPSTREAM.md).

GitHub is a new package for the official remote MCP server. It does not copy an OpenAI client secret or `.app.json`. See [provenance and exact differences](docs/UPSTREAM.md).

Figma is an internal-only package for the official remote MCP server. It is not a Marketplace release. Upstream Figma skill files are not copied. See [provenance and exact differences](docs/UPSTREAM.md).

`monday` is a new package for `https://mcp.monday.com/mcp`. It does not embed an OAuth client id, client secret, or token, and it does not use the deprecated SSE URL.

`stripe` is a new package for `https://mcp.stripe.com`. It does not embed an OAuth client id, client secret, token, or API key.

`clickup` is a new package for `https://mcp.clickup.com/mcp`. It does not embed an OAuth client id, client secret, or token.

`canva` is a new package for global Canva at `https://mcp.canva.com/mcp`. Its Connector and MCP server key is `canva-global`. It does not embed an OAuth client id, client secret, or token, and it does not modify or replace `canva-cn`.

`asana` is a new package for `https://mcp.asana.com/v2/mcp`. It does not embed an OAuth client id, client secret, or token, and it does not use the deprecated `/sse` URL.

`atlassian` is a new package for `https://mcp.atlassian.com/v2/mcp`. It does not embed an OAuth client id, client secret, or token.

Documents is a Skill package without an MCP server or OAuth connection. Prepare
its desktop or PRO sandbox dependencies using [Documents setup](documents/README.md),
then publish it to a workspace and select it in a conversation with sandbox enabled.
It contributes SandboxShell, SandboxFile and ViewImageMiddleware for that run.
PDF uses the same middleware contract with a separate [PDF runtime](pdf/README.md).
Presentations adds an independent [editable PPTX workflow](presentations/README.md)
with pinned Node/Python dependencies and LibreOffice Impress.
Spreadsheets adds an independent [XLSX workflow](spreadsheets/README.md), using the
published `@xpert-ai/artifact-tool` package, Univer OSS, Excelize WASM and Calc.

## Plugin display icons

New packages use the short `extensions.xpertai` namespace. Upgrade the Xpert / PRO
host together with these packages; older hosts only read the previous namespace.
Updated hosts still accept `extensions["cn.xpertai"]` for existing packages, but
prefer `xpertai` when both are present, without merging their contents.

Configure portable plugin icons in `plugin.json` at
`extensions["xpertai"].interface.icon`. This field is an image URL string, not
the native npm plugin's `IconDefinition` or an Assistant `avatar` object. The
portable interface has no separate `avatar`, `composerIcon` or `logo` fields.

Documents, PDF, Presentations and Spreadsheets include the corresponding Codex
`assets/icon.png` and embed its bytes as a `data:image/png;base64,...` URL in the
manifest. This works offline after import. Relative paths such as
`./assets/icon.png` are not resolved by the portable host. To regenerate an icon
value after replacing its PNG, run from that plugin's directory:

```sh
node --input-type=module -e 'import { readFileSync } from "node:fs"; console.log("data:image/png;base64," + readFileSync("assets/icon.png").toString("base64"))'
```

Copy the printed value into `interface.icon`, then package and import the updated
plugin. Existing imported packages retain their previous descriptor until replaced;
use the quickstart installer's `--replace` for an existing workspace resource.
See each package's `assets/README.md` for icon provenance.

Canva China, Linear, Sentry, Supabase, Slack, Google Drive, GitHub, ClickUp, and Atlassian also bundle icons copied unchanged from
their corresponding Codex plugins in `openai/plugins`. Each package embeds its
PNG or SVG bytes in `interface.icon`; its `assets/README.md` records the upstream
commit, selected asset and SHA-256. Their 1.0.1 packages add display icons without
changing Connector configuration. Exa and Notion retain their existing image URLs.

## Final deliverables

Documents, PDF, Presentations and Spreadsheets 1.0.2 require the host's
SandboxFile `present_files({paths})` tool. The Agent selects final deliverables
after verification; the host validates and saves immutable output cards. Writes
and Shell commands record file changes without automatically displaying drafts.
No delivery flags are added to existing tools and no new sandbox dependency is
needed. Re-select the updated plugin in existing conversations to use its new
instructions; older messages and pinned file versions remain available.

## Install

Run in `xpert-plugins/agent-plugins`, using its declared package manager:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm quickstart --list
corepack pnpm quickstart --install \
  --platform-root "$XPERT_PLATFORM_ROOT" \
  --api-url http://localhost:3333 \
  --org-id "$XPERT_ORG_ID" \
  --workspace-id "$XPERT_WORKSPACE_ID" \
  asana notion slack google-drive github figma monday linear atlassian supabase stripe sentry clickup canva
```

`XPERT_PLATFORM_ROOT` is the source checkout with dependencies installed. The
installer uses the platform's existing environment/Keychain authentication helper,
checks workspace access, and sends organization-scoped requests. Plugin names are
required for installation; Canva is intentionally not installed implicitly.

A matching enabled binding is reused. To migrate an existing legacy OAuth binding
or deliberately replace its package/configuration, append `--replace`. This creates
a new resource version and preserves conversations pinned to the old version. It
does not transfer old private credentials. A workspace administrator authorizes
the shared connection once. Subsequent versions with the same endpoint, scopes and
registration mode reuse that workspace connection.

No Assistant graph update or publication is needed. Refresh the conversation page
after administrative installation to reload its cached directory. Choose
**Plugins > Connect plugins**. If the workspace is not connected, administrators
open workspace Connector settings; other users contact their administrator. The
workspace flow owns OAuth, encrypted storage and refresh. ChatKit observes readiness
and resumes selection; failed configuration retains the draft and selections. Installing a package does not grant external access.

For Canva, first install/update `xpertai/connectors/canva-connector`, configure its
System Integration and create a **shared** workspace binding for provider
`canva`. Then install `canva-cn`. A token for global Canva's REST API cannot satisfy this package's `https://mcp.canva.cn` resource requirement.

## Administrator UI / Git import

```sh
corepack pnpm quickstart --pack --output-dir /tmp/xpert-agent-plugins \
  documents pdf presentations spreadsheets exa asana notion slack google-drive github figma monday linear atlassian supabase stripe sentry clickup canva-cn canva
```

Upload a ZIP through **Settings > Plugins > Agent Plugins**, choose the workspace
and publish. Connector requirements are read from `extensions["xpertai"].connectors`;
no legacy OAuth checkbox is needed. Git imports can select the corresponding
`agent-plugins/<name>` subdirectory of this repository at a pinned ref.

`quickstart.json` is an Xpert installer recipe, not a third-party marketplace.
Neither manifests nor Skills contain client secrets, account tokens or host IDs.

## Connector integration

- `type: "mcp_oauth"`: the host discovers protected-resource and authorization-server
  metadata, registers a public client, and uses PKCE with the discovered OAuth
  resource. A separate pinned MCP SDK handles modern OAuth discovery without
  replacing the existing transport SDK. Optional preregistered clients use the
  existing Connector configuration form.
- `type: "existing"`: resolve a logical provider through a pre-existing shared
  workspace Connector. The package declares its expected OAuth resource/scopes;
  host IDs and credentials are supplied by the workspace administrator, never the bundle.
- Generic OAuth providers are keyed by tenant, organization, canonical endpoint,
  requested scopes and registration mode. Each workspace owns its connection;
  private accounts and credentials are never copied into shared connections.
- Before every MCP request, the host rechecks resource publication, installed
  toolset configuration, runtime identity, Assistant/workspace/project access and shared Connector
  readiness. Revocation blocks subsequent calls, including calls from MCP Apps.
- Credential-only Connectors are dependencies of plugins; they are not offered as
  independent Agent middleware. Existing middleware Connectors keep their behavior.

## Tests and results

```sh
corepack pnpm test
corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"
```

The lifecycle harness packages and extracts each real ZIP through the production
extractor/parser and checks content digests, Skills, MCP and Connector bindings.
See [live Connector harness](../plugin-dev-harness/README.md) for the disposable
local OAuth/MCP integration test. It uses an already-published test Assistant and
disables its temporary resources afterwards.

Verified locally on 2026-09-21:

- All six bundles passed production import/lifecycle checks.
- Notion, Linear, Supabase and Sentry were published to the test workspace. Their
  real discovery/client registration returned authorization URLs with S256 PKCE
  and OAuth resource parameters. Their catalog status remains **requires_auth**.
- The disposable local OAuth server completed browser-bound authorization, token
  refresh and a real Agent MCP tool call. Replacing its resource reused the account,
  retained the old version and left the Assistant graph unchanged. MCP App UI
  content loaded after restoring the connection from the persisted execution
  context. Disconnecting the account invalidated the catalog and blocked further
  reads from an already-issued App instance.
- Exa's earlier real `web_search_exa` call returned anonymous quota exhaustion;
  successful search results are not claimed.
- Real third-party consent and private-data calls require a workspace administrator
  to configure an approved test connection. Canva's package/build checks do not establish a live Canva connection.

The former Supabase metadata-discovery incompatibility is fixed by the Connector
OAuth adapter. OpenAI Developers remains excluded because its public endpoint was
unavailable from the earlier test network. Google Workspace, desktop tools and
OpenAI registered-app IDs need separate provider/runtime integrations.

Provider documentation: [Exa](https://exa.ai/docs/get-started/exa-mcp),
[Notion](https://developers.notion.com/guides/mcp/build-mcp-client),
[Linear](https://linear.app/docs/mcp),
[Supabase](https://supabase.com/docs/guides/ai-tools/mcp),
[Sentry](https://mcp.sentry.dev/).

Checked on 2026-10-10 for the Notion 1.2.0 skill port. `corepack pnpm test`
covers packaging and the rewritten skill text. Live Notion consent and private
page calls were not run. Publish a new binding; do not silently replace
conversations pinned to 1.1.0. See [Notion 可用性测试说明](notion/README.md).

Checked on 2026-10-10 for the Slack package structure only. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live Slack consent
was not run. See [Slack 可用性测试说明](slack/README.md).

Provider documentation added for this package: [Slack MCP](https://docs.slack.dev/ai/slack-mcp-server/).

Checked on 2026-10-10 for the Google Drive package. Unauthenticated `tools/list`
succeeded for the four MCP endpoints. `corepack pnpm test` covers the manifest,
Connector declarations, and ZIP allowlist. Authenticated reads and writes were
not run. See [Google Drive 可用性测试说明](google-drive/README.md).

Provider documentation added for this package: [Google Workspace](https://developers.google.com/workspace).

Checked on 2026-10-10 for the GitHub package structure only. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live GitHub consent
and private repository calls were not run. See [GitHub 可用性测试说明](github/README.md).

Provider documentation added for this package: [GitHub MCP](https://github.com/github/github-mcp-server).

Checked on 2026-10-10 for the Figma package structure only. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live Figma consent
was not run. See [Figma 可用性测试说明](figma/README.md).

Provider documentation added for this package: [Figma MCP](https://developers.figma.com/docs/figma-mcp-server/).

Checked on 2026-10-10. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live monday.com consent
was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"`
passed with the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts`
(Node v22.14.0, pnpm 10.24.0). This package's result was `PASS monday: distributed ZIP, production parser, digest, Skills and MCP binding`.
See [monday.com usability test](monday/README.md).

Provider documentation added for this package: [monday.com Platform MCP](https://developer.monday.com/api-reference/docs/mondaycom-mcp).

Checked on 2026-10-10. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live Stripe consent
was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"`
passed with the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts`
(Node v22.14.0, pnpm 10.24.0). This package's result was `PASS stripe: distributed ZIP, production parser, digest, Skills and MCP binding`.
See [Stripe usability test](stripe/README.md).

Provider documentation added for this package: [Stripe MCP](https://docs.stripe.com/mcp).

Checked on 2026-10-10. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live ClickUp consent
was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"`
passed with the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts`
(Node v22.14.0, pnpm 10.24.0). This package's result was `PASS clickup: distributed ZIP, production parser, digest, Skills and MCP binding`.
See [ClickUp usability test](clickup/README.md).

Provider documentation added for this package: [ClickUp MCP](https://developer.clickup.com/docs/connect-an-ai-assistant-to-clickups-mcp-server).

Checked on 2026-10-10. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live Canva consent
was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"`
passed with the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts`
(Node v22.14.0, pnpm 10.24.0). This package's result was `PASS canva: distributed ZIP, production parser, digest, Skills and MCP binding`.
`canva-cn` is unchanged and still uses its existing Connector with provider `canva`. See [Canva usability test](canva/README.md).

Provider documentation added for this package: [Canva MCP](https://www.canva.dev/docs/mcp/).

Checked on 2026-10-10. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live Asana consent
was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"`
passed with the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts`
(Node v22.14.0, pnpm 10.24.0). This package's result was `PASS asana: distributed ZIP, production parser, digest, Skills and MCP binding`.
See [Asana usability test](asana/README.md).

Provider documentation added for this package: [Asana MCP](https://developers.asana.com/docs/using-asanas-mcp-server).

Checked on 2026-10-10. `corepack pnpm test`
covers the manifest, Connector declaration, and ZIP allowlist. Live Atlassian consent
was not run. On 2026-10-10, `corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"`
passed with the host checkout containing `packages/server-ai/src/agent-plugin/agent-plugin-parser.ts`
(Node v22.14.0, pnpm 10.24.0). This package's result was `PASS atlassian: distributed ZIP, production parser, digest, Skills and MCP binding`.
Protected-resource metadata for `https://mcp.atlassian.com/v2/mcp` was published. Minimum OAuth scope is that document's full `scopes_supported` list.
See [Atlassian usability test](atlassian/README.md).

Provider documentation added for this package: [Atlassian remote MCP](https://support.atlassian.com/atlassian-rovo-mcp-server/docs/getting-started-with-the-atlassian-remote-mcp-server/).

The workspace-only authorization policy supersedes the historical personal-account
verification above. The local Connector harness now checks shared connections; it
does not migrate personal tokens or authorize third-party accounts.
