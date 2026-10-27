# DOCX Editor

Xpert plugin for browser-based `.docx` editing, AI-assisted review, comments, tracked changes, versioning, and Workbench review.

This plugin wraps the upstream Apache-2.0 `@eigenpal/docx-editor` packages and exposes the experience as a Xpert system plugin with:

- A React remote component Workbench built with the shared shadcn UI primitives.
- Agent middleware tools for DOCX reading, comments, tracked changes, formatting, and navigation.
- Tenant-scoped persistence for documents, versions, snapshots, and operations.
- Read-only public links that preserve semantic headings, lists, tables, inline formatting, and embedded images.
- An installable Assistant template and plugin-scoped skill.

## Current Workbench document context

The Workbench does not expose a separate "get current document" Agent middleware tool. Instead, the remote component sends the active document metadata to the Assistant runtime through the declared `assistant.context.set` client command.

The context payload uses the fixed key `docxEditor`, includes `env.docxEditorDocumentId` and `env.docxEditorMode`, and provides lightweight `context.currentDocument` metadata such as title, file name, version, workspace file path, dirty state, mode, selection, and page state when available. When no document is selected or the Workbench unloads, it clears the same key.

`DocxEditorMiddleware` reads this runtime context before model and tool calls. The model prompt receives the current document metadata, and `docx_*` tools may omit `documentId` when they target the current Workbench document. Explicit `documentId` arguments still take precedence. Full document text, comments, tracked changes, pages, and selection details should continue to be fetched with `docx_read_document`, `docx_find_text`, `docx_read_comments`, `docx_read_changes`, `docx_read_page`, `docx_read_pages`, or `docx_read_selection`.

## Agent-created documents and public links

An Agent-created `.docx` no longer needs to be uploaded or opened manually before it can be shared. The Agent writes the native file into its runtime workspace and calls `docx_import_workspace_file`. That call creates an official DOCX Editor document/version, returns its `documentId` and `versionId`, and causes an open Workbench to load the imported document.

The Agent can then pass the returned `documentId` to `docx_publish_artifact_link`. Fixed-version links render the exact saved DOCX version used by the Workbench, so headings, lists, tables, inline formatting, and embedded images do not diverge between the editor and the public page.

## Validation

### Upgrade legacy PostgreSQL references

Before starting a version whose DOCX `projectId` / `documentId` fields use `uuid`,
run `migrations/20261012-uuid-references.sql` against the deployment database,
then run the platform's schema synchronization. Keep API startup in
`DB_SCHEMA_SYNC_MODE=external` until the migration and schema synchronization pass.
The SQL file is included in the distributed plugin package; plugin installation
does **not** automatically execute this migration.

```sh
psql -X --set ON_ERROR_STOP=1 --file migrations/20261012-uuid-references.sql
```

Use the deployment's normal PostgreSQL connection mechanism. Tables are resolved
in `current_schema()` (normally `public`). Take a database backup first and run
during a maintenance window: the migration locks the four DOCX tables. It converts
values in place with `USING column::uuid`, preserving document content, versions,
snapshots, operations, indexes, nullability and foreign keys. It is atomic and
safe to repeat, including after a partial prior upgrade. Invalid UUIDs, unsupported
types or inbound foreign keys owned by another plugin abort without changing data;
resolve those explicitly rather than deleting records or replacing references.

Run the real PostgreSQL regression tests with `XPERT_SCHEMA_TEST_DATABASE_URL`
injected by your local secret manager:

```sh
corepack pnpm test:migration
```

The tests create and remove only uniquely named fixture schemas.

### Build and lifecycle

```bash
pnpm -C xpertai/apps/docx-editor test
pnpm -C xpertai/apps/docx-editor build
pnpm -C plugin-dev-harness build
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/docx-editor --plugin @xpert-ai/plugin-docx-editor --verbose
```


### Personal App installation / 个人安装

The App declares `scope: ['organization', 'personal']`. On an upgraded Xpert host, an active organization member can enable a private instance through **Only me**; organization installation remains available to administrators. Plugin code is still deployed at its original native level. Explicit Project/Assistant sharing retains its existing authorization rules.

应用支持在当前组织内为自己安装独立实例，也保留管理员的组织安装入口。个人安装不会复制或共享其他用户的授权凭据。升级宿主后再启用数组形式的 scope，旧宿主不保证支持此声明。

For development against the unreleased host change, build its public contracts/SDK, then bind this plugin without changing registry lockfiles (run from the xpert-plugins root):

```sh
node scripts/use-platform-packages.mjs /path/to/xpert xpertai/apps/docx-editor
```

Build and run `plugin-dev-harness` against that same host version. Registry dependency versions must be updated to the released contracts/SDK containing this capability before publishing the plugin. To restore the registry development dependencies, run `corepack pnpm install --force` in `xpertai`.

When validating against a linked host SDK on Node 24, the existing test runner needs its ESM compatibility settings. From this plugin directory, run the Node tests with `TS_NODE_TRANSPILE_ONLY=true node --loader ts-node/esm --test src/lib/docx-editor.templates.spec.ts src/lib/docx-editor-artifact-sharing.spec.ts src/lib/docx-editor-artifact-viewer.service.spec.ts src/lib/docx-editor-runtime-import.spec.ts`, then run Jest with `NODE_OPTIONS=--no-experimental-strip-types TS_NODE_PROJECT=tsconfig.jest.json node node_modules/jest/bin/jest.js --config jest.config.ts --runInBand --transformIgnorePatterns='node_modules/(?!.*(?:lodash-es|chatkit-types))'`. Keep the separate TypeScript check: `node node_modules/typescript/bin/tsc -p tsconfig.spec.json --noEmit`. Dependency installation can replace local links; rerun the binding script before validating the current host.
