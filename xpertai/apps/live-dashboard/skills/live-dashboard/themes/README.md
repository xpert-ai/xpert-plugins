# Dashboard visual styles — choose by the analysis task

These are three distinct authoring systems, not one mandatory appearance for every
dashboard. User direction wins. Preserve a saved dashboard's theme when changing
data or copy; only change it when the user asks for a redesign.

| Theme | Use for | Composition | Library / global |
| --- | --- | --- | --- |
| [Trend Workspace](trend-workspace/README.md) | Operating overview, time trends | Pale-blue KPI rail, aligned independent trend scales, lower comparisons | `trend-workspace` / `window.TrendWorkspace` |
| [Profit Atlas](profit-atlas/README.md) | Profitability, contribution, losses | Dark analysis desk, horizontal metrics, dominant scatter and signed ranking | `profit-atlas` / `window.ProfitAtlas` |
| [Customer Brief](customer-brief/README.md) | Customer structure, returns, management briefing | Warm paper, serif hierarchy, metric ribbon, grouped return metrics | `customer-brief` / `window.CustomerBrief` |

For the three-page Superstore suite, use each row for its corresponding page.
For a different dataset, first establish the business question and fields; select
the matching composition, then adapt it. Do not force every dataset into a scatter
plot, invent missing return metrics, or infer theme selection from a title at runtime.
Record the explicit choice in `data-dashboard-theme="<id>@1"` and save with
`libraries:["echarts","<id>"]`. Choose exactly one visual theme; do not stack theme
libraries. Call `dashboard_libraries` to verify availability before authoring.

All three expose `enhanceSelect(nativeSelect)` and `charts.line/horizontal/scatter`.
The host injects pinned CSS/JS; you author the business layout and governed query
runtime. Complete examples and query plans are in `examples/superstore/`. No local
repository, Python generator or this developer's computer is required by the Agent.

## Shared behavior and editing rules

- Read the selected theme guide and its layout fragment, plus the complete relevant
  example. The existing [typed select contract](trend-workspace/README.md#select-component-contract)
  and [data adaptation contract](trend-workspace/README.md#adapt-to-a-new-dataset)
  apply to every theme. The shared source is `trend-workspace/select.js`, `icons.js`
  and `charts.js`; each theme bundle already contains them and their icon license.
- Keep business values out of the HTML. Discover and validate the actual source,
  use independent backend totals, query every affected Binding on a filter change,
  and clear stale values on loading, empty, truncated or failed queries.
- For existing Artifacts, use `dashboard_open`, read its current editing copy and
  retain `saveArguments`, Binding IDs, source, controls, title and all existing DOM
  IDs. Moving a chart does not require changing its ID. Do not create duplicates.
- Use bounded exact SandboxFile edits to the returned `htmlPath`; never overwrite
  an existing editing copy with `sandbox_write_file`. Keep old/new replacements
  around 4,000 UTF-8 bytes or less. New long documents can be written then appended.
- Save through `dashboard_update` with the explicit new theme library only when
  redesign was requested. Successful draft receipts are required; publishing is a
  separate human decision. Existing saved library bytes remain frozen.
- Verify a real filter and refresh across KPIs, charts and detail rows. Check keyboard
  selection, Escape, focus, menu bounds, 390px layout and theme contrast. Rendered
  visual checks are required; report them as pending if no browser is available.

The host project/dashboard cascade and Publish/More toolbar stay outside authored
HTML. These styles do not add capabilities, data access, project sharing or jobs.
