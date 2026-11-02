# Customer Brief v1 — editorial customer and returns report

Use this style for the approved warm customer brief or an explicitly chosen
management report. Read [theme selection and shared rules](../README.md) first.
Keep the current theme on unrelated edits; this is not a mandatory default.

## Installed assets and runtime

Read `theme.css`, `charts.js`, `layout.html` and the complete
`examples/superstore/customers.html`. Call `dashboard_libraries`, then use
`libraries:["echarts","customer-brief"]`; the global is `window.CustomerBrief`.
Shared select, icons/license and chart primitives are already bundled. Do not load
another theme library or retype its component implementation.

## Visual contract

- Warm paper-white canvas, forest ink, sage comparisons and terracotta returns.
  Headings and large metrics use a local serif stack (Songti SC / Noto Serif CJK /
  SimSun / system serif); body, controls and tables remain readable sans-serif.
  No external font request is required. Low-light mode has matching warm tokens.
- Large title, a horizontal customer/order/value ribbon and a single grouped return
  area. Put return percentage before return count visually, retaining metric IDs.
  No KPI sidebar, card grid, decorative avatars, gauges or unsupported risk badges.
- Two numbered sections compare customer groups and regions; keep common zero
  baselines. Numbers are direct labels. Color differentiates groups, not an invented
  business threshold. Show exact values again in a complete compact table.
- At 760px the return group and plots stack; at 390px three compact filters remain
  keyboard-accessible, and only the named table region may scroll horizontally.

## Authoring

Set `<body data-dashboard-theme="customer-brief@1">`, then use `brief-header`,
`brief-metrics`, `brief-primary-metrics`, `brief-return-metrics` and `brief-plots`.
Use `charts.horizontal(chart, rows, {dimension,measure,label,palette:[...]})` with
explicit color token names: `['blue','segment-two','segment-three']` for the ordered
customer comparisons; `['returns']` and `decimals:0` for return-order counts.
Other datasets must supply their own real grouping, measures and units.

Customer counts must be independently deduplicated for the current scope. Return
share is returned orders divided by orders, not returned items divided by quantities.
Return-associated sales are not refunds or lost revenue. Do not sum group customer
counts to invent a total, or add these return metrics to sources that do not have them.

For existing HTML, keep Binding IDs and all metric/chart IDs while rearranging the
DOM. Read the current editing copy, make bounded exact edits and save the explicit
theme choice through `dashboard_update`. Test a real region filter and restoration,
including every KPI, plot and detail row. A save receipt alone is not visual QA.
