# OpenCut Editor API / MCP compatibility decision

> Evidence date: 2026-07-16
>
> OpenCut repository: `OpenCut-app/OpenCut`
>
> Observed `main`: `bab8af831b354a0b5a98a4a6e818ab7d633b94df`
>
> Cut source baseline: OpenCut `pre-rewrite` tag `238750c0250650f1254cf7a4738f8e8c8a0c268c`

## Decision

Cut exposes host-native MCP Publication capabilities, but does **not** claim or implement an OpenCut Editor API adapter yet.

This is a contract decision, not a scheduling shortcut. At the observed OpenCut `main` commit:

- the upstream README says the product is being rewritten from the ground up;
- Editor API, third-party plugins, MCP server, Headless mode and scripting are all listed under “What’s coming”;
- the tracked rewrite tree contains initial `apps/web`, `apps/api` and `apps/desktop` shells, but no published Editor API package, MCP implementation, headless renderer contract or versioned project interchange schema;
- the README points users to `opencut-classic` for the usable editor;
- the latest GitHub release is `v0.3.0` from 2026-04-15, predating the observed rewrite merge on `main`.

The pinned Classic code is useful source architecture, but it is not a stable external interchange contract. Its project state is an internal browser persistence model with an IndexedDB adapter and a long migration chain. Cut therefore must not serialize against those internal types and call that compatibility.

The stable boundary remains `CutProjectDocument` schema version 1. Xpert persistence, Agent tools, proposals, Workbench actions, browser export, Sandbox rendering and the MCP surface all use this IR and the same deterministic edit engine.

## Delivered MCP surface

The Cut plugin registers a native toolset provider. Xpert discovers the original Cut middleware implementation and classifies its 50 capabilities as mutation/query Tools, seven ID-addressed Resource Templates, durable transcription/export Tasks, and four workflow Prompts. Agent and MCP execution therefore share project persistence, revision compare-and-swap, proposal review, action logs, caption jobs, and render jobs.

The public MCP service belongs to the authenticated tenant or organization, not to an Xpert workspace. Every project operation requires an explicit Cut `projectId`. File-reading operations accept only a portable `platform.workspace.files` reference with a catalog and scope; the host rejects tenant, organization, or user scope conflicts before reading bytes. Xpert remains responsible for publication selection, API keys/OAuth, approvals, audit, limits, and Streamable HTTP transport.

There is no plugin-owned stdio process, `cut_ir_*` compatibility surface, MCP-only project model, or alternative edit implementation. Cut Workbench remains the persistent editing UI rather than being duplicated as an MCP App iframe.

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
