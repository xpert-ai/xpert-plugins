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

### Native Connector migration verification

Run `node plugin-dev-harness/verify-connectors.mjs` from the repository root. It reads the explicit 15-Connector inventory, builds and type-checks the shared authentication library and every Connector, runs their tests, then checks dist-first lifecycle loading and all 16 packed artifacts. It verifies that workspace dependencies become publishable version ranges. The script performs no deployment or third-party account authorization. See [Connector Runtime](../xpertai/packages/connector-runtime/README.md) for the migration matrix, preserved vendor adapters and release order.
