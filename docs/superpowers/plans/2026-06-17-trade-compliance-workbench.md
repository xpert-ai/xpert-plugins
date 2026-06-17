# Trade Compliance Workbench Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the first version of `@chenchaolong/plugin-trade-compliance-workbench` with three Workbench pages, shared review batches, product enrichment fallback, controlled goods warning matching, and customs workbook data generation.

**Architecture:** Follow the existing `community/apps` app plugin pattern. The plugin exports an `XpertPlugin`, registers a Nest module with TypeORM entities, exposes Assistant middleware tools, contributes one Workbench view provider with a remote React iframe, and includes assistant template assets. Core business behavior lives in small pure helper modules with focused tests before service integration.

**Tech Stack:** TypeScript, NestJS, TypeORM, `@xpert-ai/plugin-sdk`, `@xpert-ai/contracts`, LangChain tools, zod v3, xlsx, YAML assistant template assets.

---

## File Structure

- Create `community/apps/trade-compliance-workbench/package.json` for package metadata, scripts, dependencies, and plugin level.
- Create `community/apps/trade-compliance-workbench/tsconfig*.json` matching existing community app plugins.
- Create `community/apps/trade-compliance-workbench/scripts/copy-assets.mjs` to copy assistant template and remote component assets.
- Create `community/apps/trade-compliance-workbench/src/index.ts` as the default `XpertPlugin` export.
- Create `community/apps/trade-compliance-workbench/src/xpert-trade-compliance-workbench-assistant.yaml` as the assistant template.
- Create `community/apps/trade-compliance-workbench/src/lib/constants.ts` for provider keys, tool names, feature names, and icons.
- Create `community/apps/trade-compliance-workbench/src/lib/types.ts` for explicit discriminated data contracts.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance.config.ts` for plugin config and template defaults.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance.matching.ts` plus spec for controlled goods matching.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance.enrichment.ts` plus spec for mock product enrichment.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance-workbook.ts` plus spec for customs workbook data mapping.
- Create `community/apps/trade-compliance-workbench/src/lib/entities/*.entity.ts` for TypeORM storage.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance-workbench.service.ts` plus spec for review state transitions and save flows.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance-workbench.middleware.ts` for Assistant tools.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance-workbench-view.provider.ts` for Workbench manifests, data, actions, and remote component entry.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance-workbench.plugin.ts` for the Nest module.
- Create `community/apps/trade-compliance-workbench/src/lib/trade-compliance-workbench.templates.ts` for assistant template contribution.
- Create `community/apps/trade-compliance-workbench/src/lib/remote-components/trade-compliance-workbench/app.js` as a first-version iframe UI.
- Create `community/apps/trade-compliance-workbench/README.md` documenting workflows and validation.

## Tasks

### Task 1: Package Scaffold

**Files:**
- Create package, tsconfig, copy script, constants, types, config, README, assistant template.

- [ ] Create package scaffold by copying the structure used by `community/apps/procurement-quote-comparison`.
- [ ] Add constants for provider key, middleware name, feature key, view key, template provider key, and tool names.
- [ ] Add zod config with optional product enrichment API/MCP settings and template defaults.
- [ ] Run `pnpm --filter @chenchaolong/plugin-trade-compliance-workbench test`; expected initial pass once files compile.

### Task 2: Core Matching and Enrichment

**Files:**
- Create `trade-compliance.matching.ts`
- Create `trade-compliance.enrichment.ts`
- Create matching and enrichment specs.

- [ ] Write failing tests for HS-code match, keyword suspected match, no match, and disabled controlled goods ignored.
- [ ] Implement matching with explicit fields only: HS code, product name, description, keywords.
- [ ] Write failing tests for mock enrichment returning server defaults and unknown product fallback.
- [ ] Implement enrichment fallback with deterministic mock records for server products.
- [ ] Run plugin test script and confirm it passes.

### Task 3: Workbook Mapping

**Files:**
- Create `trade-compliance-workbook.ts`
- Create workbook mapping spec.

- [ ] Write failing tests for merging sales contract extracted fields with template defaults.
- [ ] Write failing tests for producing four sheet names: `报关单`, `CI`, `Contract`, `PL`.
- [ ] Implement workbook preview model and `.xlsx` generation buffer helper using xlsx.
- [ ] Run plugin test script and confirm it passes.

### Task 4: Entities and Service

**Files:**
- Create TypeORM entities.
- Create service and service spec.

- [ ] Write failing service tests for creating review batches, confirming single items, confirming multiple items, saving controlled goods, saving products, and creating workbook generations.
- [ ] Implement entity classes with explicit typed fields and JSON columns for flexible extracted data.
- [ ] Implement service methods used by middleware and view provider.
- [ ] Run plugin test script and confirm it passes.

### Task 5: Middleware Tools

**Files:**
- Create middleware and middleware spec.

- [ ] Write failing tests that middleware exposes controlled goods, supplier contract, product enrichment, matching, sales contract, and workbook generation tools.
- [ ] Implement zod schemas and tool handlers that delegate to service methods.
- [ ] Ensure tool names match constants and template instructions.
- [ ] Run plugin test script and confirm it passes.

### Task 6: View Provider and Remote Component

**Files:**
- Create view provider and view provider spec.
- Create remote component `app.js`.

- [ ] Write failing tests for a single Workbench manifest with three page tabs represented in view metadata/actions.
- [ ] Write failing tests for `getRemoteComponentEntry` returning iframe HTML for the expected entry key.
- [ ] Implement view manifests, `getData`, `handleAction`, and remote component entry.
- [ ] Add a first-version remote UI with three tabs, review list/detail layout, and placeholder action calls.
- [ ] Run plugin test script and confirm it passes.

### Task 7: Plugin Entry and Template

**Files:**
- Create plugin module, plugin entry, and templates.

- [ ] Implement `@XpertServerPlugin` module with all entities, service, middleware, and view provider.
- [ ] Implement default plugin export with metadata, marketplace contents, runtime providers, config schema, and templates.
- [ ] Add assistant DSL template instructions for the three workflows.
- [ ] Run build and test commands.

### Task 8: Lifecycle Validation

**Files:**
- No new source files unless validation exposes issues.

- [ ] Run `pnpm --filter @chenchaolong/plugin-trade-compliance-workbench build`.
- [ ] Run `pnpm --filter @chenchaolong/plugin-trade-compliance-workbench test`.
- [ ] Run `pnpm -C plugin-dev-harness build`.
- [ ] Run `node plugin-dev-harness/dist/index.js --workspace ./community/apps/trade-compliance-workbench --plugin @chenchaolong/plugin-trade-compliance-workbench`.
- [ ] Fix any lifecycle failures and rerun the failing command.

## Coverage Check

- Three pages are covered by the view provider and remote component tasks.
- Shared review is covered by service, middleware, and view tasks.
- Controlled goods management is covered by entities, service, matching, and middleware tasks.
- Product management is covered by enrichment, matching, service, middleware, and view tasks.
- Customs workbook generation is covered by workbook mapping, service, middleware, and validation tasks.
- API/MCP fallback is covered by config and enrichment tasks.
- Lifecycle validation is explicitly included.
