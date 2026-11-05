# data-xpert analytics provider

The Live Dashboard Agent generates this provider’s Definition through `analytics_definition_connections` → `analytics_definition_inspect` → `analytics_definition_register`. Existing toolset/Integration credentials stay in their original configuration entries. Settings → Analytics is for viewing, correction and version management; users do not fill internal IDs. See [the authoring guide](../../../../docs/analytics-providers.md#automatic-definition-generation).
Configure API URL and audience in Settings → Integrations → data-xpert Analytics. The Agent selects this integration from the authorized catalog.

System plugin `@xpert-ai/plugin-analytics-data-xpert`; provider `data-xpert.ontology`, operation `action`, version 1.


```json
{"resourceId":"datax-semantic-model-<published-model-id>","actionTypeCode":"sql.query_cube_slice","target":{"entityTypeCode":"semantic_cube","entityRef":"<published-model-id>::Sales"},"params":{"dimensions":["Region"],"measures":["Amount"],"filters":[{"field":"Region","op":"contains","value":"west"}],"limit":100},"parameterPaths":{"region":["filters","0","value"]}}
```

This is a SQL semantic-model Action example; it is not the contract for other ontology adapters. Replace placeholders and use exact targets/fields returned by published-resource discovery. Each registered Action defines its own params shape. Array path segments use canonical zero-based indices. Bindings cannot supply actor, credentials or URL. Paths replace entire existing scalar values, never SQL/MDX/OData fragments. Unknown/prototype paths fail.

The provider obtains the current actor's token via ActorTokenRuntimeFactoryCapability.createScopedApi(context.actor), then POSTs to /agent-workbench/analytics/query. data-xpert validates OIDC, Assistant/resource binding, explicit viewer policy and the existing Live Artifact read-only allowlist, bypassing Action result caches. Typed rows/columns and audit receipts are projected into the canonical Dataset.

Run `corepack pnpm exec nx run @xpert-ai/plugin-analytics-data-xpert:test` with the current platform SDK. Real integration requires the corresponding data-xpert endpoint, published resources, Assistant bindings, explicit viewer policy and working xpert-pro OIDC. Mocked identity tests do not establish SSO acceptance.

Discovery preserves each adapter's `definition` (identity, version, native metadata and instructions) and each Action's input schema. Semantic Model, OData and future registered read-only adapters share this transport without sharing query syntax.

Before constructing a dashboard binding, call `dashboard_discover` with the selected source/provider and `requestJson` encoding:

```json
{"kind":"query-schema","payload":{"resourceId":"<discovered-resource>","actionTypeCode":"<discovered-read-action>","target":{"entityRef":"<canonical-target>"},"params":{},"parameterPaths":{}},"parameters":{}}
```

Omit `datasetId` to let the provider generate a valid local output key from the native payload, including its projection. An optional `datasetId` accepts a nonempty string of up to 512 characters: valid output keys (a letter followed by up to 79 letters, digits, `_`, `.` or `-`) are preserved; native references or other aliases are replaced with a generated key. Native resource IDs and targets are unchanged. Copy the returned `output.datasetId` as well as its fields.

Use the Action's actual bounded query arguments in `params`. This plugin-owned discovery request executes the same authorized `/agent-workbench/analytics/query` path as preview, with the current actor, host row limit and cancellation signal. It does not require a new DataXpert discovery endpoint. Copy `items[0].metadata.output` into the preview binding and use the same native payload and parameter values. The response includes no business rows and is not a preview receipt; a successful `dashboard_preview` is still required before saving.

Output fields retain exact native keys and declared types, roles and nullability, including empty results. Decimal/int64 cells remain exact strings. Stable field IDs are derived from native keys; duplicate semantic selectors use exact keys instead. Grain is left empty until query semantics establish uniqueness. Missing declarations fail with `DATAX_RESULT_SCHEMA_UNAVAILABLE`; duplicate native keys fail with `DATAX_RESULT_SCHEMA_AMBIGUOUS`. Legacy authored bindings can still execute without these optional declarations. Rediscover after changing the projection; existing incorrect saved bindings must be corrected and previewed before saving.

Release compatibility: this path uses existing exports from the published SDK/contracts 3.26.1 and does not require a new host capability. The companion SDK change only adds optional column metadata to its TypeScript contract. Merge and publish this plugin's Changeset, then update the installed plugin; merging source alone does not update an existing deployment. Schema authoring requires DataXpert to supply declared column metadata (including the decimal fix in data-xpert PR #108). SAP query errors, authentication, and model-generated malformed tool calls remain separate acceptance checks.

After building this plugin and Live Dashboard, run `node plugin-dev-harness/verify-datax-dashboard-schema.mjs` from the repository root. It invokes the real discovery and preview tools, provider and HTTP parser with published SDKs. Its local HTTP source and host-service fixtures do not establish customer SSO, SAP or browser acceptance.

See [architecture and Binding usage](docs/index.mdx) and [compatibility and verification](docs/verification.mdx).
# Public query diagnostics

Non-success HTTP responses may contain the shared `xpert.analytics.diagnostic` v1 envelope.
Only validated public causes and opaque audit references cross into `AnalyticsProviderError`.
Malformed, sensitive, oversized or unfinished bodies use the existing status-only fallback.
Parameter mapping failures use provider-authored repair guidance without echoing values.

This change requires the paired Contracts/SDK Analytics diagnostic exports and updated Xpert
runtime. Publish those packages, then update this plugin's dependency pins and lockfile before
release. Local paired-source tests do not establish compatibility with the currently pinned
published SDK. No production deployment is implied.
