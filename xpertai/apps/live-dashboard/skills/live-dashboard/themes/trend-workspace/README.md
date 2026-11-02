# Trend Workspace v1 — Agent authoring contract

Use this theme when the user asks for the enterprise BI style, the left KPI rail,
the trend-first design, or the polished two-line dropdown filters. It is a reusable
design system, not a fixed Superstore screenshot. Author the business HTML in the
current Project and save it through dashboard tools yourself.

## Read and reuse

Read these files with `read_skill_file`, resolving paths relative to the installed
live-dashboard skill. Read complete files; do not use a truncated preview as source.

1. `theme.css`: tokens, layout, typography, responsive/dark states, filter appearance.
2. `icons.js`: two exact Lucide library icons; keep `ICON_LICENSE.txt` attribution.
3. `select.js`: keyboard-accessible dropdown enhancement of a typed native select.
4. `charts.js`: ECharts line, ranked bar and scatter recipes with explicit fields.
5. `layout.html`: structural fragment explaining placement, not a standalone page.
6. The main skill's `references/html-runtime.md` and lifecycle example.

Call `dashboard_libraries` and save with `libraries:["echarts","trend-workspace"]`.
The host injects the theme CSS, icons, select and chart code from its versioned,
SHA-256-pinned document library. Do not retype those shared modules in every HTML.
They remain in the skill for inspection and adaptation. No CDN or relative URLs.

Use `window.TrendWorkspace.enhanceSelect(select)` and
`window.TrendWorkspace.charts.line/horizontal/scatter(...)`. The library does not
query data or insert business content. You write the layout, configuration and
SDK query/subscription runtime, then save the draft. Existing saved library bytes
remain frozen when a later plugin version is installed; opt in to library upgrades.
Keep source lines below 500 UTF-8 bytes; do not minify.

Full worked examples are `examples/superstore/overview.html`, `profitability.html`
and `customers.html`. Their `build_pages.py` is a developer packaging helper; the
Agent does not need Python, the repository or this developer's computer. The
installed skill contains every CSS/JS asset and complete HTML example.

## Visual invariants

- White analysis surface, pale blue KPI rail, navy text. Sales blue, profit teal,
  negative values red. Never encode a business threshold by an invented color rule.
- Desktop rail is about 22% of the content width. Put title, source/demo label and
  five or fewer important KPIs in it; large first KPI, quieter supporting totals.
- Top-right filter strip; the analysis area contains one main chart region and
  compact supporting ranking/table regions. Avoid equal-size card grids.
- Sales and profit time series use aligned time axes with **separate, clearly
  labelled value scales**. Do not smooth away negative months or seasonal spikes.
- Ranked bars are descending with direct values; bars use zero as baseline.
  Profit rankings preserve negative values. Scatter plots retain a zero-profit
  reference and name negative items; keep numeric detail in the accompanying table.
- Use `system-ui, "PingFang SC", sans-serif`, tabular numbers, headings 24–26px,
  KPI values 28–40px, controls/body 14px, supporting labels at least 12px.
- No browser chrome, decorative charts, fabricated growth badges or chart images.
  Real ECharts remains interactive; the design reference is not a data source.
- At 680px the rail becomes a top summary; charts stack and filters retain three
  accessible compact fields. Only the named table region may scroll horizontally.
- Dark mode comes from `await live.ready()` and `.dark`; do not read localStorage.

## Select component contract

Use one `.filter-field` per verified control:

```html
<div class="filter-field">
  <label for="filter-region">区域</label>
  <select id="filter-region" data-dashboard-control="region" disabled></select>
</div>
```

After receiving `live.ready()`, populate it from verified allowed values. Preserve
JSON types in option values, e.g. `new Option(label, JSON.stringify(value))` and
`JSON.parse(select.value)` in the change handler. Call
`window.TrendWorkspace.enhanceSelect(select)` only after populating options and current value.
The component renders the two-line caption/value trigger, focus ring and menu.

Keep the native select and its ID as the typed data-control contract. It becomes
hidden after enhancement; do not render another independent data control with the
same ID. Selecting a menu row dispatches the select's normal `change` event.
Every change must query **all** affected Bindings; visual selection is not proof
of a data query. Set native `select.disabled` while querying; the custom trigger
tracks it. The menu supports arrows, Home/End, Enter/Space, Escape, Tab, typeahead,
click outside and an explicit selected check. Do not replace it with a CSS-only
fake menu. Four options do not need search or an Apply button.

The project/dashboard selector and Publish/More toolbar belong to the host View.
Do not duplicate those controls inside the authored HTML.

## Adapt to a new dataset

1. Discover the real source and field schema. Define the business question, grain,
   units, source period, denominator and allowed filters before choosing charts.
2. Select layout by task: time trend uses overview's main region + lower band;
   product contribution uses two related plots; customer structure uses compact
   comparisons and a table. Keep the same rail, controls and tokens.
3. Map actual fields explicitly into `window.TrendWorkspace.charts.line`, `.horizontal`
   or `.scatter`; arguments name `dimension`, `measure` or `x`/`y` and labels.
   Do not infer semantics from a field name or reuse Superstore field names blindly.
4. Build KPI calculations from independent backend totals. Ratios use the same
   filtered numerator/denominator. Distinct counts must not be summed across groups.
5. Subscribe to every saved Binding; render only when the complete current result
   set has arrived. Clear previous results on filter changes, denied/failed queries,
   truncation and empty scopes. Source timestamps must come from query freshness.
6. Preserve decimal strings for financial display; only validated finite numbers
   enter charts/ratios. Use DOM textContent for labels, not untrusted innerHTML.
7. Write the complete HTML with SandboxFile, preview/test each query and filter,
   then save a real draft. Do not deliver a static screenshot instead.

## Upgrade an existing dashboard to this theme

Use `dashboard_list` in the current project and exact Artifact IDs. Open each
explicit target with `dashboard_open`, read its current editing copy, and retain
the returned `saveArguments`. Preserve Binding IDs, sources, controls, units,
title/Artifact identity and all existing HTML IDs. Add `chart-profit` only when
splitting an existing sales/profit trend; retain `chart-primary` and `chart-secondary`.

For the unmodified Superstore recipe, the current full HTML already composes this
theme and the same binding contract. You may reuse that page after verifying the
opened dashboard has the expected bindings and no user customizations. Replace
the **opened editing file** with exact SandboxFile edits, then use
`dashboard_update` with its saved envelope, htmlPath and
`libraries:["echarts","trend-workspace"]`. Never create a duplicate
Artifact to avoid editing. For customized or other-data dashboards, transplant
the theme assets and structural sections while retaining their business runtime.

For existing files, split edits into logical CSS, layout and script sections;
keep each old/new text under about 4,000 UTF-8 bytes. Never send a whole old + new
page in one tool call. Use `sandbox_multi_edit_file` with a few bounded edits, or
insert complete sections before a unique temporary marker. Remove temporary
markers before saving. Never use sandbox_write_file on an existing editing copy.
For a new long file, create the first section and append the remaining sections
with sandbox_append_file. Complete and inspect the document before any save. A failed or partial file edit
is not a saved dashboard. Keep three-page upgrades sequential, one page per save.

## Acceptance before reporting success

- Verify actual successful draft receipts, title and intended Artifact IDs.
- Open the saved page: rail, separate trend scales, direct-value ranking and
  two-line select triggers must be present; do not rely on a theme-name attribute.
- Change a real filter; all KPIs, plots and detail rows must reflect the new scope.
- Check open-menu selected state, keyboard selection/Escape, viewport edges,
  loading, empty/error/recovery, 390px layout and dark-mode contrast.
- Confirm refresh does not reset the controls and the page uses current results.
- Preserve user customizations and leave formal publication to the human.
- If no rendered inspection capability is available, report that visual QA is
  pending. Never claim a screenshot comparison from source code alone.
