# Example authoring workflow

Use `read_skill_file` with paths resolved relative to the catalog SKILL.md to read `catalog.json`, then only the selected recipe. Supporting files can be read with the same tool; do not search sandbox directories or pass an absolute skill path to SandboxFile. Each recipe has a stable key and version, source, a preview, semantic field requirements, synthetic CSV/JSON and expected checks. Previews are illustrations of the bundled demo fixture, never evidence of a user's business data. The catalog is bundled with the skill, not a remote marketplace.

The Superstore enterprise suite is an exception to the small file workflow below: read `superstore/README.md` and use its published Data Xpert model, independent totals and multiple Bindings. Do not run file registration for that suite.

## Select the data mode first

An explicit request to “try demo” authorizes copying synthetic fixture data into the currently selected Project. If the mode is unspecified, ask whether to use the demo or real sources. Never put example data into an existing production file or silently use it when a real query fails. Do not create a new Project implicitly; let ChatKit's Project picker establish the scope.

## Execute, do not just return a page

1. Read the recipe's README, `definition.json`, `query.json` and source. Read HTML lifecycle guidance for HTML recipes. `demo.csv` and `demo.json` are alternatives, not two datasets to combine.
2. For the packaged synthetic CSV, call `analytics_definition_register` with only the exact catalog `exampleId`. The tool resolves the current Project, checks the local sample bytes and registers the packaged definition. Keep the returned source and version.
3. For a user-specified replacement file, follow the ordinary file inspection and definition registration flow. Resolve its authorized connection and verify its actual columns before adapting the recipe.
4. Refresh `dashboard_list_sources`, discover the registered source, and use its current `bindingPayload`. Merge `query.json.payloadFields` into that payload. Bind query parameter names to the same control IDs. Output fields map to the recipe column keys, with the actual declared types/units/nullability and explicit grain.
5. Use `dashboard_preview` for defaults and at least two filter values. Compare real returned rows, completeness, totals and weighted ratios with `expected.json`. Use `dashboard_test_filter` from the preview checks for the two filter values; keep the original default/null Binding. Use exactly one current successful preview receipt for the one saved Binding, not a duplicate Binding per tested filter. Keep the returned datasetId in standard chart/table definitions. An HTML example expects exactly one saved complete Binding and resolves its ID from the SDK's declared bindingIds.
6. Standard recipe: call `dashboard_create` using `dashboard-create.json` with this run's previewId and datasetId. HTML: call `dashboard_libraries`, write the complete HTML file, then `dashboard_create_html` with this run's previewIds, declared controls and `libraries:["echarts"]`. Do not publish automatically. Fix preflight errors before claiming success.
7. Stop authoring after the successful draft receipt and report it with the checked values. Do not call dashboard_open/update to confirm an unchanged save. The emitted card lets the user open the exact dashboard. UI acceptance verifies the persisted draft in Live Dashboard: all → option A → option B → all, chart, totals, details and toolbar refresh. A successful query alone is not proof of visible correct charts. Check Project synchronization and report the actual draft receipt. Publication is a separate human action.

## Adapt to business data

Use authorized files, database sources or published Data Xpert ontology resources. Discover and preview the actual source first. Map fields explicitly; confirm grain, currency, units and date semantics. Missing fields or denied access are blockers for the affected panel, not permission to invent data. For quality, weighted yield is sum(good)/sum(produced); a zero denominator displays “—”. These examples use safe integer counts and whole currency units; fractional or high-precision monetary data requires exact decimal aggregation and formatting rather than silently coercing to Number.

Never copy demonstration IDs, old preview receipts, file scope, credentials or backend SQL into HTML. Remove the visible demo label only after replacing and verifying all demo bindings. Preserve loading, empty, incomplete and error states; clear stale charts when a query fails. Keep every panel on the same filter. Existing saved dashboards are independent Artifacts: updating this example pack must not modify them. To edit one, use `dashboard_open` and its exact revision followed by the existing update workflow.
