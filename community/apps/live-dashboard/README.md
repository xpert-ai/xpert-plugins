# Live Dashboard

System plugin `@xpert-ai/plugin-live-dashboard`: versioned live dashboards using platform analytics, Workspace Files and Artifacts. Supports the existing Data Analytics renderer and Agent-authored HTML/CSS/JavaScript pages.

See [implementation and installed-runtime acceptance](docs/acceptance.md) and [one-sentence Agent acceptance](docs/agent-acceptance.md). `examples/` contains equivalent PostgreSQL and data-xpert bindings for the same chart.

## Ownership and flow

```text
Assistant tool / Workbench controls
 → DashboardService → platform.datasource.analytics
   → source plugin → native read-only query → canonical Dataset
 → Data Analytics adapter → existing renderer

Dashboard definition → Workspace Files → immutable Artifact version
```

The platform owns Dataset/Binding validation, source authorization and dispatch. This plugin owns dashboard schemas/UI and renderer translation; source plugins are independently replaceable. Its browser has no credentials, PostgreSQL driver or ontology client.

Supported source adapters include PostgreSQL (`postgres.sql`), MySQL (`mysql.sql`), Apache Doris (`doris.sql`),
data-xpert ontology (`data-xpert.ontology`) and Workspace scripts (`workspace_script.query`). MySQL/Doris
use the [analytics-mysql plugin](../../tools/analytics-mysql/README.md) with the existing MySQL database driver;
their query syntax and wire types stay outside the dashboard plugin. Install source providers separately.

`LiveDashboard` middleware exposes source discovery and dashboard creation tools, and activates `live_dashboard`. The view appears in the enabled Assistant Workbench/project detail host using existing View Host messages, not an alternate unscoped API.

## One-sentence Agent workflow

For existing dashboards, use `dashboard_list`, `dashboard_open`, `dashboard_read_html`, `dashboard_history` and `dashboard_update`.
The Workbench supplies its selected Artifact/version through the platform context command. Open returns the stable Artifact ID and current draft revision;
update preserves identity and omitted fields, requires fresh preview receipts for replacement bindings, and uses the existing validation/CAS path.
Successful update receipts open the saved working draft; only human publication creates a formal version. See [continuous editing](docs/editing.mdx).

Tools are `dashboard_list_sources`, `dashboard_discover`, `dashboard_preview`, `dashboard_preview_binding`, `dashboard_create`, `dashboard_open`, `dashboard_update` and `dashboard_create_html`. File authoring is supplied by the platform SandboxFile middleware. The canonical preview tool accepts complete `bindingJson` returned by an adapter registration tool. Both preview tools use the same discovery and receipt checks. The middleware adds business-semantic guidance while preserving the host system message. It requires discovery and a successful preview of the exact binding/defaults before creation via run-local `previewId` receipts; save revalidates current source access. Evidence is local to the run and actor, and repeated creation of the same manifest rechecks authorization before reusing its Artifact.

Specialized Assistants may configure `allowedFinalProviders` on the middleware, for example `["workspace_script.query"]`. Upstream discovery and preview still work with other providers, but Agent save rejects final bindings outside this list. Omit it for the existing unrestricted provider workflow. This is an Agent workflow policy, not a substitute for the server's source/Artifact authorization.

For a dedicated Dashboard Assistant, mark its connected `LiveDashboard` middleware node `required: true` (see the [graph fragment](examples/assistant-middleware.yaml)). ChatKit sends an explicit capability allowlist; an optional middleware is unavailable until the user selects it. Enabling the Workbench view alone does not enable Agent tools. Preserve that platform selection behavior for general-purpose Assistants.

Only the LLM boundary uses `requestJson` / `payloadJson` strings, because recursive JSON unions are unreliable in model function schemas. The plugin parses these into the unchanged canonical JSON protocol before calling the platform. Protocol version and operation come from the discovered provider contract; parameter name also supplies the Agent-created control ID. Saved manifests retain the full generic Binding protocol. Preview uses Binding parameter defaults, avoiding a second control mapping for the model to repeat. Provider syntax is learned from discovery, not embedded in platform prompts.

The model gets at most 20 preview rows/32 KB, with original completeness and explicit omitted-row counts. It has 24 model tool rounds; after that it must report saved receipts or a blocker. Authored definitions, units, date range and aggregation grain still require business verification: structural validation alone does not prove metric correctness.

Categorical charts must encode every Dataset grain dimension in `x`/`color`. The renderer does not aggregate: totals need a separate previewed binding. Unsupported business metrics require clarification, not a proxy dashboard without agreement.

The Workbench subscribes to the existing `assistant.tool.completed` event for `dashboard_create` / `dashboard_create_html` and opens the exact Artifact from a valid saved receipt. Start/failure logs are ignored and repeated versions are deduplicated; concurrent conversations cannot redirect it to a different “newest” dashboard. Refresh also retrieves new definitions when none is selected.

The creation tool returns `{ dashboard: { artifactId, versionId, versionNumber, title } }`. This domain receipt keeps the platform's generic file auto-opener from presenting the JSON definition as a finished report. Artifacts remain the durable version store; the plugin View owns live presentation.

## Save, filter, refresh

`xpert.live-dashboard/v1` contains id/title/bindings/controls/charts/tables and optional `presentation: { type: "html", html }`. Charts reference stable Dataset field IDs. Controls map to typed binding parameters. Filter and refresh execute the saved server-side definition for the current viewer.

Save validates and queries all bindings before writing immutable JSON. `expectedVersionId` (null for new) and platform Artifact row-lock compare-and-set prevent lost updates. Content hashes support retries. Saved files contain definitions, not result rows.

Preview/save also probe a declared non-default filter value and, when applicable, its null alternative. This catches predicates bypassed by an “all” default. Open-ended controls and all combinations of multiple filters still require scenario-specific acceptance.

Artifacts are owner-only within their agent/project host for this MVP. MIME: `application/json`; resource type: `live-dashboard`; namespace: `live_dashboard`. The Workbench supports selection, JSON import/edit, typed filters, refresh, version/freshness and partial-result notices.

## HTML mode

See [HTML mode and acceptance](docs/html-mode.md). Agent tools write a complete single-file document to the authorized file workspace, then read and copy its bytes into the immutable dashboard JSON version alongside Bindings and Controls. Before creating an Artifact, a plugin-owned Sandbox Action runs the page with real preview datasets in the platform Browser Runtime, through the sandbox-browser queue. Unavailable runtime or failed initial rendering blocks HTML save and returns diagnostics to the Agent. No live workspace path is dereferenced on reopening. A changed file requires a new saved version. Existing JSON-only dashboards remain compatible.

The platform browser entry `@xpert-ai/plugin-sdk/artifact-document` owns the sandbox, CSP, MessageChannel, request validation and latest-response policy. The plugin owns lifecycle and supplies a narrow callback to `query-binding`. Its server loads the exact saved Artifact version, finds the declared Binding, validates controls and rechecks source access. The endpoint rejects full Binding, Provider, SQL/payload and alternate source fields.

Pages call `window.xpertLiveArtifact.ready()`, `subscribe(bindingId, render)`, `query(bindingId, controls)` and `refresh(bindingId)`. Register subscriptions before the first query so the toolbar can refresh without resetting the document. Use inline DOM/SVG/Canvas; network/CDN imports and eval are unavailable. Script processing remains in the separate Workspace Script provider.

HTML is capped at 300 KB; the whole saved definition remains capped at 600 KB. HTML pages own their chart layout, so their charts/tables arrays are empty. The standard renderer remains an independent option. Sharing, data permissions and source limits are unchanged.

## Renderer reuse

Build consumes `@xpert-ai/community-data-analytics/renderer`, copies original renderer bytes into `dist/remote/renderer.html`, and records SHA-256 in `renderer-source.json`. Never edit minified assets. One adapter translates Dataset fields into Data Analytics v1 encodings and snapshots.

The renderer runs in a script-only sandbox with no-network CSP. A small in-memory fetch adapter provides manifest/snapshot/package endpoints because srcDoc has no HTTP origin. Exact table rows are preserved; chart copies convert supported numeric strings and reject precision loss. Render payloads are capped at 3 MB.

## Build and validation

Use the community workspace's declared Corepack/pnpm. Build and locally link the current platform contracts/SDK first: an older SDK satisfying the semver range may lack this new capability and the browser entry.

```sh
pnpm --dir apps/live-dashboard build
node --test apps/live-dashboard/tests/*.test.cjs
node apps/live-dashboard/tests/workbench-host.cjs
```

The representative host runs at http://127.0.0.1:4317. Import its `/manifest`; `/state` exposes non-secret acceptance counters. It uses the production bundle/service with in-memory capability fixtures. It proves UI protocol flow, not installed platform authentication or SSO.

Run the repository plugin harness before authenticated `plugin:deploy:local`. System plugins require API restart. For data-xpert, copy platform changes to xpert-pro and test through its SSO with published resources and viewer policies.

## MVP boundaries

Eight bindings, 24 controls, 20 charts/tables each, 100 listed dashboards per host. Queries execute sequentially with individual deadlines. No scheduler, cross-source joins, public sharing, shared result cache, visual query builder, chart-detail MCP resource or custom Artifact-gallery viewer. Artifacts remain downloadable definitions; the Workbench provides live rendering.

## Documentation

See [integration and architecture](docs/index.mdx), [build and verification](docs/verification.mdx), and the dated historical acceptance records linked there. The package includes the examples. Source-side `scripts/build-action.mjs --verify-package <extracted-package>` verifies the actual packed HTML validation Action.

Draft autosave and human publication: [workflow and architecture](docs/drafts.mdx), [SSO acceptance (2026-10-17)](docs/drafts-acceptance.mdx).

Agent 工作流程见随插件发布的 [live-dashboard 技能](skills/live-dashboard/SKILL.md) 和 [文件编辑说明](docs/file-authoring.mdx)。HTML 编辑需要平台 SandboxFile 与 skillsMiddleware。
