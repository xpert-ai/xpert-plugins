# plugin-dev-harness

Minimal NestJS container for plugin loading/lifecycle validation across multiple plugin workspaces in `xpert-plugins`.

## What It Does

- Loads a plugin package from a target workspace (`xpertai`, `community`, or any custom folder).
- Validates plugin shape (`meta` + `register`).
- Reads optional config JSON and validates it via plugin schema when available.
- Boots a minimal NestJS `ApplicationContext`.
- Calls plugin lifecycle hooks:
  - `onInit`
  - `onStart`
  - module `onPluginBootstrap`
  - shutdown `onPluginDestroy`
  - shutdown `onStop`

## CLI

```bash
node dist/index.js --workspace <path> --plugin <package> [--config <file>] [--verbose] [--no-mocks]
```

Required:

- `--workspace`: plugin workspace root (must contain `package.json`)
- `--plugin`: plugin package name (for example `@xpert-ai/plugin-lark`)

Optional:

- `--config`: JSON file path for plugin config
- `--verbose`: enable debug logs
- `--no-mocks`: disable built-in TypeORM/CACHE mocks

## Quick Start

```bash
pnpm -C plugin-dev-harness install
pnpm -C plugin-dev-harness build
pnpm -C xpertai exec nx build @xpert-ai/plugin-lark
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-lark
```

If your local Node is v22+, run with Node 20 for better package compatibility:

```bash
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-lark
```

## Notes

### Standard Agent Plugins

Portable resource packages have no NestJS `meta/register` export or server hooks.
Validate their lifecycle through the separate format-specific runner:

```sh
cd agent-plugins # from the xpert-plugins repository root
corepack pnpm install --frozen-lockfile
corepack pnpm test
corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"
```

`XPERT_PLATFORM_ROOT` points to the host source checkout with dependencies installed.
The runner packages the actual distributable ZIPs, uses the host's production
extractor/parser, compares content digests, resolves Skills/MCP and Connector dependency
bindings, then cleans up temporary files. It does not execute bundled code or
contact third-party services. It does not replace live authorization/tool-call
acceptance; provider-specific outcomes are recorded in `agent-plugins/README.md`.

### Native plugins

- This tool resolves plugin packages from the selected `--workspace` using `createRequire(<workspace>/package.json)`.
- This tool loads Nest runtime (`@nestjs/core`) from the selected `--workspace` to avoid duplicate Nest containers.
- This tool provides global `TypeORM` (`DataSource` / `EntityManager`), `CACHE_MANAGER`, permission-service, and empty runtime-capability registry mocks so plugins using host-injected infrastructure can boot without a full app runtime.
- TypeORM/cache mocks are no-op test doubles intended for lifecycle validation only.
- You can disable mocks with `--no-mocks` to validate plugin behavior against real dependencies.
- Default behavior is dist-export-first (no direct `src` loading).
- This tool does not modify `xpert-pro`, `xpertai`, or `community` runtime loading logic.

## Troubleshooting

- `ERR_PNPM_RECURSIVE_EXEC_FIRST_FAIL Command "xpertai" not found`
  Use `pnpm -C xpertai exec nx build ...` (include `exec`).
- `Cannot find module '@metad/store'` while loading lark plugin
  Use `@metad/store` `3.6.7` in `xpertai/integrations/lark/package.json` (the published `3.7.5` package is missing runtime build output).
- `Cannot access 'STATE_VARIABLE_HUMAN' before initialization` on Node 22
  Run harness with Node 20 (`npx -y node@20 ...`).

### Live Agent Plugin / Connector verification

The disposable fixture verifies the real platform, SDK, Connector OAuth lifecycle
and Agent runtime together. It does not sign in to third-party accounts. Start the
source API, configure its normal login environment/Keychain, and supply a private
JSON context with `orgId`, `workspaceId` and a published **test** `assistantId` that
has a working model. Do not commit that context or its receipts.

```sh
node plugin-dev-harness/agent-plugins-connector-live.mjs \
  --platform-root "$XPERT_PLATFORM_ROOT" \
  --sdk-root "$XPERT_SDK_ROOT" \
  --api-url http://localhost:3333/api \
  --context "$PRIVATE_TEST_CONTEXT" \
  --output-dir "$PRIVATE_TEST_RECEIPTS"
```

The script verifies path-based metadata discovery, dynamic client registration,
PKCE, resource binding, browser callback-cookie isolation, encrypted Connector
storage, automatic refresh, a real read-only Agent tool invocation, persisted MCP
App resource loading, reuse across package versions and revocation. It leaves the
Assistant graph unchanged, disconnects its fixture workspace connection and disables its test
bindings in cleanup. Test conversations and imported packages remain inspectable.
Receipts have restrictive permissions and may contain host-specific identifiers;
stdout contains only verification results and counters.

Live provider discovery is recorded separately in `agent-plugins/README.md`.
A provider authorization URL is not evidence of user consent or successful access
to that user's private content.

### Documents verification

Prepare the desktop runtime with the platform's `tools/documents-runtime/install.mjs`,
LibreOffice Writer and CJK fonts. From the repository root:

```sh
python3 agent-plugins/documents/skills/documents/scripts/documents.py run \
  plugin-dev-harness/documents-smoke.py \
  --skill agent-plugins/documents/skills/documents --output /tmp/documents-smoke-new
node plugin-dev-harness/documents-live.mjs \
  --platform-root "$XPERT_PLATFORM_ROOT" --sdk-root "$XPERT_SDK_ROOT" \
  --api-url http://localhost:3000/api \
  --context "$PRIVATE_TEST_CONTEXT" --output-dir "$PRIVATE_TEST_RECEIPTS"
```

The smoke test checks real DOCX comments/anchors, tracked text/style preservation,
source preservation, rejected ambiguous edits, fresh output, Chinese PDF text and
page images. Inspect every output PNG separately; test success is not visual approval.
Pagination may differ between desktop and Linux LibreOffice/font versions.

The live context has the same private fields as the Connector harness. Choose a
published test Assistant with interactive sandbox enabled and an image-capable
model; install the native view-image provider first. The harness publishes the
portable Documents package, selects it for a new conversation, requests a two-page
document and records the complete events privately. It checks successful doctor,
inspection, rendering and image tool replies, downloads the DOCX/PDF/PNGs through
the same authenticated endpoint as the Files panel, and compares the DOCX hash
with the render receipt. Inspect the downloaded PNGs before claiming visual
approval. It checks the graph stays unchanged. The package and conversation remain inspectable;
this harness does not change the model or publish an Assistant.

### PDF verification

Install the separate runtime with the platform's `tools/pdf-runtime/install.mjs`.
From this repository root:

```sh
python3 agent-plugins/pdf/skills/pdf/scripts/pdf.py run \
  plugin-dev-harness/pdf-smoke.py \
  --skill agent-plugins/pdf/skills/pdf --output /tmp/pdf-smoke-new
```

The test verifies actual embedded Chinese text, table extraction, merged/reordered
pages, source preservation, canonical form values and appearances, shared widgets
on multiple pages, flattening, and rejected orphan/duplicate/hidden/read-only
fields. Review all six rendered PNGs. A successful assertion is not visual QA.

For PRO, build the complete interactive sandbox image, start its normal service
as an unprivileged user with networking disabled, copy this harness and the Skill
into the container, and invoke the same command through `POST /shell/exec/`.
Run the Documents smoke in that image too. Copy source bytes rather than relying
on a pre-existing Docker Desktop bind mount cache when validating recent edits.

For product acceptance, publish PDF using the normal authenticated installer,
open the local web UI, select PDF on a published sandbox Assistant, and send a
natural-language request for a two-page Chinese PDF with a table. Observe the
doctor, generation, inspection, rendering and image-review tools. Open the result
in the Files panel and download it. Keep conversation IDs, downloaded evidence
and credentials outside the repository; record results in the plugin acceptance
document. API-only generation is not a substitute for this UI check.

### Native Connector migration verification

Run `node plugin-dev-harness/verify-connectors.mjs` from the repository root. It reads the explicit 15-Connector inventory, builds and type-checks the shared authentication library and every Connector, runs their tests, then checks dist-first lifecycle loading and all 16 packed artifacts. It verifies that workspace dependencies become publishable version ranges. The script performs no deployment or third-party account authorization. See [Connector Runtime](../xpertai/packages/connector-runtime/README.md) for the migration matrix, preserved vendor adapters and release order.

### Presentations verification

Install the platform's `tools/presentations-runtime/install.mjs`, LibreOffice
Impress and Noto Sans CJK SC. Run:

```sh
python3 agent-plugins/presentations/skills/presentations/scripts/presentations.py run \
  plugin-dev-harness/presentations-smoke.py \
  --skill agent-plugins/presentations/skills/presentations --output /tmp/presentations-smoke-new
python3 plugin-dev-harness/artifact-sandbox-smoke.py \
  --image xpert-pro-sandbox:presentations-test --output /tmp/artifact-service-new
```

The fixture checks native objects, unique shape IDs (including table/title
collisions), embedded chart workbooks, notes, CJK text, all three chart types,
both themes, presentation order, fresh rendering, source preservation, stale
hashes, ambiguous edits and external media rejection. The Docker harness starts
the final image's normal HTTP service with a non-root user and no external network,
then runs Presentations, Documents and PDF through its `/shell/exec/` endpoint.
It removes only the container it created and leaves local result evidence.
Review all final slide PNGs separately.

Browser acceptance additionally selects the published portable plugin, sends a
natural-language generation request, opens the PPTX editor, changes and saves a
text shape, then asks the Agent to inspect that saved file and create a modified
copy. Download the actual UI result and inspect its text, tables, native chart
workbook and notes. Keep screenshots and machine IDs in private receipts.

### Spreadsheets verification

Install the platform's `tools/spreadsheets-runtime/install.mjs`, LibreOffice Calc
and Noto Sans CJK SC. From the plugin repository root:

```sh
corepack pnpm --filter @xpert-ai/artifact-tool test
python3 agent-plugins/spreadsheets/skills/spreadsheets/scripts/spreadsheets.py run \
  plugin-dev-harness/spreadsheets-smoke.py \
  --skill agent-plugins/spreadsheets/skills/spreadsheets --output /tmp/spreadsheets-smoke-new
python3 plugin-dev-harness/artifact-sandbox-smoke.py \
  --image xpert-pro-sandbox:spreadsheets-test --output /tmp/spreadsheets-service-new \
  --plugins spreadsheets presentations documents pdf
```

The fixture verifies real multi-sheet formulas and cached results, hidden sheets,
number formats, native charts/tables, chart-cache refresh, source hashes, unchanged
package parts, rejected stale edits, fresh outputs and Chinese PDF text. Review
every final page PNG separately. The Docker harness uses the normal HTTP shell
service as a non-root user with external networking disabled.

Browser acceptance must select the published plugin and generate XLSX through
an actual Agent conversation, edit a cell in Files, save it, then ask the Agent
to inspect the saved value without supplying it in the prompt and produce an
edited copy. Download the UI output and independently verify formulas, caches,
charts, tables, hidden sheets and unchanged package parts. An API-only test is
not a replacement. Keep account, conversation and workspace IDs in private receipts.
