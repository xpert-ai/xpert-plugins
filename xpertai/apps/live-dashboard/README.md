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

Tools are `dashboard_list_sources`, `dashboard_discover`, `dashboard_preview`, `dashboard_preview_binding`, `dashboard_create`, `dashboard_open`, `dashboard_update` and `dashboard_create_html`. File authoring is supplied by the platform SandboxFile middleware. The canonical preview tool accepts complete `bindingJson` returned by an adapter registration tool. Both preview tools automatically discover the query contract with an empty request when it is absent in this run. Contracts are cached by exact source (including version) and provider; concurrent previews share discovery, and discovery failures propagate without executing the query and can be retried. Explicit discovery remains available for business metadata inspection. Source selection, payload validation and runtime authorization still apply. The middleware adds business-semantic guidance while preserving the host system message. Creation requires a successful preview of the exact binding/defaults via run-local `previewId` receipts; save revalidates current source access. Evidence is local to the run and actor, and repeated creation of the same manifest rechecks authorization before reusing its Artifact.

Specialized Assistants may configure `allowedFinalProviders` on the middleware, for example `["workspace_script.query"]`. Upstream discovery and preview still work with other providers, but Agent save rejects final bindings outside this list. Omit it for the existing unrestricted provider workflow. This is an Agent workflow policy, not a substitute for the server's source/Artifact authorization.

For a dedicated Dashboard Assistant, mark its connected `LiveDashboard` middleware node `required: true` (see the [graph fragment](examples/assistant-middleware.yaml)). ChatKit sends an explicit capability allowlist; an optional middleware is unavailable until the user selects it. Enabling the Workbench view alone does not enable Agent tools. Preserve that platform selection behavior for general-purpose Assistants.

Only the LLM boundary uses `requestJson` / `payloadJson` strings, because recursive JSON unions are unreliable in model function schemas. The plugin parses these into the unchanged canonical JSON protocol before calling the platform. Protocol version and operation come from the discovered provider contract; parameter name also supplies the Agent-created control ID. Saved manifests retain the full generic Binding protocol. Preview uses Binding parameter defaults, avoiding a second control mapping for the model to repeat. Provider syntax is learned from discovery, not embedded in platform prompts.

The model gets at most 20 preview rows/32 KB, with original completeness and explicit omitted-row counts. Failed preview/filter-test inputs execute at most twice per run; repeated identical failures are blocked before querying. Six consecutive preview failures stop tool use and request a truthful blocker summary; a model that still emits tool calls receives a terminal diagnostic instead. Schema failures count too. Successful previews reset the consecutive-failure count, and corrected inputs can be tried before the limit. The model also has 24 model tool rounds; after that it must report saved receipts or a blocker. Authored definitions, units, date range and aggregation grain still require business verification: structural validation alone does not prove metric correctness.

Categorical charts must encode every Dataset grain dimension in `x`/`color`. The renderer does not aggregate: totals need a separate previewed binding. Unsupported business metrics require clarification, not a proxy dashboard without agreement.

The Workbench subscribes to the existing `assistant.tool.completed` event for `dashboard_create` / `dashboard_create_html` and opens the exact Artifact from a valid saved receipt. Start/failure logs are ignored and repeated versions are deduplicated; concurrent conversations cannot redirect it to a different “newest” dashboard. Refresh also retrieves new definitions when none is selected.

The creation tool returns `{ dashboard: { artifactId, versionId, versionNumber, title } }`. This domain receipt keeps the platform's generic file auto-opener from presenting the JSON definition as a finished report. Artifacts remain the durable version store; the plugin View owns live presentation.

## Save, filter, refresh

`xpert.live-dashboard` contains id/title/bindings/controls/charts/tables and optional `presentation: { type: "html", html }`. Charts reference stable Dataset field IDs. Controls map to typed binding parameters. Filter and refresh execute the saved server-side definition for the current viewer.

Save validates and queries all bindings before writing immutable JSON. `expectedVersionId` (null for new) and platform Artifact row-lock compare-and-set prevent lost updates. Content hashes support retries. Saved files contain definitions, not result rows.

Preview/save also probe a declared non-default filter value and, when applicable, its null alternative. This catches predicates bypassed by an “all” default. Open-ended controls and all combinations of multiple filters still require scenario-specific acceptance.

Artifacts are owner-only within their agent/project host for this MVP. MIME: `application/json`; resource type: `live-dashboard`; namespace: `live_dashboard`. The Workbench supports selection, JSON import/edit, typed filters, refresh, version/freshness and partial-result notices.

## Built-in prompt workflows / 内置提示词模板

When the Assistant has the `LiveDashboard` middleware, type `/dashboard-` in its
chat composer and select a workflow. Selection inserts an invocation so the user
can add requirements before sending; it does not submit or publish automatically.
Commands are contributed by the installed middleware, so existing Assistants can
use them after the updated plugin is loaded. No Assistant-template import or
database seeding is needed. The host must support middleware slash commands.

| Mode / 分类 | Command | 用途 |
| --- | --- | --- |
| Standard | `/dashboard-standard-auto` | 根据真实数据质量和业务价值自动选题，新建独立标准看板 |
| Standard | `/dashboard-standard-new` | 围绕指定主题新建标准看板 |
| Standard | `/dashboard-standard-improve` | 调整指定看板的图表、指标、筛选，保留 Artifact 身份 |
| Standard | `/dashboard-standard-recover` | 定位失败步骤，用本轮证据恢复标准草稿保存 |
| HTML | `/dashboard-html-auto` | 自动选题，新建布局精致、可实际使用的 HTML 看板 |
| HTML | `/dashboard-html-new` | 围绕指定业务问题、受众和视觉要求新建 HTML 看板 |
| HTML | `/dashboard-html-style` | 参考图片或风格描述美化已有 HTML 看板，保留查询与交互 |
| HTML | `/dashboard-html-recover` | 保留页面候选，按真实校验错误修复并恢复保存 |
| Inspect | `/dashboard-explore` | 只读探索数据源、字段、日期覆盖和候选业务主题 |
| Inspect | `/dashboard-test-source` | 最小真实查询、字段映射和筛选验证 |
| Inspect | `/dashboard-audit-metrics` | 只读核对计算、单位、期间和关联粒度 |
| Inspect | `/dashboard-verify` | 核对保存版本、筛选、刷新，并标明未执行的页面验收 |

Examples (replace the descriptive inputs with your own requirements):

```text
/dashboard-standard-auto 使用当前组织的 BI 数据源，为采购主管挑选一个数据完整、能帮助识别交付问题的主题。新建独立看板。
/dashboard-standard-new 使用库存数据，面向仓库主管创建库存积压看板。核实库龄和库存金额口径，提供仓库与日期筛选。
/dashboard-html-auto 从已授权数据中选择一个能支持日常运营决策的主题。面向部门负责人，浅色企业风格，摘要指标、主趋势、关注清单和明细。
/dashboard-html-new 创建供应商交付分析看板。使用已授权采购数据，核实交付及时率口径；参考附图的留白、层次和配色，不复制示例数字。
/dashboard-html-style 美化当前选中的 HTML 看板，参考附图布局；保留现有指标、绑定、筛选和刷新，只调整视觉。
/dashboard-html-recover 继续保存刚才失败的 HTML 候选。读取实际文件与错误，重新获取本轮所需预览；如果运行时仍不可用，报告准确阻塞。
/dashboard-test-source 检查当前采购数据源的一个有实际数据的查询，验证一个供应商筛选及全部供应商。
/dashboard-verify 检查当前看板的默认日期、一个真实筛选值和全部值；区分查询验证与待人工页面验证。
```

Provide a source name, business question, audience and date range where relevant;
HTML requests can include a reference image or style. IDs, provider contracts and
paths are discovered from tools, never hard-coded into the templates. Automatic
selection ranks business usefulness and data readiness; specified-topic workflows
do not silently substitute another topic. New HTML workflows choose an unused
file path and never overwrite the selected dashboard.

The templates guide real queries, metric checks, run-local previews/filter tests
and successful draft-save receipts. They do not grant source access or install a
missing Browser Runtime. HTML saves still require runtime validation. Native
dashboards keep their own renderer and supported chart/table schema. Formal
publication remains a human action. Inspection commands do not register
definitions, edit business data or save dashboards; a tool-level pass is not a
claim of visual acceptance.

### Manual acceptance after loading the plugin

1. In an Assistant with LiveDashboard, open the `/` picker and search `dashboard`.
   Verify all twelve localized entries; selecting one should leave an editable
   invocation in the composer.
2. Run one standard-new and one HTML-new request against an authorized test source.
   Verify independent Artifact IDs, fresh previews and successful draft receipts;
   HTML also requires its normal Browser Runtime check.
3. Reopen each saved draft, change a real filter and refresh. Confirm real data
   updates. Run an inspection command and verify it does not save a new revision.

## HTML mode

See [HTML mode and acceptance](docs/html-mode.md). Agent tools write a complete single-file document to the authorized file workspace, then read and copy its bytes into the immutable dashboard JSON version alongside Bindings and Controls. Before creating an Artifact, a plugin-owned Sandbox Action runs the page with real preview datasets in the platform Browser Runtime, through the sandbox-browser queue. Unavailable runtime or failed initial rendering blocks HTML save and returns diagnostics to the Agent. No live workspace path is dereferenced on reopening. A changed file requires a new saved version. Existing JSON-only dashboards remain compatible.

The platform browser entry `@xpert-ai/plugin-sdk/artifact-document` owns the sandbox, CSP, MessageChannel, request validation and latest-response policy. The plugin owns lifecycle and supplies a narrow callback to `query-binding`. Its server loads the exact saved Artifact version, finds the declared Binding, validates controls and rechecks source access. The endpoint rejects full Binding, Provider, SQL/payload and alternate source fields.

Pages call `window.xpertLiveArtifact.ready()`, `subscribe(bindingId, render)`, `query(bindingId, controls)` and `refresh(bindingId)`. Register subscriptions before the first query so the toolbar can refresh without resetting the document. Use inline DOM/SVG/Canvas or online scripts/styles/fonts from the HTTPS origins returned by `dashboard_libraries.online`. Tailwind CDN, jsDelivr, cdnjs, unpkg and Google Fonts are supported according to their resource-type allowlist. Preflight and the displayed page use the same policy; failed loads prevent saving. Pin online versions where possible. Unlike packaged libraries, online bytes are not part of the immutable Artifact snapshot. Direct data requests, external images, eval, workers and frames remain unavailable. Script processing remains in the separate Workspace Script provider.

HTML is capped at 300 KB; the whole saved definition remains capped at 600 KB. HTML pages own their chart layout, so their charts/tables arrays are empty. The standard renderer remains an independent option. Sharing, data permissions and source limits are unchanged.

## Renderer reuse

Build reads the compressed renderer assets from the published `@xpert-ai/community-data-analytics@0.1.35` package, copies original renderer bytes into `dist/remote/renderer.html`, and records SHA-256 in `renderer-source.json`. Never edit minified assets. One adapter translates Dataset fields into Data Analytics v1 encodings and snapshots.

The renderer runs in a script-only sandbox with no-network CSP. A small in-memory fetch adapter provides manifest/snapshot/package endpoints because srcDoc has no HTTP origin. Exact table rows are preserved; chart copies convert supported numeric strings and reject precision loss. Render payloads are capped at 3 MB.

## Build and validation

Use the xpertai workspace's declared Corepack/pnpm. Development dependencies pin published SDK/contracts 3.27.0 and the Data Analytics renderer 0.1.35; no local platform or community links are required. SDK 3.27.0 includes the host-owned online resource policy, so no SDK patch is required. Rebuild both the viewer and HTML preflight assets after changing the SDK; `verify:dist` checks their source fingerprints.

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx build @xpert-ai/plugin-live-dashboard
corepack pnpm exec nx test @xpert-ai/plugin-live-dashboard
node apps/live-dashboard/tests/workbench-host.cjs
```

The representative host runs at http://127.0.0.1:4317. Import its `/manifest`; `/state` exposes non-secret acceptance counters. It uses the production bundle/service with in-memory capability fixtures. It proves UI protocol flow, not installed platform authentication or SSO.

Run the repository plugin harness before authenticated `plugin:deploy:local`. System plugins require API restart. For data-xpert, copy platform changes to xpert-pro and test through its SSO with published resources and viewer policies.

## MVP boundaries

Eight bindings, 24 controls, 20 charts/tables each, 100 listed dashboards per host. Queries execute sequentially with individual deadlines. No scheduler, cross-source joins, public sharing, shared result cache, visual query builder, chart-detail MCP resource or custom Artifact-gallery viewer. The Workbench provides authoring and preview. Authenticated team links open a standalone read-only page backed by the same renderers; drafts and management remain creator-only.

## Documentation

See [integration and architecture](docs/index.mdx), [build and verification](docs/verification.mdx), and the dated historical acceptance records linked there. The package includes the examples. Source-side `scripts/build-action.mjs --verify-package <extracted-package>` verifies the actual packed HTML validation Action.

Draft autosave and human publication: [workflow and architecture](docs/drafts.mdx), [SSO acceptance (2026-10-17)](docs/drafts-acceptance.mdx).

Agent 工作流程见随插件发布的 [live-dashboard 技能](skills/live-dashboard/SKILL.md) 和 [文件编辑说明](docs/file-authoring.mdx)。HTML 编辑需要平台 SandboxFile 与 skillsMiddleware。

## Team sharing

The Share action publishes a link to an already published dashboard: follow the latest formal version or pin one version. It never publishes a draft. Team members sign in and query as themselves; sharing the definition does not grant data-source, ontology or Workspace access. The creator can revoke the link. Workspace-script dashboards with private script/file dependencies are currently blocked with a diagnostic.

See [team sharing and standalone pages](docs/team-sharing.mdx) and [local acceptance](docs/team-sharing-acceptance.mdx). This feature needs a host exposing the Artifact Presentation registry, API and page; it cannot be installed on an older SDK alone.

Chat messages use the platform resource-card protocol after a successful create, update or open. The card opens the exact dashboard in Workbench; no dashboard renderer or queries are embedded in messages. See [chat resource cards](docs/chat-resource-cards.mdx).
