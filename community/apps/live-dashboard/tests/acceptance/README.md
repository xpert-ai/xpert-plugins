# File dashboard authoring regression

This is an opt-in **local application** regression, not release certification. Run against an isolated test Assistant and synthetic CSV/JSON/XLSX sources. It sends real chat prompts, creates drafts, temporarily changes source files and creates a temporary viewer/role for permission checks. It never publishes a dashboard. Do not run simultaneous mutations of the same source files.

The platform owns login, WorkspaceFiles, authorization and file tools. These scripts own the dashboard workflow and its business oracle. They reuse the platform's normal login helper; no browser tokens, direct database changes or dashboard HTML repairs are used.

## Prepare

1. Build and validate the matching platform SDK and plugin, deploy through `plugin:deploy:local`, restart if required, and update the Assistant's installed `live-dashboard` skill. Verify the running provider and installed skill bytes. Supply a real model and the SandboxFile middleware.
2. Copy `context.example.json` **outside the repository**. Configure existing source IDs, Assistant, organization and Keychain service names. `cleanupRoleName` names an existing non-admin role (default `VIEWER`): it is assigned only after deactivating the temporary user, so soft deletion does not retain a foreign key to the temporary role. Keep the UI in Chinese for the current accessible-name selectors. Install `playwright-core` in the selected platform and Chrome. The XLSX check uses `exceljs` from the `analytics-files` plugin workspace.
3. Create three dedicated sources with the same seven synthetic rows below. JSON uses `{ "sales": [...] }`; XLSX uses sheet `销售`, header row 1. The first `net_sales` value must be the string `600.00` (CSV/JSON) or the equivalent XLSX cell C2. Configure file.table columns `month` (string/time), `region` (string/dimension), `net_sales` (decimal/measure/CNY). Business description: paid-order net sales, aggregate by month and region, null region means all. Do not reuse business files.

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
node tests/acceptance/report.mjs /private/context.json
```

Each `profile.json` is an array, for example:

```json
[{"format":"csv","kpiSelector":"#actual-kpi","tableSelector":"#actual-tbody","chartSelector":"#actual-chart","filter":"#actual-region","refresh":"#actual-refresh"}]
```

Selectors are observations of the generated DOM, not authoring constraints. Optional `tableMonthLabels` maps the three displayed table-month labels to July/August/September. `aggregateLabelByRegion` verifies a single total series whose label changes with the selected region. Optional `aggregateSeriesNames` separates explicitly observed aggregate series from region series. For a chart that intentionally plots only the monthly total, set `seriesMode: "aggregate"`; monthly totals are still checked against the independent oracle. `monthLabels` may declare the actual formatted month labels in chronological order. Do not hide excluded-region series in this list. If the page intentionally renders the seven original orders, record `tableGrain: "orders"`; the exact order values are checked independently, while the chart still has to aggregate months correctly. Charts must redraw all actual data after filtering. Review screenshots as well as assertions.

`author` resumes observation if a send receipt already exists, preventing accidental duplicate prompts. Use a **new output directory** for a fresh generation attempt; do not delete failures to improve reported success. It waits for an idle conversation and a new matching draft receipt. A file write or a model claim alone never passes: receipts must match an actual mutation tool-call ID and name, then match the persisted document. Every round retains raw state, tool calls/errors, source-hash receipt, exact saved document and first-pass/recovered/failed classification. Extra saves are counted separately from tool errors.

`verify-ui` checks initial values, east/west/all filtering, host and page refresh, actual source mutation, card reopening and browser reload restoration. It also rejects unknown Binding/control, cross-frame DOM access and direct fetch. Before mutation it downloads original bytes and saves `original.<format>`; its `finally` restores and downloads again to compare bytes. On interruption or restoration failure, restore those originals **before** rerunning. Reports must not claim source restoration merely because an upload was attempted. The optional `read-only` mode is diagnostic only: its `toolbarRefresh` stage cannot satisfy the final report, which requires the exact source-mutation sequence and all four frame-boundary checks.

`evolution` checks same Artifact/draft, increasing revision, unchanged Bindings/controls/dependency locks, real HTML changes and exact saved-file hashes. Formal history remains empty. `boundary` attacks each saved Binding with payload/provider/path/reader/URL/control overrides and observes a browser `connect-src` violation against the healthy local API, so a DNS or CORS failure alone cannot establish network isolation. `permissions` uses a new non-admin viewer and **the same JWT** before/after disabling `DATA_SOURCE_VIEW`; it also removes only the temporary viewer from the Assistant workspace if organization bootstrap added inherited membership, then revokes its explicit Assistant grant to deny Workspace file reads. It restores access for verification, revokes the grant at cleanup, soft-deletes the inactive test user and removes the temporary permission and role. Other users and roles are preserved. Inspect cleanup results even after failures. This does not establish revocation at an external SSO provider.

## Record results

Keep private context, raw state, receipts and screenshots outside Git. In a dated public acceptance record, state source revisions, build/runtime checks, model flow count, per-round revisions and retry counts, business assertions, cleanup and limits. Separate model errors, harness failures, and repaired application failures; keep earlier failed evidence. A rerun after code changes is another attempt, not a replacement of history. Do not extrapolate one local model sample to all models or formal release readiness.

### Business repair after a failed UI check

Do not redefine the oracle or silently replace a failed generation. Record an observed defect in the affected private case's `repairPrompt`, run `author.mjs <context> <format> repair`, then inspect and verify `<format>-repair`. The repair is sent through Chat and must keep the same Artifact, Bindings and dependency locks. The initial failed UI report and tool errors remain in `<format>`. Edit1 starts from this accepted repair baseline; the report counts the additional model round and separately exposes the initial failure. No script edits the generated HTML. `report.mjs` only succeeds after all accepted stages pass, source hashes match and authorization cleanup succeeds.
