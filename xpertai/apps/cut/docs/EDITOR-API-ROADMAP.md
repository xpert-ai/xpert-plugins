# OpenCut Editor API / MCP compatibility decision

> Evidence date: 2026-07-16
>
> OpenCut repository: `OpenCut-app/OpenCut`
>
> Observed `main`: `bab8af831b354a0b5a98a4a6e818ab7d633b94df`
>
> Cut source baseline: OpenCut `pre-rewrite` tag `238750c0250650f1254cf7a4738f8e8c8a0c268c`

## Decision

Cut ships a portable, plugin-managed **Cut IR MCP server** in M8, but does **not** claim or implement an OpenCut Editor API adapter yet.

This is a contract decision, not a scheduling shortcut. At the observed OpenCut `main` commit:

- the upstream README says the product is being rewritten from the ground up;
- Editor API, third-party plugins, MCP server, Headless mode and scripting are all listed under “What’s coming”;
- the tracked rewrite tree contains initial `apps/web`, `apps/api` and `apps/desktop` shells, but no published Editor API package, MCP implementation, headless renderer contract or versioned project interchange schema;
- the README points users to `opencut-classic` for the usable editor;
- the latest GitHub release is `v0.3.0` from 2026-04-15, predating the observed rewrite merge on `main`.

The pinned Classic code is useful source architecture, but it is not a stable external interchange contract. Its project state is an internal browser persistence model with an IndexedDB adapter and a long migration chain. Cut therefore must not serialize against those internal types and call that compatibility.

The stable boundary remains `CutProjectDocument` schema version 1. Xpert persistence, Agent tools, proposals, Workbench actions, browser export, Sandbox rendering and the MCP surface all use this IR and the same deterministic edit engine.

## M8 delivered MCP surface

The package registers `cut-ir`, a platform-managed stdio MCP server launched from `${PLUGIN_ROOT}/dist/mcp-server.js`. It exposes exactly four tools:

| Tool | Purpose | External side effects |
| --- | --- | --- |
| `cut_ir_create_project` | Create a standalone Cut IR v1 document | None |
| `cut_ir_validate_project` | Validate and canonicalize a caller-supplied document | None |
| `cut_ir_apply_operations` | Atomically apply 1–100 shared edit operations in memory and return a new document plus diff | None |
| `cut_ir_compare_projects` | Compare two documents and return changed clip/track IDs and summaries | None |

The MCP server deliberately has no database, tenant API, filesystem, Workspace Files or network client. It cannot discover or mutate a persisted Xpert project. The caller must explicitly supply a document. In Xpert workflows, persisted mutations continue to use the native Cut middleware tools with tenant/org scope, `baseRevision`, compare-and-swap, action logs and proposal review.

MCP inputs are capped at 2 MiB UTF-8 JSON, 2,000 clips and 100 operations per batch. The manifest uses `${PLUGIN_ROOT}`, a platform-controlled local-process runtime, bounded startup/idle/lifetime values and an explicit enabled-tool allowlist. Production remains fail-closed unless the platform administrator enables the managed stdio runtime with `XPERT_MCP_STDIO_RUNTIME_ENABLED=true`.

Cut does not add an MCP App iframe in M8. The persistent editing surface is already the Cut Workbench remote view; duplicating the editor as an inline tool-result app would create a second UI lifecycle and weaken dirty-state/revision handling.

## Why the MCP layer is safe and thin

```text
External MCP client
  -> bounded caller-supplied Cut IR
  -> shared Zod schema
  -> shared deterministic applyCutEdit engine
  -> new Cut IR + structured diff

Xpert persisted workflow
  -> scoped native Cut tools
  -> revision CAS / proposal review / action log
  -> persisted Cut IR
```

There is no MCP-only project model and no alternative edit implementation. Random identifiers produced by split/duplicate/add-without-ID mean mutation results are not advertised as idempotent; validation and comparison tools are read-only and idempotent.

## OpenCut adapter activation gates

An OpenCut adapter may be added only after upstream supplies a stable, testable contract. All of the following are required:

1. Pin a released package or immutable API commit and record license, version and compatibility range.
2. Identify a documented Editor API or versioned import/export schema; internal React stores, IndexedDB rows and Rust implementation types do not qualify.
3. Prove lossless bidirectional fixture mappings for canvas settings, tracks, clips, trim/source spans, media references, text, transforms, audio, effects, masks, transitions and operation results.
4. Define unsupported-field behavior explicitly. Never silently discard a Cut field or an OpenCut field.
5. Keep tenant/org authorization, Workspace Files resolution, proposals and persistence outside the adapter. Upstream receives only sanitized project/media input.
6. Run schema round-trip, operation equivalence, browser preview and export fixtures against the pinned upstream version.
7. Run the full Cut Workbench gate suite. Existing schema version 1 projects must remain readable without eager migration.
8. Add Headless delegation only when upstream publishes a supported non-interactive renderer that can run inside Xpert Sandbox Jobs with structured input, fixed runtime identity, bounded resources and validated outputs.

Until every gate is met, OpenCut rewrite remains a monitored upstream and the adapter status is `deferred-upstream-contract`. Cut’s own browser and Sandbox renderers remain the production paths.

## Re-verification procedure

For every proposed adapter update:

1. Record `git ls-remote --symref https://github.com/OpenCut-app/OpenCut.git HEAD`.
2. Inspect the exact commit tree and released packages, not search-result snippets or roadmap wording.
3. Search the pinned source for Editor API, MCP, Headless and project interchange implementations.
4. Update the evidence block above and add immutable fixture provenance.
5. Do not change runtime behavior when the only upstream change is a roadmap announcement.
