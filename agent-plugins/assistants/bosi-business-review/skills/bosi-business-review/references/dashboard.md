# Turn an analysis into a Live Dashboard

Use the installed `live-dashboard` Skill for lifecycle, current schemas, rendering,
filters and visual themes. This suite supplies business methods; it does not fork
the dashboard runtime. Use `window.xpertLiveArtifact` as that Skill specifies, not
the separate `window.dataxLiveArtifact` API. Never mix their manifests or save tools.

Choose the composition after previewing actual data:

- A concise executive brief: decision context, key signals, two or three drivers,
  evidence and discussion points.
- A financial review: verified actual/comparison KPIs, trend, a reconciled variance
  bridge where its components are known, and drill-down detail.
- An operational analysis: relevant ranked breakdowns, exceptions and detail with
  source-supported filters.

Read `live-dashboard/themes/README.md` through the installed Skill catalog. Select
one suitable theme, then read its guide. Example dataset bindings are not reusable
for the user's data. Preserve the current style when editing unless asked to change.

Preview every binding and execute required filter checks before saving. All active
controls must update every affected chart, KPI and table. Show scope, units, data
as-of information and honest empty/error/partial states. Do not hide missing data
with fabricated KPIs, decorative charts or placeholder constants.

For an existing selected dashboard, use `dashboard_open` and returned edit/revision
tokens; do not choose a historical artifact by title. `selection_required` means
ask the user to select the dashboard, not restore an old target. For a new requested
dashboard, use a fresh project-relative file and save using `dashboard_create_html`
or `dashboard_create`. A file write alone is not completion.

Saving creates a draft. Human publication remains in the existing Workbench.
Do not publish, share across projects or create tasks merely because a dashboard
was requested. The same ChatKit Project owns the dashboard and analysis files.

Report success only after a real save receipt. Verify an actual filter and refresh
when the runtime supports inspection; otherwise state the unverified interaction
instead of claiming visual acceptance from a backend response.
