# File dashboard authoring regression

This is an opt-in **local application** regression, not release certification. Run against an isolated test Assistant and synthetic CSV/JSON/XLSX sources. It sends real chat prompts, creates drafts, temporarily changes source files and creates a temporary viewer/role for permission checks. It never publishes a dashboard. Do not run simultaneous mutations of the same source files, or mutate fixtures while another model is generating/editing against them. Finish an authoring phase before UI mutation checks, restore every source, then start the next authoring phase.

The platform owns login, WorkspaceFiles, authorization and file tools. These scripts own the dashboard workflow and its business oracle. They reuse the platform's normal login helper; no browser tokens, direct database changes or dashboard HTML repairs are used.

## Prepare

1. Build and validate the matching platform SDK and plugin, deploy through `plugin:deploy:local`, restart if required, and update the Assistant's installed `live-dashboard` skill. Verify the running provider and installed skill bytes. Supply a real model and the SandboxFile middleware.
2. Copy `context.example.json` **outside the repository**. Configure existing source IDs, Assistant, organization and Keychain service names. `cleanupRoleName` names an existing non-admin role (default `VIEWER`): it is assigned only after deactivating the temporary user, so soft deletion does not retain a foreign key to the temporary role. Keep the UI in Chinese for the current accessible-name selectors. Install `playwright-core` in the selected platform and Chrome. The XLSX check uses `exceljs` from the `analytics-files` plugin workspace.
3. Create three dedicated sources with the same seven synthetic rows below. JSON uses `{ "sales": [...] }`; XLSX uses sheet `销售`, header row 1. The first `net_sales` value must be the string `600.00` (CSV/JSON) or the equivalent XLSX cell C2. Configure file.table columns `month` (string/time), `region` (string/dimension), `net_sales` (decimal/measure/CNY). Business description: paid-order net sales, aggregate by month and region, null region means all. Do not reuse business files.

For a fixed-build multi-model baseline, set a distinct `runLabel` and output directory for each model. Use the same source rows, prompt structure, styles and verification rules. Set `buildManifest` to a new external JSON path shared by these contexts. After deploying and checking the running provider and installed skills, record it once with `node tests/acceptance/build.mjs <context> record`. It freezes the platform revision and tracked/untracked runtime changes, built SDK/contracts, and plugin runtime/skill bytes; it does not prove process provenance or successful deployment. `author` checks it before/after each round, and `report` checks it again. Do not overwrite the manifest after a repair: retain the failed baseline and record a new build.

Select an existing authorized model through the normal Assistant model picker/preference and record the expected `model: { id, name, copilotId, options }` in private context. Restore the prior selection and any test-only Assistant configuration afterward. `models.mjs` verifies every round against the persisted root execution metadata, not the picker label or an Agent's claim. It rejects a different model, connection, tuning or unexpected extra execution. This verifies the selected primary model, not provider-internal retries or routing behind a provider endpoint. Do not change a model while another prompt is being submitted.

With `model` configured, `author` explicitly selects that model in the Chat composer before each send. An API preference alone is insufficient: the composer may send its own selection. Catalog presence also does not prove provider availability; retain provider failures (such as model-not-found) separately and use a fresh directory for an available alternative.

```csv
month,region,net_sales
2026-07,华东,600.00
2026-07,华东,400.00
2026-07,华西,800.00
2026-08,华东,1500.00
2026-08,华西,900.00
2026-09,华东,1000.00
2026-09,华西,500.00
```

`initial-fixtures.json` in the output directory records the independently verified starting file hashes as `{ "checks": [{ "format": "csv", "sha256": "..." }, ...] }`. The final report downloads the source files again and verifies these hashes; run `fixtures.mjs` to check the documented seven rows and create this baseline before any mutation. An existing baseline cannot be silently replaced.

The independent oracle is total 5700, east 3500, west 2200, six aggregated rows. Mutations add 100/200/300 to the first CSV/JSON/XLSX order respectively. Neither API results nor generated HTML establish expected values.

## Execute

From this plugin directory, with Node 20+:

```sh
node tests/acceptance/fixtures.mjs /private/context.json
node tests/acceptance/author.mjs /private/context.json csv create
node tests/acceptance/inspect.mjs /private/context.json csv
# Inspect inspection.json and initial.png; record actual selectors in csv/profile.json.
node tests/acceptance/verify-ui.mjs /private/context.json csv
node tests/acceptance/author.mjs /private/context.json csv edit1
node tests/acceptance/inspect.mjs /private/context.json csv-edit1
# Record selectors for the new layout, without modifying Agent-generated HTML.
node tests/acceptance/verify-ui.mjs /private/context.json csv-edit1
node tests/acceptance/author.mjs /private/context.json csv edit2
node tests/acceptance/inspect.mjs /private/context.json csv-edit2
node tests/acceptance/verify-ui.mjs /private/context.json csv-edit2
# Repeat the same sequence for json and xlsx.
node tests/acceptance/evolution.mjs /private/context.json
node tests/acceptance/boundary.mjs /private/context.json
node tests/acceptance/permissions.mjs /private/context.json
# Required when the context specifies model; verifies actual execution metadata.
node tests/acceptance/models.mjs /private/context.json
node tests/acceptance/report.mjs /private/context.json
```

Each `profile.json` is an array, for example:

```json
[{"format":"csv","kpiSelector":"#actual-kpi","tableSelector":"#actual-tbody","chartSelector":"#actual-chart","filter":"#actual-region","refresh":"#actual-refresh"}]
```

Selectors are observations of the generated DOM, not authoring constraints. Optional `tableMonthLabels` maps the three displayed table-month labels to July/August/September. `aggregateLabelByRegion` verifies a single total series whose label changes with the selected region. Optional `aggregateSeriesNames` separates explicitly observed aggregate series from region series. For a chart that intentionally plots only the monthly total, set `seriesMode: "aggregate"`; monthly totals are still checked against the independent oracle. `monthLabels` may declare the actual formatted month labels in chronological order. Do not hide excluded-region series in this list. If the page intentionally renders the seven original orders, record `tableGrain: "orders"`; the exact order values are checked independently, while the chart still has to aggregate months correctly. Charts must redraw all actual data after filtering. Review screenshots as well as assertions.

If the actual table includes a summary row in its body, specify `summaryRowSelector`: it is checked separately against the total, not counted twice or silently ignored. `controlId` names the observed region control (default `region`). Query evidence must start after the UI action and carry the selected typed value for each affected Binding; late responses from the initial render cannot establish filter success.

Visual review remains separate from numerical assertions. Each final `<format>-edit2/visual-review.json` must have `passed: true` after reviewing its screenshot; record the evidence filename and scope. Retain a failed screenshot review as `<round>/visual-review.json` with `passed: false`, `issue` and `followUpRound`; the report requires that follow-up to have `passed: true` in its own visual review, a later revision of the same Artifact and complete UI acceptance. An evidence-based `edit2Extra` may request a visual repair together with the second edit; disclose that additional instruction when comparing models. Optional profile fields `staleLoadingSelector` and `chartFitsContainer: true` check a known stale placeholder and the rendered SVG/canvas bounds on every interaction stage. Never label a numerically correct but visibly broken page as business first-pass.

`author` resumes observation if a send receipt already exists, preventing accidental duplicate prompts. Use a **new output directory** for a fresh generation attempt; do not delete failures to improve reported success. It waits for an idle conversation and a new matching draft receipt. A file write or a model claim alone never passes: receipts must match an actual mutation tool-call ID and name, then match the persisted document. Initial generation must have a successful creation receipt for that Artifact; updating a historical dashboard is not a successful new generation. Every round retains raw state, tool calls/errors, source-hash receipt, exact saved document and first-pass/recovered/failed classification. Extra saves are counted separately from tool errors. Tool-level `first_pass` is not business first-pass: the UI oracle may still reject the page.

`verify-ui` checks initial values, east/west/all filtering, host and page refresh, actual source mutation, card reopening and browser reload restoration. It also rejects unknown Binding/control, cross-frame DOM access and direct fetch. Before mutation it downloads original bytes and saves `original.<format>`; its `finally` restores and downloads again to compare bytes. On interruption or restoration failure, restore those originals **before** rerunning. Reports must not claim source restoration merely because an upload was attempted. The optional `read-only` mode is diagnostic only: its `toolbarRefresh` stage cannot satisfy the final report, which requires the exact source-mutation sequence and all four frame-boundary checks.

`evolution` checks same Artifact/draft, increasing revision, unchanged Bindings/controls/dependency locks, real HTML changes and exact saved-file hashes. Formal history remains empty. `boundary` attacks each saved Binding with payload/provider/path/reader/URL/control overrides and observes a browser `connect-src` violation against the healthy local API, so a DNS or CORS failure alone cannot establish network isolation. `permissions` uses a new non-admin viewer and **the same JWT** before/after disabling `DATA_SOURCE_VIEW`; it also removes only the temporary viewer from the Assistant workspace if organization bootstrap added inherited membership, then revokes its explicit Assistant grant to deny Workspace file reads. It restores access for verification, revokes the grant at cleanup, soft-deletes the inactive test user and removes the temporary permission and role. Other users and roles are preserved. Inspect cleanup results even after failures. This does not establish revocation at an external SSO provider.

Title content and revision suffixes must match the requested text; cosmetic display whitespace is normalized for this check, and every such difference is exposed in `evolution.json`. This does not relax numeric, Binding, file hash or revision checks. The report distinguishes `dataAcceptedRounds` from rounds without a recorded visual failure, and `toolFirstPass` from initial business first-pass.

Visual findings are also checked on an explicit `repair` round. The follow-up must be a later recorded round of the same Artifact. Data and visual failures on one round count as one failed attempt; failures on an excluded initial generation do not subtract from the accepted repair and edit rounds.

## Record results

Keep private context, raw state, receipts and screenshots outside Git. In a dated public acceptance record, state source revisions, build/runtime checks, model flow count, per-round revisions and retry counts, business assertions, cleanup and limits. Separate model errors, harness failures, and repaired application failures; keep earlier failed evidence. A rerun after code changes is another attempt, not a replacement of history. Do not extrapolate one local model sample to all models or formal release readiness.

### Business repair after a failed UI check

Do not redefine the oracle or silently replace a failed generation. Record an observed defect in the affected private case's `repairPrompt`, run `author.mjs <context> <format> repair`, then inspect and verify `<format>-repair`. The repair is sent through Chat and must keep the same Artifact, Bindings and dependency locks. The initial failed UI report and tool errors remain in `<format>`. Edit1 starts from this accepted repair baseline; the report counts the additional model round and separately exposes the initial failure. No script edits the generated HTML. `report.mjs` only succeeds after all accepted stages pass, source hashes match and authorization cleanup succeeds.
