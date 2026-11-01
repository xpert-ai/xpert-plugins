# Profit Atlas v1 — profitability analysis desk

Use this style for the approved dark profitability screen or an explicitly chosen
contribution/loss analysis. Read [theme selection and shared rules](../README.md)
first. This is one optional style; it does not replace Trend Workspace.

## Installed assets and runtime

Read `theme.css`, `charts.js`, `layout.html` and the complete
`examples/superstore/profitability.html`. Call `dashboard_libraries`, then use
`libraries:["echarts","profit-atlas"]`; the global is `window.ProfitAtlas`.
The bundle includes the shared typed select, Lucide icons/license and base chart
primitives. Do not also load `trend-workspace` or copy public component code into HTML.

## Visual contract

- Graphite canvas, off-white text, quiet grid lines; mint positive profit, coral
  negative profit. The document deliberately stays dark in either host theme.
- Full-width header and a continuous five-or-fewer metric ribbon. No left KPI rail,
  repeated floating cards, neon glow, gradients or invented growth indicators.
- Primary scatter occupies roughly 65% of the analysis width; the other 35% holds
  a signed ranked bar chart. Both have explicit units and a visible zero baseline.
- Positive and negative ranking values remain visible; dense positive scatter clusters use hover details to avoid overlapping labels.
  On narrow screens, preserve labels for negative items and stack the plots.
- The compact detail table is ordered by the business metric (profit ascending in
  this example), so losses appear first. Keep all rows in its named scroll region;
  do not silently truncate the query to the three rows seen in the design reference.
- Use system sans typography, 36px desktop title, 25–37px tabular KPIs, 14px body.
  Dropdowns retain the two-line caption/value contract with dark matching surfaces.

## Authoring

Set `<body data-dashboard-theme="profit-atlas@1">`, compose `atlas-header`,
`atlas-metrics`, `atlas-plots`, and a full-width details section as in `layout.html`.
`charts.scatter(chart, rows, {dimension,x,y,xLabel,yLabel})` takes explicit fields;
`charts.horizontal(chart, rows, {dimension,measure,label,color:'teal'})` draws signed
rankings. Sorting and backend totals remain the business runtime's responsibility.

Do not manufacture profit or financial meaning for unrelated data. For another
two-measure comparison, supply its real units and decide whether the zero reference
and negative labels are meaningful. Preserve all Binding and component IDs during
a style-only upgrade. After saving, verify the exact target Artifact and a real
filter; report visual acceptance separately from a successful save receipt.
