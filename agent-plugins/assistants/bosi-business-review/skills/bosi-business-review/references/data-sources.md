# Three data access routes

Source selection follows the user's question and current authorization. Protocol
selection follows explicit provider/adapter metadata, not names, localized labels
or the Assistant role. Use the exact source/provider pair returned by tools.

## Common governed interface

`dashboard_list_sources` → `dashboard_discover` → `dashboard_preview` (or
`dashboard_preview_binding` for a returned canonical Binding).

Start discovery with `requestJson: "{}"`; serialize returned `inspectRequest` and
`nextRequest` unchanged. Continue pagination, including empty filtered pages with
a next request. Inspect each plausible candidate once; retain a compact inventory.
Follow `queryContract`, Action `inputSchema`, `inputHint`, adapter `instructions`
and entity `definition`. Do not fabricate field, resource, model or action IDs.

Data Xpert's `data-xpert.ontology` provider serves both semantic models and SAP
OData resources. Its `action` envelope is shared; its inner parameters are not.
Copy resource, target and Action references from discovery. Use `parameterPaths`
relative to `params`, replacing existing scalar values rather than interpolating
SQL, MDX or OData strings. Runtime access checks remain authoritative.

When a source is not registered, inspect an authorized connection using the
`analytics_definition_*` tools. Register only the definition justified by discovery;
the host supplies identities. If no connection exists, request administrator setup.
Do not put credentials or endpoints in HTML, a prompt, a Skill or a Binding payload.

## BW / XMLA

- Consume an authorized published semantic model, normally exposed as
  `business_ontology` with adapter `semantic_model`. Use discovered Cube/measure/
  hierarchy metadata and the offered MDX Action, such as `mdx.query_cube_slice`.
- Resolve SAP input variables, fiscal-year variant, ledger, actual/plan version,
  display currency and exchange-rate type from metadata. Supply complete member
  unique names returned by discovery; a caption or a plain leaf value is not one.
- A catalog entry is not proof of a runnable model. Preview the selected measures,
  actual period and representative slice before building a dashboard.
- Never add balances over time without an explicit stock/flow aggregation rule.
  Verify ratios against their governed formulas; an amount captioned "margin" or
  "profit rate" may still be a currency amount.
- Metadata discovery/timeouts/mandatory-variable errors are setup diagnostics.
  Make one justified correction from the returned contract, then report the gap.
  Do not silently switch to another Cube or a synthetic financial statement.

## SAP OData

- For adapter `sap_odata_api`, inspect the exact `sap_odata_entity_set`, EDM
  properties, key schema, protocol version and query capabilities. Use the offered
  read Action, normally `sap_odata.read_collection` or `sap_odata.read_entity`.
- Respect supported `top`, `select`, `filter`, `orderby` and `expand` parameters.
  Missing capability means unknown support. Do not invent OData navigation paths.
- Current Data Xpert Live Artifact OData queries do **not** support `$apply`
  aggregation. Never pass unsupported `$apply` or pretend a collection page is an
  enterprise total. Prefer a published analytical entity or semantic aggregate.
- Paging, returned-row limits and truncation are part of correctness. A page can
  support a clearly labeled detail table. A KPI total, rank or percentage needs a
  complete relevant population or a server-computed aggregate with a proven scope.
  If the governed route cannot provide this, request a suitable model; do not
  fetch the source directly or concatenate arbitrary pages in browser HTML.
- Use only read Actions offered to the current viewer. Procurement analysis never
  authorizes creating purchase orders, changing suppliers or invoking write actions.

## Database

- Prefer a published semantic model/metric with its offered SQL or MDX Action;
  relational models may be served through an OLAP engine. Choose by the contract,
  not by the database brand or an assumption that every database requires SQL.
- If an authorized native SQL analytics provider is available, inspect its schema,
  dialect, read-only query contract and parameter rules before previewing.
- Prove table grain and join cardinality. Aggregate facts at a compatible grain
  before combining them; never multiply order amounts by joining header totals
  to several lines. Distinct orders, order lines and shipments are different KPIs.
- Bind typed values. Never use a broad SELECT *, business writes, DDL, credentials
  from files, or a sandbox connection to bypass the governed provider.

## Completeness and failure handling

Preserve decimal/int64 precision and currency/unit dimensions. Mixed-currency
markers, mixed units, truncated pages and unidentified time grains block relevant
totals. A failed query is not evidence of no business activity. A model without
data can remain a planned topic with explicit requirements. Honor the requested
topic; do not replace it with whichever demo currently returns rows.

No more than one diagnostic correction for an unchanged failure. Preserve a
successful preview for the same binding instead of repeatedly rediscovering it.
When data or filters change, obtain fresh preview/filter evidence.
