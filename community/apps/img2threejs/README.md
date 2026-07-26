# Image to Three.js Agentic App

`@xpert-ai/plugin-img2threejs` is a system-level Xpert Agentic App that converts admitted reference-image evidence into versioned, procedural Three.js model factories written in TypeScript.

## Durable loop

1. Create a scoped object or character project.
2. Admit one to twelve Workspace Files images using deterministic MIME, size, dimension, and SHA-256 evidence.
3. Let Agent chat inspect the admitted image pixels and author an immutable Sculpt Spec containing hierarchy, materials, details, pivots, sockets, colliders, animation clips, and a quality contract.
4. Run only deterministic build, validation, render, and review work for `blockout`, `structural-pass`, `form-refinement`, `material-pass`, `surface-pass`, `lighting-pass`, `interaction-pass`, and `optimization-pass` through Managed Queue.
5. Generate a pass-gated Three.js TypeScript factory and deterministic comparison SVG.
6. Persist deterministic review, visual evidence status, confidence, failure codes, revisions, and human review.
7. Choose exactly `continue`, `refine-spec`, `refine-code`, `request-input`, or `stop`.

Every entity and query is tenant/organization scoped. Mutations use revision compare-and-swap.

## Platform capability boundary

The plugin targets `@xpert-ai/plugin-sdk` and `@xpert-ai/contracts` 3.15.18. It uses the official Managed Queue, Workspace Files, Artifacts, Sandbox Jobs, and artifact-namespace contracts. Managed Queue never performs multimodal semantic analysis: middleware tools let Agent chat discover projects, resolve each admitted image through an official preview or scoped Workspace File reference, submit the exact Sculpt Spec, and receive persisted gate feedback.

Generated TypeScript packages and comparison evidence are published through the platform Artifacts capability when it is registered. Admitted reference images also receive short-lived, freshly issued Artifact preview links whenever a project is opened; tokens are never persisted. Workspace Files remain the deterministic fallback when Artifacts is unavailable.

The plugin declares the versioned `img2threejs.review-render` Sandbox Action Bundle and invokes it only through the platform Sandbox Job API. When a compatible browser runtime is configured, the Action produces PNG comparison evidence with real Chromium; otherwise the typed capability adapter reports the renderer unavailable and retains deterministic projection evidence.

The review Workbench renders the validated Sculpt Spec as a live Three.js WebGL scene. Reviewers can orbit, zoom, pan, reset the camera, toggle auto-rotation, and play declared pivot animation clips; persisted PNG comparison evidence remains available as a separate disclosure.

## Studio workflow

The Workbench uses a three-step Studio flow:

1. Select **New project**, choose the explicit object or character route and modeling mode, name the project, and create it. `semantic-3d` is the default; `relief` is a separate 2.5D mode.
2. Choose the declared camera view for the next batch, then click or drag PNG, JPEG, or WebP references into the upload area. Uploaded references are written to Workspace Files and admitted by the same deterministic evidence checks used by Agent tools.
3. For `semantic-3d`, select **Generate from references**. Studio sends a compact
   trusted project context to the current Agent; detailed modeling instructions
   stay in the installed Skill. The Agent reads the admitted image pixels,
   decomposes observed parts and material zones, then submits and validates the
   Sculpt Spec. It enqueues `blockout` once, after which Managed Queue chains all
   eight deterministic stages and the Agent uses the bounded wait tool for
   progress. The center canvas stays empty until a valid semantic spec exists.

The explicit `relief` mode retains the deterministic TypeScript pixel pipeline: color and luminance become a vertex-colored heightfield. Semantic mode rejects heightfields and enforces explicit component/material-count contracts, preventing a single 2.5D surface from being presented as a full object.

Semantic hard-surface specs can use strictly typed rounded boxes, partial torus arcs, and extruded 2D silhouettes. Physical materials support clearcoat, emissive zones, and ordered world-height color ramps. These typed features are emitted in both the generated TypeScript package and the Workbench viewer, while pivots become executable factory controls rather than metadata-only annotations.

The bottom review drawer exposes deterministic and visual status, comparison evidence, bounded approval decisions, retry, and cancellation. **Export model** publishes the generated TypeScript package through Artifacts when that runtime is available.

## Development

```sh
corepack pnpm --dir community install --lockfile=false
corepack pnpm --dir community --filter @xpert-ai/plugin-img2threejs build
corepack pnpm --dir community --filter @xpert-ai/plugin-img2threejs test
```

The generated remote Workbench assets are checked for freshness by `remote:check`.

The full test command also runs a real TypeORM `sql.js` integration flow through
the Agent middleware discovery/evidence tools, Managed Queue adapter, scoped repositories, CAS
revisions, and Workspace Files. The Workbench browser test loads the generated
`app.js` and `app.css` in the repository-level mock View Host and verifies the
Agent-chat handoff, persisted image restoration, and authoritative host state.

To retain repeatable visual evidence at a chosen path:

```sh
WORKBENCH_E2E_SCREENSHOT=/tmp/img2threejs-workbench.png \
  corepack pnpm --dir community --filter @xpert-ai/plugin-img2threejs test:workbench:mock
```
