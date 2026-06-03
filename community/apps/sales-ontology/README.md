# @xpert-ai/plugin-sales-ontology

Sales Ontology business decision app plugin for data-xpert ontology, Assistant middleware tools, Workbench views, and the Sales Ontology business assistant template.

## Install

```sh
pnpm add @xpert-ai/plugin-sales-ontology
```

## Build

```sh
pnpm --filter @xpert-ai/plugin-sales-ontology build
```

The build emits TypeScript output to `dist/` and copies the assistant DSL template plus remote component assets required by the Workbench view.

## Package

```sh
pnpm --filter @xpert-ai/plugin-sales-ontology pack
```

## Runtime Notes

- Register the package through the Xpert plugin loader.
- Configure `SALES_ONTOLOGY_DATA_XPERT_API_BASE_URL` or the equivalent plugin config when the plugin needs to publish/query data-xpert business ontology resources.
- The default assistant middleware remains compact; optional specialized middlewares are exposed separately for context, decision intelligence, action governance, and scenario learning.
