# Reference-fidelity gates

## Contents

1. Observation protocol
2. Fixed reference camera
3. Feature review targets
4. Deterministic review
5. Failure routing

## Observation protocol

Inspect every admitted image bottom-up before writing geometry:

1. Identify the subject and choose `object` or `character`; record uncertainty separately.
2. Describe the bounding volume, symmetry, silhouette, and proportions in 3D object space.
3. Decompose macro assemblies, meso sub-parts, and micro feature groups into a parent-local hierarchy.
4. Record how parts attach: contact type, overlap, socket, and visible gaps.
5. Separate material albedo from baked highlights and shadows; describe metalness, roughness, clearcoat, opacity, normal relief, and emission only when visible.
6. Inventory identity-defining marks and map every item to a component, material zone, or bounded feature-review region.
7. Mark occluded, hidden, or ambiguous regions. Choose `request-input` when the missing view prevents a defensible volumetric or camera contract.

Never infer semantics from filenames, hashes, dimensions, or prior generic renders.

## Fixed reference camera

Choose one admitted evidence item whose declared view is a supported review view. Author:

- its evidence ID and view;
- `perspective` or `orthographic`;
- object-space position, target, and up vector;
- FOV or orthographic height;
- expected subject fill ratio and tolerance;
- confidence.

Include the same view in `qualityContract.requiredViews`. Use confidence below `0.5` only as a signal to request more input; strict validation rejects it.

Solve framing before local detail. A render from an unmatched camera is not valid comparison evidence.

## Feature review targets

Create one to forty bounded targets. Each target must cite admitted evidence, existing component IDs, a supported view, and a normalized region `{x,y,width,height}` fully inside the image.

Use:

- `silhouette` for outer contour or a large part boundary;
- `edge` for emblems, facial placement, seams, openings, and linework;
- `color` for distinctive material zones and patterns;
- `luminance` for light/dark structure when hue is unreliable.

Mark identity-defining targets `critical`; mark supporting targets `important`. Set thresholds according to evidence quality rather than optimism. At least one critical silhouette target should cover the principal form.

## Deterministic review

The Sandbox Action renders the exact fixed camera and at least one meaningful orbit view. It records:

- reference-mask confidence;
- silhouette IoU and scale score;
- edge and perceptual scores;
- each feature target's score and threshold;
- silhouette retention across views;
- world-bounds minimum-to-maximum axis ratio;
- triangle and draw-call budgets.

Do not approve when a critical target fails. Do not treat a flat plane, missing depth, or collapsed orbit silhouette as valid 3D even if the fixed view resembles the source.

The Agent may add semantic visual notes after deterministic gates pass. It must not override a failed hard gate.

## Failure routing

Use exactly one next decision:

- `request-input`: missing matching view, low reference-mask confidence, repeated defect, plateau, or correction hard ceiling;
- `refine-spec`: fixed-camera alignment or scale contract is wrong, evidence routing is wrong, or an observed component/detail is missing from the Spec;
- `refine-code`: the Spec is sound but generated geometry, material, critical feature, budget, or multi-angle volume fails;
- `continue`: all current gates pass and more ordered stages remain;
- `stop`: terminal human-approved result or explicit termination.

Never retry unchanged code against the same evidence.
