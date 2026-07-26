---
name: img2threejs-semantic-modeling
description: Build or regenerate quality-gated, animation-ready procedural Three.js models from admitted reference images. Use for Img2ThreeJs project creation, reference intake, multimodal semantic analysis, Sculpt Spec authoring or refinement, ordered build stages, deterministic and visual review, artifact export, retry, cancellation, and recovery through the img2threejs middleware tools.
---

# Image to Three.js semantic modeling

Create procedural Three.js factories in TypeScript only. Never add or request a Python runtime.

Treat the middleware tools as the durable system of record. Do not claim that a Spec, stage, review, or artifact exists until the corresponding tool confirms it was persisted.

## Own semantic analysis in Agent chat

- Perform image understanding, part recognition, material interpretation, and other multimodal reasoning in Agent chat.
- Never enqueue semantic image analysis in Managed Queue. Queue only deterministic build, code, render, and review jobs.
- Call `img2threejs_read_evidence` with the exact current `expectedRevision` for every admitted image after all other read-only context tools and immediately before authoring or revising the Spec. The middleware keeps those pixels attached for the remainder of the current user turn. Reinspect them at each reasoning step. `img2threejs_update_spec` rejects any Spec evidence ID that was not inspected at the same `baseRevision` in the current user turn.
- Treat hashes, filenames, dimensions, declared views, file references, old renders, and deterministic observations as intake evidence, not semantic evidence.
- Treat viewer scenes, generated renders, and comparison images only as output diagnostics. Never use them to redefine the uploaded reference subject.
- Choose `request-input` when pixels are unavailable or ambiguous, or when the active model profile does not explicitly declare image inputs. `imageAttachmentAvailable` confirms bytes only; it is not proof that the active model can see them. Never infer scene semantics from metadata alone.

## Resolve the target

1. Use an exact host-provided `projectId`, revision, project route, modeling mode, and admitted evidence list as authoritative. Do not change the project route inside the Spec; when it conflicts with the apparent subject, choose `request-input`.
2. Otherwise call `img2threejs_list_projects`, then create exactly one project with `img2threejs_create_project` only when needed.
3. Default to `semantic-3d`. Use `relief` only when the user explicitly requests a 2.5D heightfield.
4. Admit one to twelve Workspace Files images through `img2threejs_submit_images`; do not invent file paths or asset URLs.
5. Use every mutation's returned revision as the next `baseRevision`. On a revision conflict, reread status and retry from the current revision instead of overwriting.

## Regenerate or refine

For `regenerate_from_references`, call `img2threejs_get_status`, `img2threejs_read_spec`, and `img2threejs_read_artifact` before inspecting the admitted images. Always save a new immutable Sculpt Spec version; an old completed run, artifact, Spec, generated code, or review response never completes regeneration.

When `visualReview.status` is `changes_requested`, treat its notes as hard constraints. Preserve correct observed semantics while correcting the named hierarchy, local transform, material, framing, or detail defects.

## Author the Sculpt Spec

For every `semantic-3d` project, read [references/fidelity-gates.md](references/fidelity-gates.md) before writing or refining the Spec. Apply its observation order, fixed-camera contract, feature-region contract, and failure routing.

Write a complete Spec with `img2threejs_update_spec`, then pass `img2threejs_validate_spec`.

Include:

- an explicit `object` or `character` route and matching modeling mode;
- admitted evidence IDs and confidence-bearing proportions;
- a component hierarchy of observed volumetric parts;
- materials and material zones;
- a prioritized detail inventory with acceptance criteria;
- one evidence-backed `referenceCamera` that reproduces the admitted image viewpoint;
- bounded `featureReviewTargets` for identity-defining regions, with at least one critical silhouette target;
- runtime pivots, sockets, colliders, and animation clips;
- a strict quality contract with silhouette IoU, scale, edge, perceptual, reference-mask, multi-angle, volume, correction-loop, budget, and eight-stage thresholds.

For `semantic-3d`, never use heightfield geometry. Use typed volumetric geometry that matches the visible form: rounded boxes for beveled hard surfaces, torus arcs for partial rings, and extruded shape points for observed silhouettes such as emblems. Do not relabel fallback primitives as exact typed geometry.

Use physical material fields only when observed, including clearcoat, emissive zones, and ordered Y-axis color ramps. Make every child transform parent-local: position and rotation are relative to `parentId`; scale sizes only the component geometry. Keep attached parts connected and reject unintended floating gaps.

## Run the gated build

After validation succeeds, execute exactly these stages in order:

1. `blockout`
2. `structural-pass`
3. `form-refinement`
4. `material-pass`
5. `surface-pass`
6. `lighting-pass`
7. `interaction-pass`
8. `optimization-pass`

Call `img2threejs_enqueue_stage` once for `blockout`. The Managed Queue then
chains the remaining deterministic stages in the exact order above; do not
enqueue them individually. Immediately call `img2threejs_wait_run` with the
exact returned project ID and cursor. While `terminal=false`, call
`img2threejs_wait_run` again with the newly returned cursor, including when
`changed=false`. Continue only after the tool reports the complete chain
terminal and all eight stages passed.

Use `img2threejs_get_status` only for recovery after interruption or a later
user message. Never skip a stage, manually race the queue chain, or infer a
pass.

## Review and decide

At every review boundary, read the persisted artifact and comparison evidence before deciding. Verify every required view keeps the subject in frame, preserves recognizable silhouette and proportions, and has no detached parts. Choose refinement rather than approval when those checks fail.

Treat the Sandbox deterministic result as authoritative for hard gates. Agent vision may explain a near-threshold appearance result, but it must never override failed reference-camera alignment, critical-feature, geometry-budget, or multi-angle volume gates. When the persisted correction loop reports a repeated defect, plateau, or hard ceiling, choose `request-input` instead of retrying the same change.

Permit exactly:

- `continue`
- `refine-spec`
- `refine-code`
- `request-input`
- `stop`

Use `img2threejs_submit_review` to persist the decision and human review status. Ask for human approval when required by the quality contract. Use `img2threejs_read_artifact` and `img2threejs_export_artifact` only for confirmed artifacts. Use `img2threejs_cancel_run` or `img2threejs_retry_run` narrowly against the identified run.

When `img2threejs_submit_review` returns `alreadyPersisted=true`, stop calling tools and report the persisted next action. Do not repeatedly resubmit the same decision.

If an official browser or Sandbox render action is unavailable, report the capability as unavailable. Keep deterministic projection evidence and Workspace Files packages, but never invent runtime APIs, preview URLs, or successful browser renders.

## Report compactly

On terminal success, report the useful outcome once. Preserve evidence, confidence, versions, failure reasons, and human review in the system, but omit IDs, cursors, paths, and logs unless the user asks for diagnostics.
