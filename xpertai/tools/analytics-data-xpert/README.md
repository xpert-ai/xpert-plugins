# data-xpert analytics provider

System plugin `@xpert-ai/plugin-analytics-data-xpert`; provider `data-xpert.ontology`, operation `action`, version 1.

Contributes the data-xpert DataSource type through DataSourceType sync. Server configuration: baseUrl (including /api), audience, assistantCode, assistantXpertId, workspaceId. No database runner is required. Platform code has no ontology dependency.

```json
{"resourceId":"datax-semantic-model-<published-model-id>","actionTypeCode":"sql.query_cube_slice","target":{"entityTypeCode":"semantic_cube","entityRef":"<published-model-id>::Sales"},"params":{"dimensions":["Region"],"measures":["Amount"],"filters":[{"field":"Region","op":"contains","value":"west"}],"limit":100},"parameterPaths":{"region":["filters","0","value"]}}
```

This is a SQL semantic-model Action example; it is not the contract for other ontology adapters. Replace placeholders and use exact targets/fields returned by published-resource discovery. Each registered Action defines its own params shape. Array path segments use canonical zero-based indices. Bindings cannot supply actor, credentials or URL. Paths replace entire existing scalar values, never SQL/MDX/OData fragments. Unknown/prototype paths fail.

The provider obtains the current actor's token via ActorTokenRuntimeFactoryCapability.createScopedApi(context.actor), then POSTs to /agent-workbench/analytics/query. data-xpert validates OIDC, Assistant/resource binding, explicit viewer policy and the existing Live Artifact read-only allowlist, bypassing Action result caches. Typed rows/columns and audit receipts are projected into the canonical Dataset.

Run `corepack pnpm exec nx run @xpert-ai/plugin-analytics-data-xpert:test` with the current platform SDK. Real integration requires the corresponding data-xpert endpoint, published resources, Assistant bindings, explicit viewer policy and working xpert-pro OIDC. Mocked identity tests do not establish SSO acceptance.

Discovery preserves each adapter's `definition` (identity, version, native metadata and instructions) and each Action's input schema. Semantic Model, OData and future registered read-only adapters share this transport without sharing query syntax.

See [architecture and Binding usage](docs/index.mdx) and [compatibility and verification](docs/verification.mdx).
