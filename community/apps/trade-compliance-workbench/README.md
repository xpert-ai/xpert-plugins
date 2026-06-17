# Trade Compliance Workbench

Trade Compliance Workbench is a data-xpert app plugin for export compliance workflows:

- Controlled goods file intake and manual controlled goods maintenance.
- Supplier contract extraction, product enrichment, and controlled goods warning matches.
- Sales contract extraction and customs workbook generation.

The Workbench exposes three pages inside one remote component:

- Controlled Goods Management
- Product Management
- Customs Document Generation

## Build

```sh
pnpm --filter @xpert-ai/plugin-trade-compliance-workbench build
```

## Test

```sh
pnpm --filter @xpert-ai/plugin-trade-compliance-workbench test
```

## Lifecycle Validation

From the repository root:

```sh
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js \
  --workspace ./community/apps/trade-compliance-workbench \
  --plugin @xpert-ai/plugin-trade-compliance-workbench
```
