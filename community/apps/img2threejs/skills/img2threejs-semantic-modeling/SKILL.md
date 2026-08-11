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
- Call `img2threejs_read_evidence` for every admitted image after all other read-only context tools and immediately before authoring or revising the Spec. The middleware resolves the current authoritative project state internally and keeps those pixels attached for the remainder of the current user turn. Reinspect them at each reasoning step. Spec mutations reject any Spec evidence ID that was not inspected in the current user turn.
- Treat hashes, filenames, dimensions, declared views, file references, old renders, and deterministic observations as intake evidence, not semantic evidence.
- Treat viewer scenes, generated renders, and comparison images only as output diagnostics. Never use them to redefine the uploaded reference subject.
- Choose `request-input` when pixels are unavailable or ambiguous, or when the active model profile does not explicitly declare image inputs. `imageAttachmentAvailable` confirms bytes only; it is not proof that the active model can see them. Never infer scene semantics from metadata alone.

## Resolve the target

1. Use an exact host-provided `projectId`, project route, modeling mode, and admitted evidence list as authoritative. Do not change the project route inside the Spec; when it conflicts with the apparent subject, choose `request-input`.
2. Otherwise call `img2threejs_list_projects`, then create exactly one project with `img2threejs_create_project` only when needed.
3. Default to `semantic-3d`. Use `relief` only when the user explicitly requests a 2.5D heightfield.
4. Admit one to twelve Workspace Files images through `img2threejs_submit_images`; do not invent file paths or asset URLs.
5. Do not manage concurrency versions in Agent calls. Every tool resolves current authoritative project/run state internally; reread status after a genuine conflict or busy response.

## Regenerate or refine

For `regenerate_from_references`, call `img2threejs_get_status`, `img2threejs_read_spec`, and `img2threejs_read_artifact` before inspecting the admitted images. Always save a new immutable Sculpt Spec version; an old completed run, artifact, Spec, generated code, or review response never completes regeneration.

When `visualReview.status` is `changes_requested`, treat its notes as hard constraints. Preserve correct observed semantics while correcting the named hierarchy, local transform, material, framing, or detail defects.

## Author the Sculpt Spec

For every `semantic-3d` project, read [references/fidelity-gates.md](references/fidelity-gates.md) before writing or refining the Spec. Apply its observation order, fixed-camera contract, feature-region contract, and failure routing.

Write a complete Spec with `img2threejs_update_spec`, then pass
`img2threejs_validate_spec`. A successfully persisted `update_spec` consumes its
evidence inspection. A schema/tool error that persists nothing does not consume
it. When a prior model message already contains the same checksum-verified image,
the middleware may re-resolve that immutable evidence against current project state and
renew the inspection only when SHA-256 is unchanged. Before a retry after an
invalid Spec was persisted, call `img2threejs_read_evidence` again for every
admitted evidence ID. When `update_spec` returns
`validationStatus=invalid`, correct its issues and reinspect the evidence. After the
first response with `validationStatus=valid`, do not call `update_spec` again in
the same turn: validate the current Spec, then author the
executable TypeScript source described below.

For a visual correction to an existing valid semantic blueprint, do not resend
the full Spec. After `read_spec`, visual diagnostics, and `read_evidence`, call
`img2threejs_patch_spec` with the exact current `sourceSpecVersionId`. Use its
bounded fields for the reference camera, silhouette intent, existing component
transforms/geometry/material bindings, and existing material appearance. Set a
component patch `geometry` to `null` when switching to the primitive's default
geometry. This tool clones the immutable current Spec and validates the complete
merged result while preventing quality-threshold changes. If a change requires
new semantic components or a genuinely different blueprint, use one full
`update_spec` instead.

Within one visual-correction iteration, persist at most one successful Spec
mutation. As soon as `patch_spec`, `patch_runtime_contract`, or `update_spec`
returns a valid new version, freeze that Spec for the rest of the iteration:
validate it once, finish the complete TypeScript candidate, inspect and submit
that candidate, then render. Never alternate source-file chunks with repeated
Spec mutations. A stale Spec response means reread current state; it is not a
reason to replay an already-applied patch. If an incomplete Assistant candidate
already exists, keep the current Spec frozen and finish that candidate before
considering another semantic change.

When `read_spec` shows that the current semantic blueprint already covers the
observed major forms and the only required Spec change is raising the human
review runtime-mesh floor, do not resend the full Spec. After `read_evidence`,
call `img2threejs_patch_runtime_contract` with the exact current
`sourceSpecVersionId` and raised `minimumRuntimeMeshCount`. It clones the current
Spec into a new immutable version and changes only the runtime quality contract;
then validate that returned version and spend the remaining model budget on the
Assistant-authored TypeScript.

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

For `semantic-3d`, keep the Spec as a compact, auditable semantic blueprint
with no more than 30 meaningful components (normally 12–30); the backend
rejects larger semantic blueprints. `qualityContract.minimumComponentCount`
is the minimum number of real visible runtime mesh instances, not a demand to
expand the Spec into repetitive JSON. When human review raises this floor, keep
the semantic hierarchy concise and satisfy the floor in Assistant-authored
TypeScript with subject-specific helpers or loops. The browser renderer counts
non-empty visible `Mesh` objects and `InstancedMesh.count` and fails the build
when the runtime total is below the contract.

For `semantic-3d`, never use heightfield geometry. Use typed volumetric geometry that matches the visible form: rounded boxes for beveled hard surfaces, torus arcs for partial rings, and extruded shape points for observed silhouettes such as emblems. Do not relabel fallback primitives as exact typed geometry.

Use physical material fields only when observed, including clearcoat, emissive zones, and ordered Y-axis color ramps. Make every child transform parent-local: position and rotation are relative to `parentId`; scale sizes only the component geometry. Keep attached parts connected and reject unintended floating gaps.

Before writing the Spec, calculate the approximate world bounds by composing
the parent-local transforms. Place `referenceCamera` far enough that the entire
world bounds, including the base and peripheral props, remains inside every
required render with at least 15% framing margin. Never compensate for a
framing defect by shrinking feature regions or lowering a quality threshold.
When Spec validation returns a `correctionHints` entry with code
`reference_camera_frustum_too_small`, copy its
`recommendedReferenceCamera.position` (perspective) or
`recommendedReferenceCamera.orthographicHeight` (orthographic) exactly into the
next bounded patch while preserving its target and FOV. Do not narrow the FOV
or move the camera closer. The hint already applies at least
`(required / available) * 1.10` to the correct quantity. Preflight typed geometry too: each rounded-box dimension must be at
most 20 and its radius at most half its smallest dimension; extrude-shape depth
must be at most 10. Satisfy the complete middleware tool schema before writing.

## Author the executable Three.js source

For every `semantic-3d` Spec, the Assistant must independently write the
complete, subject-specific Three.js TypeScript module. The deterministic
generator is not a semantic substitute and semantic builds are rejected until
an Assistant-authored code version passes. Never copy source from an upstream
repository or translate an upstream Python/TypeScript implementation.

Use this file-first transport for production models:

1. Use the current immutable Spec's canonical working path
   `/workspace/img2threejs-assistant/<projectId>/model-spec-<specVersionId>.ts` with
   `sandbox_write_file`. If `img2threejs_get_status` already reports that exact
   path as `assistantCodeCandidate`, inspect the reported checksum instead of
   rewriting it. Put the exact `file_path` in every file-tool call and
   keep each `content` argument at or below 8,000 characters. A production model
   normally requires several calls: write the first coherent chunk, wait for its
   success, then continue sequentially with `sandbox_append_file`. The first
   successful write makes that path an existing file: never call
   `sandbox_write_file` for that path again during the attempt. Never squeeze
   the whole source into one plugin function argument, even when the model can
   draft it in one response; long function arguments can be truncated before the
   required path or closing JSON is emitted. Workspace writes never overwrite an existing file;
   when another attempt already owns that path, inspect the reported candidate
   first. If deterministic inspection proves it is incomplete, choose a unique
   bounded repair path such as `model-camera-refine-2.ts` instead of retrying
   the same path or overwriting prior work.
2. Optionally call `img2threejs_inspect_code_file` with that path when you need
   a path, byte-size, or checksum diagnostic without echoing the source. Do not
   call it merely to obtain an argument for the next tool.
3. Call `img2threejs_author_code_file` with that exact path. The service reads
   and snapshots the current bytes itself; do not send a checksum or concurrency
   field. For a
   new project use `mode=create`, the exact `specVersionId`, and
   `baseCodeVersionId=null`. When a current code version exists,
   use `mode=refine` and its exact ID.
4. Treat the returned immutable code version and checksum as the only accepted
   source. The plugin copies the current bytes before review, so later edits
   to the working file cannot mutate a persisted version.

A file-tool output containing a non-empty `error` field is a failed operation,
even when the outer tool event says `status: success`. In particular, after an
"already exists" response, do not retry `sandbox_write_file` for that path:
append to it only when it is the current attempt's correctly written prefix;
otherwise select one new unique path. Do not abandon or restart a candidate
merely because of an unverified syntax suspicion—finish its planned chunks and
use `img2threejs_author_code_file` to obtain a deterministic diagnostic.

A `sandbox_write_file` or `sandbox_append_file` schema/error response means only
that the source transport failed; it does not invalidate or roll back the current
valid Spec. Do not call `update_spec`, `patch_spec`, or
`patch_runtime_contract` again in response. Reread authoritative status if state
is uncertain, keep the current valid Spec/version, and retry only the
failed file chunk with the complete file-tool schema and a smaller payload.

Use inline `img2threejs_author_code` only as a compatibility fallback when
Sandbox Files are unavailable and the complete module is under 12,000
characters. It has the same security and deterministic gates.

The module must:

- import only `three`, `three/examples/jsm/*`, or `three/addons/*`;
- export a discoverable `create*Model` factory returning a `THREE.Object3D` or
  `{ root, dispose }`;
- implement the observed geometry, hierarchy, materials, lighting helpers and
  details as executable Three.js code rather than a list of generic boxes;
- include every current Spec component ID in source and attach
  `root.userData.img2threejs` runtime metadata;
- create at least `qualityContract.minimumComponentCount` visible, non-empty
  runtime mesh instances; use authored helpers or loops for repeated observed
details instead of enumerating them as Spec JSON;
- avoid dynamic import/eval/Function/require, external I/O, network APIs,
  workers, browser storage, cookies, and Python.

When review routes to `refine-code`, call `img2threejs_read_code` with the exact
current code version and `includeSource=false`. Use its
`sourceFilePath` with `sandbox_read_file`, preserve correct authored systems,
and write a new unique working file. Apply bounded corrections with
`sandbox_edit_file` or `sandbox_multi_edit_file`, inspect the completed file,
then submit it through `img2threejs_author_code_file` with `mode=refine` and the
exact `baseCodeVersionId`. Do not edit an immutable version in place and do not
regenerate from the generic factory. If authoring fails a deterministic check,
fix only the named defect and resubmit against the current code version.

When `failedChecks` names one missing deterministic source marker and also
reports an exact related identifier already present in the immutable source,
do not load or rewrite the whole large module merely to rename it. If that
identifier already implements the named geometry, call `img2threejs_patch_code`
with the current code id and one exact identifier
replacement with `allOccurrences=true`. This mode accepts only legal TypeScript
identifiers, uses exact token boundaries, and is capped at 500 matches. It is the preferred bounded transport for a diagnostic-only
identifier correction; preserve geometry dimensions and topology, then follow
the returned `nextAction`.

If the source bytes are already correct and only the plugin's deterministic
review policy changed, do not retransmit or rewrite the large source. Call
`img2threejs_revalidate_code` with the exact current code version. This tool may
only re-review the service-verified immutable Assistant source; it cannot edit source bytes or
convert deterministic-generator output into Assistant-authored output.

When Sandbox Files are unavailable, any other small correction may use
`img2threejs_patch_code` after `img2threejs_read_code` with
`includeSource=true`. Supply the exact current code id,
plus one to eight uniquely matching old/new text replacements. The backend
rejects ambiguous matches and still reviews and persists the complete patched
TypeScript module; this is fallback source transport, not element-configuration
JSON.

## Run the gated build

After validation and Assistant code authoring both succeed, execute exactly
these stages in order:

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

At every review boundary, call `img2threejs_read_visual_diagnostics` for the
latest completed run. It returns the exact quality/correction record and attaches
checksum-verified browser comparison and render pixels to a vision-capable
model. Actually inspect those pixels before deciding; never diagnose a camera,
layout, hierarchy, silhouette, material, or attachment defect from scores or
text summaries alone.

Own the correction decision in Agent chat:

- choose `refine-spec` when the visual defect is in semantic decomposition,
  hierarchy, proportions, reference camera, feature targets, or the quality
  contract; re-read every admitted reference with `img2threejs_read_evidence`
  immediately before persisting the new Spec. Prefer `img2threejs_patch_spec`
  for bounded camera, transform, geometry-binding, or material corrections to
  the existing valid blueprint;
- choose `refine-code` when the Spec is semantically correct but its executable
  TypeScript geometry, transforms, materials, authored details, or runtime
  assembly fail to realize it; use the file-first source workflow;
- preserve elements that already match, make one coherent correction, render
  again, and compare the new immutable run rather than accepting a textual
  claim of improvement.

The generated render and comparison are output diagnostics; the admitted
reference pixels remain the authoritative subject. Verify every required view
keeps the subject in frame, preserves recognizable silhouette and proportions,
and has no detached parts. Choose refinement rather than approval when those
checks fail.

Treat the Sandbox deterministic result as authoritative for hard gates. Agent vision may explain a near-threshold appearance result, but it must never override failed reference-camera alignment, critical-feature, geometry-budget, or multi-angle volume gates. When the persisted correction loop reports a repeated defect, plateau, or hard ceiling, choose `request-input` instead of retrying the same change.

Permit exactly:

- `continue`
- `refine-spec`
- `refine-code`
- `request-input`
- `stop`

Use `img2threejs_submit_review` to persist the decision and human review status. Ask for human approval when required by the quality contract. Use `img2threejs_read_artifact` and `img2threejs_export_artifact` only for confirmed artifacts. Use `img2threejs_cancel_run` or `img2threejs_retry_run` narrowly against the identified current run. `retry_run` is only for a status explicitly routed to that transient infrastructure/input-visibility path. When status returns `read_visual_diagnostics_then_refine_code`, inspect the exact failure and author a new refined Workspace Files candidate; never retry the same immutable code for a source build, module-resolution, or syntax failure. Concurrency versions are service-internal and never belong in Agent tool calls.

When `img2threejs_submit_review` returns `alreadyPersisted=true`, stop calling tools and report the persisted next action. Do not repeatedly resubmit the same decision.

If an official browser or Sandbox render action is unavailable, report the capability as unavailable. Keep deterministic projection evidence and Workspace Files packages, but never invent runtime APIs, preview URLs, or successful browser renders.

## Report compactly

On terminal success, report the useful outcome once. Preserve evidence, confidence, versions, failure reasons, and human review in the system, but omit IDs, cursors, paths, and logs unless the user asks for diagnostics.
