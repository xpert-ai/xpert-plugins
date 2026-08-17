# Xpert Quotation

Xpert system Agentic App for pricing Nanjing Xpert Software XLSX workbooks.

Version 1.1.0 provides:

- Xpert Quotation-owned XLSX import, Workspace Files-backed versions, Univer viewing/editing, restoration, and download without an Office Editor runtime dependency.
- Bounded workbook inspection followed by `qwen3.6-plus` mapping of actual sheet names, header rows, data ranges, and columns.
- Dynamic recognition of building and installation bill, provisional-material, and measure sheets without requiring fixed numeric prefixes.
- Quota-item retrieval for every unresolved bill row from platform-native OCR, Markdown, and legacy structured chunks, with server-derived work scopes, auditable 1:N component proposals, explicit uncovered-work blockers, and reversible Workbench approval/rejection.
- Retrieval from authoritative price knowledge bases already connected to the current Agent; quotation users do not upload a separate price workbook.
- Material name, unit, and specification text from the project-feature description participate in knowledge retrieval and ranking.
- `qwen3.6-plus` review of multiple relevant knowledge chunks with persisted recommendation, confidence, rationale, and differences.
- Traceable recommendation evidence including knowledge-base, document, and chunk identity alongside the matched material and specification.
- Web-assisted fallback when a consumption or price knowledgebase is absent or has no reliable match: construction/quota decomposition and labor/material/machine pricing persist 1-5 real source URLs with exact evidence excerpts, while unsupported consumption values remain explicitly pending.
- One-click adoption of AI knowledge recommendations or AI web-price recommendations; Excel write remains a separate explicit approval.
- Human approval of AI recommendations plus manual pricing and skip controls for unresolved rows.
- A dedicated knowledgebase tab that lists only knowledgebases connected to the current Agent and performs bounded semantic inspection without exposing host credentials to the iframe.
- Recoverable deletion of imported quotation workbooks.
- Tenant-, organization-, and user-scoped one-step undo, including restoration through a new Xpert Quotation workbook version after workbook save or apply.
- Resource-level pricing after quota decomposition: every persisted labor, material, and machine resource gets its own knowledge query, alias-aware match, resource-unit validation, optional reviewed workday-hour conversion, and approval state.
- Resource pricing searches include a price-book-specific second pass and parse flattened PDF/OCR rows from official labor-wage, material-market, machine-rental, and turnover-material price tables into auditable structured price items.
- Deterministic comprehensive-rate calculation from approved quota consumption, approved normalized resource prices, and explicit ordered fee rules; the full calculation trace is persisted before any Excel write.
- Deterministic decimal amount calculations plus label-backed page subtotal and final-total writes; unverified total cells are never guessed.
- Empty-cell-only OOXML patches through the plugin-owned format-preserving workbook service.
- A React Workbench and strict Agent middleware tools for knowledge-assisted review.

Knowledge retrieval treats the material specification embedded in the quotation's project-feature description as a first-class matching signal. A price is recommended only when the retrieved knowledge evidence is sufficiently relevant. The Agent must explicitly persist that all current candidates are incompatible before the row can enter the auditable web-search fallback.

Quota breakdown is deliberately separate from material pricing. A proposed quota mapping never calculates or writes a bill comprehensive rate, and every persisted work scope must be represented exactly once as covered or uncovered. Current blockers include unreviewed or incomplete quota sources, discipline mismatch, missing repair/installation coverage, and pricing not yet evaluated.

The knowledgebase tab displays bounded semantic search results because the plugin does not request unrestricted full-corpus chunk pagination. Upload, OCR/parsing, chunking, embedding, document lifecycle, and access control belong to the platform Knowledgebase Workbench. The plugin searches each connected knowledgebase separately so every result has trustworthy provenance, and it does not require plugin-private metadata on platform-native chunks.

The earlier plugin-owned quota PDF ingestion tables and jobs remain available as a legacy compatibility path. They are no longer a prerequisite or an authorization bypass for Agent retrieval: online quotation search always starts from the current Agent's connected knowledgebases. Legacy synchronized chunks may be hydrated from the existing database only after the platform has returned them from an authorized connected knowledgebase search.

Quota knowledge preparation and comprehensive-rate decomposition are documented in:

- [综合单价知识库检索与拆分方案](docs/综合单价知识库检索与拆分方案.md)
- [知识资料目录、复核与上传说明](docs/knowledgebase/README.md)

Normalize the Jiangsu building and decoration quota PDF into one auditable record per quota item:

```bash
pnpm run knowledge:normalize
pnpm run test:quota-normalizer
```

Validation:

```bash
pnpm --filter @xpert-ai/plugin-xpert-quotation test
pnpm --filter @xpert-ai/plugin-xpert-quotation build
pnpm -C ../../plugin-dev-harness build
node ../../plugin-dev-harness/dist/index.js --workspace ./apps/xpert-quotation --plugin @xpert-ai/plugin-xpert-quotation --verbose
```
