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

- This tool resolves plugin packages from the selected `--workspace` using `createRequire(<workspace>/package.json)`.
- This tool loads Nest runtime (`@nestjs/core`) from the selected `--workspace` to avoid duplicate Nest containers.
- This tool provides global `TypeORM` (`DataSource` / `EntityManager`) and `CACHE_MANAGER` mocks so plugins using `TypeOrmModule.forFeature(...)` can boot without a full app infrastructure.
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
