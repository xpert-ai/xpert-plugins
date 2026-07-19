# Cut

Cut is an Agentic non-linear video editor for Xpert. It combines a remote React Workbench, scoped project persistence, Workspace Files media, revision-safe Agent timeline operations, reviewable AI captions, in-browser MP4 export, and bounded background MP4 rendering through Managed Queue and Sandbox Jobs.

The first implementation is pinned to OpenCut's `pre-rewrite` tag at commit `238750c0250650f1254cf7a4738f8e8c8a0c268c`. See `assets/upstream/ATTRIBUTION.md`. The plugin deliberately owns a compact versioned IR instead of persisting OpenCut internals so a future OpenCut Editor API/headless adapter can be added without rewriting Xpert persistence.

The MP4 exporter renders H.264 video and, when AAC encoding is available, mixes explicit unmuted audio-track clips into the output. One-off exports run in Workbench; durable background, templated, and multi-aspect exports run through the registered `cut.render-mp4@1.1.5` Sandbox Action with fixed revision snapshots, portable Workspace Files inputs, resource limits, cancellation, retry, and traceable outputs. See [`docs/AI-PRODUCT-ROADMAP.zh-CN.md`](docs/AI-PRODUCT-ROADMAP.zh-CN.md) for the OpenCut AI comparison and staged Agentic product plan, [`docs/EDITOR-API-ROADMAP.md`](docs/EDITOR-API-ROADMAP.md) for the evidence required before adopting a future OpenCut API/headless runtime, [`docs/GATE-VERIFICATION.md`](docs/GATE-VERIFICATION.md) for the executable Workbench gate harness, and [`docs/GOAL-COMPLETION-AUDIT.zh-CN.md`](docs/GOAL-COMPLETION-AUDIT.zh-CN.md) for the completed requirement-by-requirement audit and real-host evidence.

Server transcription runs as a Managed Queue job against the current Xpert's configured Speech-to-Text model. It stores only a portable Workspace Files reference in the queue payload, supports idempotent start/retry/cancellation, and creates a reviewable caption draft rather than writing unreviewed text directly to the timeline. Current shared STT providers return plain text, so generated cue timings are explicitly marked as estimated until a timestamp-capable provider contract is available.

Local Workbench transcription runs Transformers.js/Whisper in an isolated browser Worker. It loads the pinned ONNX Runtime browser files and Whisper Q4 model only after the user starts transcription, reuses browser caches, decodes and resamples media to 16 kHz mono, and does not upload media bytes to the Xpert server. The `sandbox_whisper` mode remains network-disabled: it resolves the exact `Xenova/whisper-tiny:q4` model and ONNX Runtime from the hash-verified `browser/ai-playwright-1.61/v1` Runtime Artifact instead of carrying them in the Cut npm package. Local jobs can be cancelled by terminating the Worker. WebGPU remains disabled until its JSEP runtime has a separate compatibility gate.

Local media intelligence turns project assets into scoped, queryable evidence without changing the timeline. The Workbench computes audio activity/silence intervals and sampled video shot boundaries in the browser, then persists the completed evidence with project revision and content-hash idempotency protection. Agent tools can search transcript, audio, and shot evidence by media/time range and retrieve an exact segment; every result includes a media locator, time range, evidence type, relevance score, and preview URL plus thumbnail time. OCR, visual descriptions, embeddings, and server-side background video analysis remain later extensions.

Evidence-backed edit proposals separate Agent planning from timeline mutation. A proposal is bound to an exact source revision and snapshot; every bounded operation cites validated media-segment evidence and receives a system-enforced risk floor. Workbench users can inspect the diff and read-only timeline preview, enable or disable individual items, reject the proposal, or atomically apply it. Apply/revert use recoverable compare-and-swap state machines: retries are idempotent, stale proposals cannot overwrite the project, and reverting is allowed only before any later edit.

Cut has two deliberately separate tool surfaces:

- **Internal Agent operations use Xpert middleware tools.** Project discovery and persistence, revision-safe timeline edits, captions, media intelligence, proposals, and background exports run with the authenticated Xpert tenant/organization context. Mutations require `baseRevision`, reuse the proposal/review model, and emit targeted host events so the Workbench can refresh safely.
- **MCP is an external interoperability surface.** The optional plugin-managed `cut-ir` server exposes `cut_ir_create_project`, `cut_ir_validate_project`, `cut_ir_apply_operations`, and `cut_ir_compare_projects` only for caller-supplied portable documents. It reuses the same schema and deterministic edit engine but has no database, tenant API, Workspace Files, filesystem, or network access.

The Cut Assistant must not connect to `cut-ir` MCP as a shortcut around middleware authorization, revision CAS, or human review. OpenCut's current rewrite still lists Editor API, MCP, and Headless as future work, so Cut does not advertise a fictional OpenCut adapter; the exact upstream evidence and activation gates are recorded in [`docs/EDITOR-API-ROADMAP.md`](docs/EDITOR-API-ROADMAP.md).

## Local verification

```bash
pnpm --filter @xpert-ai/plugin-cut test
pnpm --filter @xpert-ai/plugin-cut build
pnpm --filter @xpert-ai/plugin-cut prepack
pnpm --filter @xpert-ai/plugin-cut smoke:mcp-server
```

The normal browser gate injects a deterministic Worker double. An opt-in network smoke test exercises the real Whisper model and pinned browser runtime:

```bash
CUT_E2E_REAL_WHISPER=1 pnpm --filter @xpert-ai/plugin-cut test:e2e
```

## npm release

Prepare and validate the immutable release tarball before generating an npm OTP:

```bash
pnpm --filter @xpert-ai/plugin-cut release:prepare
```

The prepared tarball and its SHA-256 manifest are written to the ignored `apps/cut/.release/` directory. Validate the fast publish phase without changing the registry:

```bash
pnpm --filter @xpert-ai/plugin-cut release:publish -- --dry-run
```

Then run the publish command. It verifies the prepared package again before prompting with hidden input; generate or read the fresh npm OTP only when that prompt appears. It does not rebuild the package:

```bash
pnpm --filter @xpert-ai/plugin-cut release:publish
```
