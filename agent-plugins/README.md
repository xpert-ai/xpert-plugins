# Remote MCP Agent Plugins

These Xpert-authored Agent Plugins 1.0.0 packages connect to the providers' official
MCP endpoints. They use standard `plugin.json`, `mcp.json` and Skills, with the
versioned `cn.xpertai` extension for Connector dependencies. Package directories
contain no npm entrypoint, server module, installation script or credential.

| Package    | Capabilities                                 | Authorization                                                         |
| ---------- | -------------------------------------------- | --------------------------------------------------------------------- |
| `exa`      | Public web search and page reading           | Anonymous starter quota                                               |
| `notion`   | Workspace search/read and requested updates  | Workspace Connector OAuth                                              |
| `linear`   | Issues, projects and team workflows          | Workspace Connector OAuth                                              |
| `supabase` | Database/project inspection                  | Workspace Connector OAuth; MCP endpoint forces read-only mode          |
| `sentry`   | Errors, issues and diagnostics               | Workspace Connector OAuth                                              |
| `canva-cn` | Design operations exposed by Canva China MCP | Existing shared `canva` Connector and configured System Integration |

These are minimal, independently authored presets, not copies of the complete
OpenAI plugin workflows. See [provenance and exact differences](docs/UPSTREAM.md).

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
  notion linear supabase sentry
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
  exa notion linear supabase sentry canva-cn
```

Upload a ZIP through **Settings > Plugins > Agent Plugins**, choose the workspace
and publish. Connector requirements are read from `extensions["cn.xpertai"].connectors`;
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

The workspace-only authorization policy supersedes the historical personal-account
verification above. The local Connector harness now checks shared connections; it
does not migrate personal tokens or authorize third-party accounts.
