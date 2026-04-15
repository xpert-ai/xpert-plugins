# XpertAI Plugin: File Memory Middleware

`@xpert-ai/plugin-file-memory` is a sandbox-only durable memory middleware for XpertAI agents.

It stores memories as Markdown files, injects lightweight memory context during runtime, exposes explicit read/write tools, and performs optional asynchronous writeback after the agent finishes.

For a Chinese implementation guide, see [README_zh.md](./README_zh.md).

## Current Runtime Model

- The middleware requires the Xpert `sandbox` feature.
- There is no host-path fallback and no path-related user config.
- The memory root is always the current workspace dir under `./.xpert/memory`.
- The plugin isolates memories by `xpertId`.
- The old `users/<userId>` directory layer is removed.
- Private memories are stored under `private/` and filtered by frontmatter `ownerUserId`.

## What Users Configure

There are no `enabled` flags anymore.

- Recall is part of the middleware runtime.
- Explicit `write_memory` is always available when the middleware is mounted.
- Automatic writeback becomes active when `writeback.model` is configured.

## Config Schema

The public config schema has two optional top-level blocks:

- `recall`
- `writeback`

### Recall

| Field | Type | Default | Usage |
| --- | --- | --- | --- |
| `recall.mode` | `hybrid_async \| legacy_blocking` | `hybrid_async` | Controls whether detailed recall is prefetched asynchronously or blocks the current model call. Keep `hybrid_async` unless you explicitly want the reply to wait for detail recall. |
| `recall.model` | `ICopilotModel` | none | Optional selector model for choosing the most useful memories from scanned headers. If omitted, recall falls back to local ranking. |
| `recall.timeoutMs` | `number` | `1500` | Wait budget for the detached selector path. Increase for better selection quality; decrease for lower latency. |
| `recall.maxSelected` | `number` | `5` | Maximum number of full memory bodies surfaced in one turn. Keep this small to control context size. |
| `recall.prompt` | `string` | built-in prompt | Optional override for selector policy. Use only when you intentionally want custom recall behavior. |

### Writeback

| Field | Type | Default | Usage |
| --- | --- | --- | --- |
| `writeback.waitPolicy` | `never_wait \| soft_drain` | `never_wait` | Whether `afterAgent` should briefly wait for the background writeback queue. `never_wait` is the normal interactive default. |
| `writeback.model` | `ICopilotModel` | none | Enables automatic writeback. Without this field, background writeback is skipped. |
| `writeback.qaPrompt` | `string` | built-in prompt | Optional override for non-user memories such as `feedback`, `project`, and `reference`. |
| `writeback.profilePrompt` | `string` | built-in prompt | Optional override for `user` profile/preference writeback decisions. |

## Tools

The middleware provides two tools:

- `search_recall_memories`
  Reads durable memory by `query`, exact `memoryId`, or exact `relativePath`.
- `write_memory`
  Creates or updates a durable memory file.

`search_recall_memories` and runtime digest results now return layer-aware `relativePath` values:

- `private/<semanticDir>/<filename>.md`
- `shared/<semanticDir>/<filename>.md`

This removes ambiguity between private and shared files with the same semantic path.

## How Files Are Written

All writes eventually go through the same service path:

1. Resolve scope from the current `xpertId`.
2. Resolve target layer from `audience`.
3. Resolve `semanticKind` and its directory name.
4. Reuse the existing file path when updating by `memoryId`; otherwise create a new filename as `<slug(title)>-<memoryId>.md`.
5. Serialize frontmatter + Markdown body.
6. Write the file through sandbox upload APIs.
7. Rebuild the layer-level `MEMORY.md`.

There are two write entry points:

- explicit `write_memory`
- background `FileMemoryWritebackRunner`

## How File Locations Are Decided

The path decision is now fully internal to the plugin and independent of host-side path configuration.

### Root

The memory root is fixed to:

```text
./.xpert/memory
```

This path is interpreted inside the current workspace dir, so the effective physical location is:

```text
<workspace dir>/.xpert/memory
```

The workspace dir comes from the Xpert runtime:

- project runs use the shared project root
- non-project runs use the shared user root

The middleware does not create a default thread-specific subdirectory. If you need special per-thread isolation in prompts, use `sys.thread_id` to derive your own path logic.

### Scope

The plugin keeps xpert isolation:

```text
xperts/<xpertId>
```

This remains necessary because one workspace dir can still be shared by multiple xperts in project-style scenarios.

### Layer

Each xpert has two layers:

- `private`
- `shared`

The full layer roots are:

```text
./.xpert/memory/xperts/<xpertId>/private
./.xpert/memory/xperts/<xpertId>/shared
```

### Semantic Directory

Within each layer, files are grouped by semantic directory:

- `user`
- `feedback`
- `project`
- `reference`

Legacy kinds still map into the semantic model:

- `profile -> user`
- `qa -> reference` by default, unless a more specific semantic kind is resolved

### Filename

New files use:

```text
<slug(title)>-<memoryId>.md
```

Updates reuse the original file path instead of renaming the file.

## Final Storage Layout

Typical memory files now look like:

```text
./.xpert/memory/xperts/<xpertId>/private/<semanticDir>/<slug>-<memoryId>.md
./.xpert/memory/xperts/<xpertId>/shared/<semanticDir>/<slug>-<memoryId>.md
```

Layer indexes live at:

```text
./.xpert/memory/xperts/<xpertId>/private/MEMORY.md
./.xpert/memory/xperts/<xpertId>/shared/MEMORY.md
```

Inside `MEMORY.md`, links stay relative to the current layer root, for example:

- `user/alice-style-123.md`
- `reference/release-dashboard-456.md`

## Private vs Shared Semantics

`shared` memories are visible to all sessions under the current xpert.

`private` memories still preserve per-user behavior, but isolation is no longer represented in the directory tree. Instead:

- files live under the shared `private/` layer directory
- each private file keeps `ownerUserId` in frontmatter
- recall and exact lookup filter private files by the current user

This keeps the on-disk layout simpler while preserving private visibility rules.

## Runtime Recall Flow

### First model call

- read `MEMORY.md` entrypoints from visible layers
- scan headers
- build a lightweight summary digest
- inject only lightweight context

### Later model calls

- detached recall may select full memory bodies in the background
- the next model call consumes the ready detail once
- if model selection is unavailable, recall falls back to local ranking

## Sandbox Storage Layer

The middleware uses an internal `SandboxMemoryStore`.

It reads and writes only through sandbox backend APIs:

- raw file read: `downloadFiles()`
- overwrite/new write: `uploadFiles()`
- markdown enumeration: `globInfo()`
- file mtime lookup: `lsInfo()`

This avoids host-path coupling and keeps all file IO inside the active workspace dir.

## Development

Install dependencies from the `xpertai/` workspace root:

```bash
pnpm install
```

Run focused tests:

```bash
pnpm exec jest --config middlewares/file-memory/jest.config.cjs --runInBand --watchman=false
```

Run a type check:

```bash
pnpm exec tsc -p middlewares/file-memory/tsconfig.json --noEmit
```

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) at the repository root.
