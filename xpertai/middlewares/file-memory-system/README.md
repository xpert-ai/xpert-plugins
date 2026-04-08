# File Memory System Middleware

`@xpert-ai/plugin-file-memory` is a file-backed durable memory runtime for XpertAI agents.

It combines human-readable Markdown storage, runtime recall, explicit read/write tools, and asynchronous writeback into one middleware package. The plugin is designed for teams that want memory files to stay inspectable on disk while still giving the runtime a structured recall and governance layer.

For a detailed Chinese implementation walkthrough, see [README_zh.md](./README_zh.md).

## What This Middleware Does

- Stores durable memories as Markdown files with YAML frontmatter.
- Maintains layer-level `MEMORY.md` entrypoints for human-readable memory indexes.
- Injects a small local summary digest into the first model turn without waiting on a selector model.
- Starts a Claude Code-style async recall flow after the first turn and injects detail on the next model call when ready.
- Exposes explicit tools for exact memory reads and durable memory writes.
- Performs after-agent writeback asynchronously so interactive replies do not wait on memory persistence.
- Preserves governance fields such as scope, audience, status, and semantic kind.

## Runtime UX Model

### First Answer

The first model call stays on the zero-wait path:

- read visible `MEMORY.md` entrypoints
- build a small summary digest from cached headers
- inject only lightweight memory context
- avoid waiting for recall selector or full file bodies

This improves first-token latency for short factual and preference queries.

### Later Turns

After the first answer, the middleware starts an async recall prefetch:

- visible memory headers are scanned
- a background selector model chooses useful memories from the manifest
- full memory bodies are read only when selected
- the next model call consumes the ready recall result once

If the selector is missing, slow, or fails, the middleware falls back to local header ranking instead of blocking the reply.

## Storage Model

Durable memories are saved as Markdown files under scope and layer directories. Each file includes:

- YAML frontmatter with `id`, `scopeType`, `scopeId`, `audience`, `kind`, `semanticKind`, `status`, timestamps, source metadata, and tags
- a human-readable title
- a semantic section heading in Chinese
- optional additional context blocks

The runtime currently supports both legacy memory kinds and the new semantic taxonomy:

- legacy kinds: `profile`, `qa`
- semantic kinds: `user`, `feedback`, `project`, `reference`

New writes keep the semantic kind in frontmatter and use semantic directories on disk, while old files remain readable and searchable.

## Tools

When enabled on an agent, the middleware provides:

- `search_recall_memories`
  Use this for exact detail lookup when summary text is not enough. It supports `query`, `memoryId`, or `relativePath`.
- `write_memory`
  Use this to create or update durable memory files explicitly.

The middleware prompt also teaches the model to:

- answer directly from digest summaries when they are already sufficient
- avoid “confirmation” tool calls for short facts or preferences
- reuse `canonicalRef` or `relativePath` exactly instead of guessing a `memoryId`

## Governance and Scope

The runtime keeps platform governance concepts instead of flattening everything into one memory bucket:

- scope: currently xpert-oriented with workspace-aware physical roots
- layer: private user memory and shared memory
- audience: `user` or `shared`
- status: `active`, `archived`, `frozen`

Archived and frozen memories stay governed by the same file model and are filtered from the hot recall path according to runtime policy.

## Package Structure

Key files in this package:

- `src/index.ts`: plugin entry
- `src/lib/file-memory.module.ts`: Nest module wiring
- `src/lib/file-memory.middleware.ts`: runtime middleware behavior
- `src/lib/file-memory.service.ts`: file read/write, search, recall assembly
- `src/lib/recall-planner.ts`: local ranking and async selector path
- `src/lib/file-memory.writeback-runner.ts`: background writeback queue
- `src/lib/file-memory.writeback.ts`: writeback decision prompt and parser
- `src/lib/memory-taxonomy.ts`: semantic taxonomy and compatibility rules

## Configuration

The middleware exposes two main configuration blocks:

- `recall`
  Controls whether recall is enabled, which selector model is used, timeout budget, and recall mode.
- `writeback`
  Controls whether after-agent writeback runs, which model is used, and whether interactive flows should ever wait.

Important defaults in the current implementation:

- recall mode defaults to `hybrid_async`
- interactive writeback defaults to `never_wait`
- selector budget is treated as a background budget, not foreground blocking time

## Development

Install dependencies from the `xpertai/` workspace root:

```bash
pnpm install
```

Run focused tests for this middleware:

```bash
pnpm exec jest --config middlewares/file-memory-system/jest.config.cjs --runInBand --watchman=false --runTestsByPath \
  middlewares/file-memory-system/src/lib/recall-planner.spec.ts \
  middlewares/file-memory-system/src/lib/file-memory.service.spec.ts \
  middlewares/file-memory-system/src/lib/file-memory.middleware.spec.ts \
  middlewares/file-memory-system/src/lib/file-memory.writeback.spec.ts
```

Build the package:

```bash
pnpm exec nx build @xpert-ai/plugin-file-memory
```

In restricted local environments, the Nx daemon or isolated plugin workers may fail because of IPC/socket limits. In that case, use:

```bash
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec nx build @xpert-ai/plugin-file-memory
```

## CI Notes

The repository release workflow installs dependencies in `xpertai/` with a frozen lockfile, then builds changed publishable packages during the release path. The local verification path used for this migration was:

```bash
pnpm install --frozen-lockfile --config.confirmModulesPurge=false
NX_DAEMON=false NX_ISOLATE_PLUGINS=false pnpm exec nx run-many -t build -p @xpert-ai/plugin-file-memory
```

Artifacts are emitted to `middlewares/file-memory-system/dist`.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) at the repository root.
