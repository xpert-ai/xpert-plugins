# Trade Compliance Workbench Design

Date: 2026-06-17

## Summary

Trade Compliance Workbench is a data-xpert community app plugin for export compliance and customs document preparation. It provides one Workbench app with three pages:

- Controlled Goods Management
- Product Management
- Customs Document Generation

The first version focuses on file intake, agent-assisted extraction, human review, product enrichment, controlled goods risk warnings, and generation of a complete customs workbook with four sheets: declaration form, Commercial Invoice, Sales Contract, and Packing List.

## Goals

- Let users upload controlled goods files and convert extracted entries into a maintained controlled goods library.
- Let users manually maintain controlled goods records.
- Let users upload supplier contracts, extract supplier and product information, enrich product records, and review them before saving.
- Let users upload sales contracts, review extracted and defaulted fields, and generate a customs workbook.
- Use one reusable comparison review model for all agent-extracted information.
- Keep controlled goods matches as warnings only in the first version. They do not block product saving or customs workbook generation.
- Support real API/MCP product enrichment when configured, with mock data fallback when not configured.

## Non-Goals

- No forced compliance blocking in the first version.
- No versioning, effective date, expiry date, region-specific control rules, or control severity for controlled goods maintenance in the first version.
- No direct integration with a customs declaration system.
- No automatic legal determination beyond risk hints from uploaded controlled goods data and configured enrichment tools.

## App Structure

The plugin contributes one Workbench app named:

- English: `Trade Compliance Workbench`
- Chinese: `外贸合规工作台`

Working package and directory names:

- Package: `@xpert-ai/plugin-trade-compliance-workbench`
- Directory: `community/apps/trade-compliance-workbench`

The app has three page tabs.

### Page 1: Controlled Goods Management

This page manages the controlled goods library.

Primary capabilities:

- Upload controlled goods files such as dual-use goods PDF catalogs or other domestic/foreign export control lists.
- Call an agent to extract controlled goods entries.
- Show extracted entries in a pending review batch.
- Review extracted entries using the shared comparison review UI.
- Confirm entries into the controlled goods library individually or in bulk.
- Manually add, edit, delete, enable, and disable controlled goods.

First-version fields:

- Product name
- Keywords
- HS code
- Control note
- Enabled/disabled status
- Source file name
- Source page or location, when available
- Extraction confidence, when available
- Review status

### Page 2: Product Management

This page manages supplier-classified products.

Primary capabilities:

- Show product records grouped or filterable by supplier.
- Upload supplier contracts.
- Call an agent to extract supplier information and product line items.
- Enrich product information with HS code, tax refund rate, and English product name.
- Match products against the controlled goods library.
- Show controlled goods status as a warning.
- Review extracted and enriched product records before saving.
- Confirm records individually or in bulk.

Product records include:

- Supplier information
- Supplier contract metadata
- Product name extracted from contract
- Model
- Description/specification
- Quantity
- Unit
- Tax-inclusive unit price
- Tax-inclusive total amount
- HS code extracted from contract
- Enriched HS code
- Tax refund rate
- English product name
- Controlled goods status
- Control note
- Matched controlled goods references
- Review status

Controlled goods status values:

- `unchecked`
- `not_controlled`
- `suspected`
- `controlled`

First-version behavior:

- Controlled goods matches are warnings only.
- Users can still save products and generate customs documents after acknowledging or reviewing the warning.

### Page 3: Customs Document Generation

This page manages sales contract uploads and generated customs workbooks.

Primary capabilities:

- Show historical uploaded sales contract files.
- Show historical generated customs workbook files.
- Upload a sales contract.
- Call an agent to extract sales contract information.
- Merge extracted values with configured template defaults.
- Review all generated workbook fields before file generation.
- Generate a complete Excel workbook with four sheets:
  - Declaration form
  - `CI` / Commercial Invoice
  - `Contract` / Sales Contract
  - `PL` / Packing List
- Download generated files.

Required data groups:

- Basic document data: invoice number, contract number, date, buyer, seller, addresses, contact details.
- Trade data: origin, destination, country/region, trade term, payment term, currency, exchange rate.
- Product line items: English product name, model, English description, quantity, unit, unit price, amount, HS code.
- Declaration data: domestic consignor, overseas consignee, producer/seller, supervision mode, tax exemption nature, package type, package count, gross weight, net weight, source location, final destination.
- Packing data: carton number, dimensions, net weight, gross weight, volume, total cartons.
- Bank data: beneficiary, bank name, bank address, account number, CNAPS, Swift code.

Missing sales contract fields use template defaults. Users can edit the resulting confirmed values during review before generation.

## Shared Review Model

All extracted information uses the same review model.

Review UI:

- Main list for pending batches and extracted items.
- Right-side detail drawer for evidence and field correction.
- Search and filters by file, batch, status, risk state, supplier, or keyword where applicable.
- Single-item confirmation.
- Bulk confirmation.
- Reject and re-extract actions.

For each reviewed field, the model tracks:

- Field key
- Field label
- Extracted value
- Default value, when used
- Confirmed value
- Source type: extraction, default, manual, enrichment, or matching
- Source evidence, such as page number, row, text snippet, or sheet cell
- Confidence, when available
- Review status

Review statuses:

- `pending`
- `confirmed`
- `rejected`
- `needs_revision`

## Agent and Tool Responsibilities

The plugin should expose agent tools for these workflows:

- Parse controlled goods file into controlled goods entries.
- Save controlled goods extraction results into a review batch.
- Parse supplier contract into supplier and product records.
- Save supplier/product extraction results into a review batch.
- Enrich products with HS code, tax refund rate, and English product name.
- Match product records against controlled goods records.
- Parse sales contract into customs workbook source fields.
- Save sales contract extraction results into a review batch.
- Prepare customs workbook preview data after merging extraction values with defaults.
- Generate or request generation of the final customs workbook after review confirmation.

Product enrichment should support:

- Configured real API/MCP source.
- Mock fallback source when no external source is configured.

Matching must use explicit fields such as HS code, product name, keywords, and descriptions. It must not infer record type or category from display text alone.

## Data Model Overview

The implementation should keep these concepts distinct:

- File import batch
- Extracted review item
- Reviewed field value
- Controlled goods record
- Supplier record
- Product record
- Sales contract import
- Customs workbook generation
- Generated file record
- Template default configuration

Suggested storage entities:

- `TradeComplianceImportBatch`
- `TradeComplianceReviewItem`
- `TradeComplianceReviewField`
- `ControlledGoodsRecord`
- `TradeSupplier`
- `TradeProduct`
- `TradeSalesContract`
- `CustomsWorkbookGeneration`
- `TradeTemplateDefaults`

The exact entity names can follow the final package naming convention during implementation.

## Template Defaults

The plugin needs configurable defaults for customs workbook generation.

Initial defaults include:

- Seller English name
- Seller English address
- Phone and email
- Bank information
- Default payment term
- Default trade term
- Default origin
- Default package type
- Default supervision mode
- Default tax exemption nature
- Default domestic source location
- Default invoice number rule
- Default exchange rate

Defaults are merged with extracted sales contract fields before review. The review UI must show whether a confirmed value came from extraction, default, or manual edit.

## Excel Generation

The first version generates the full customs workbook, not only the Commercial Invoice.

The workbook should preserve the sample workbook structure as closely as practical:

- `报关单`
- `CI`
- `Contract`
- `PL`

Generated downloads use modern `.xlsx` output. The sample `.xls` workbook is the layout and field reference, not a requirement to emit legacy binary `.xls`.

The generation flow:

1. User uploads sales contract.
2. Agent extracts sales contract data.
3. System merges extracted fields with template defaults.
4. User reviews and edits generated workbook fields.
5. System generates the workbook.
6. User downloads the generated file from history.

## Test Fixtures

Use these local samples as reference fixtures:

- `/Users/chenchaolong/外贸/报关资料-YCLF260228001C.xls`
- `/Users/chenchaolong/外贸/采购合同.docx`
- `/Users/chenchaolong/外贸/两用物项和技术进口许可证管理目录2025.12.31.pdf`

The supplier contract fixture can be synthetic for automated tests. It should include supplier information, contract metadata, multiple product lines, HS code fields, missing optional fields, and at least one product that can trigger a controlled goods warning.

## Validation Strategy

Implementation validation should include:

- TypeScript build for the plugin.
- Type-only tests or unit tests for extraction result normalization, review state transitions, controlled goods matching, product enrichment fallback, and workbook data mapping.
- Plugin lifecycle validation through `plugin-dev-harness` after plugin modification.
- Manual check of generated workbook shape against the sample workbook.

## Open Implementation Decisions

These are design-approved but implementation-specific:

- Whether the remote component is authored as a hand-written single `app.js` first or generated from a local frontend build step.
- Exact external API/MCP schema for product enrichment. The first version must work without it through mock fallback.
- Exact Excel writing library, as long as it emits `.xlsx` files with the required sheet names and required fields.
