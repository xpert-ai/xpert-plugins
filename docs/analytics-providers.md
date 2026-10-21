# Analytics Provider configuration and release

This implementation uses one Analytics contract. It does not decode or migrate historical Bindings or saved dashboards. `contractVersion` identifies the provider operation contract; DefinitionVersion and ArtifactVersion identify immutable resource content. They are not parallel versions of the Analytics protocol.

| Provider | Configuration entry | Source |
| --- | --- | --- |
| `file.table` | Agent selects a runtime file; system registers its reader and columns | Definition + version |
| `rest.json` | Configure an OpenAPI toolset in its workspace; Agent inspects and registers an approved dataset | Definition + version |
| `mcp.tool` | Configure an MCP toolset in its workspace; Agent inspects and registers an approved tool mapping | Definition + version |
| `data-xpert.ontology` | Settings → Integrations → data-xpert Analytics stores API URL/audience; Agent registers that Integration with the current Assistant identity | Definition + version |
| `workspace_script.query` | `workspace_dataset_register` creates the script Artifact; Settings → Analytics lists accessible registered sources | Artifact + version |
| PostgreSQL, MySQL, Doris | Existing database connection entry, backed by an actual registered database driver | DataSource |

The five native Providers register no DataSource Type. Plugin installation is system-level; configuration and execution retain the current tenant, organization and viewer. Definition visibility does not grant file/toolset/upstream access. Provider configuration contains server-side connection references; Bindings contain only `source`, query payload, parameters and output contract. Management validation normalizes schema/defaults. Automatic registration additionally previews real input and rechecks access; discovery and dashboard preview still run before saving.

A Binding uses one source reference: `{kind:"data-source",dataSourceId}`, `{kind:"definition",definitionId,versionId}` or `{kind:"artifact",artifactId,versionId}`. Source IDs are UUIDs. Never place source identity in payload. Publishing appends a version; existing canonical Bindings remain pinned until explicitly edited. Archiving a Definition prevents its versions from executing. Live Dashboard preview receipts, saved documents, HTML rendering and sharing use the same source identity.

## Paired release and verification

This PR depends on the platform implementation following xpert-ai/xpert#1198 and references xpert-ai/xpert-plugins#762. Both the platform and these eight plugins request patch releases. Host peers currently target `^3.26.1`, the next patch after the published Contracts/SDK 3.26.0. This is a planned minimum for the paired release, not a claim that it is already published or compatible; verify the actual release containing the canonical Analytics API and adjust this minimum before releasing the plugins.

Until the matching Contracts/SDK patch is published, the plugin PR remains a draft. The existing public 3.25.0 **development dependency lock is only an installable bootstrap**, not a compatible build dependency. Use the companion platform checkout to verify source changes:

```sh
# Install dependencies in both repositories with their pinned Corepack pnpm.
# First build the companion platform SDK (this also builds Contracts).
cd "$XPERT_PLATFORM_ROOT"
NX_DAEMON=false corepack pnpm exec nx build plugin-sdk
# From this plugin repository:
node plugin-dev-harness/verify-analytics.mjs --platform-root "$XPERT_PLATFORM_ROOT"
```

The verifier temporarily links only the eight changed plugins, the harness and workspace resolution roots to the built companion SDK/Contracts and its NestJS peers (one DI container), disables Nx cache restoration, builds generated assets, runs contracts and dist-first lifecycle loading, verifies generated outputs and inspects packed metadata. It restores dependency links afterwards. It performs no deployment, npm publication or account access.

Release gate: publish the platform Contracts/SDK patch containing this API first, align the eight host peer minimums and development pins with that actual public release and update the lockfile, then rerun clean frozen installation, builds, tests, lifecycle and package verification **without overlays** before releasing these plugins. Source integration success does not prove public npm reproducibility. Optional database-driver tests require their documented database fixture; lifecycle mocks do not establish live SSO, upstream API, Docker script execution or browser acceptance. Historical acceptance records describe their original releases only.

## Automatic definition generation

Live Dashboard now exposes `analytics_definition_connections`, `analytics_definition_inspect` and `analytics_definition_register`. Start by listing existing sources, reuse one if appropriate, otherwise inspect authorized input metadata and the returned authoring schema. The Agent generates business mappings; the system supplies workspace/Assistant/connection/file scope and dataset identity. Users do not fill internal configuration in Settings → Analytics; that page is for viewing, correcting and version management.

- Files: existing SandboxFile listing/reading supplies the path and evidence. Registration resolves the runtime path, validates its scope and size, parses the actual CSV/JSON/XLSX and checks columns, then rechecks access.
- REST: inspect approved operations and optionally sample one; register a semantic mapping and pagination definition. Registration previews actual results and rechecks the live operation contract.
- MCP: inspect approved read-only tools and optionally sample one; register result mapping and default arguments. Defaults are preserved in the returned Binding payload. Registration validates actual results and rechecks the tool contract.
- data-xpert: select an existing scoped Integration, inspect authorized ontology, then register `{}`. The host runtime supplies the current Assistant/workspace; the Assistant UUID is the code, consistent with `x-assistant-code`. Registration verifies ontology access using the current actor.
- Workspace Script retains `workspace_dataset_register` and its Artifact lifecycle.

Use a stable requestId for each intended definition, including retries. Changed content with the same requestId conflicts. The host persists privately, returns the exact immutable source and discoveryRequest, and never rewrites a published dashboard. Refresh `dashboard_list_sources`, discover and preview the generated source before saving. Definitions confer no upstream permissions. No additional protocol versions or migrations are introduced; all release requests remain patch.
