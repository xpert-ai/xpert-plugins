# Share Dialog Design QA

- Source visual truth: `/var/folders/zr/dr3n4hcx5h1fr9c63_gncck40000gn/T/codex-clipboard-77547630-81c7-4339-b8fa-1714edb07e62.png`
- Existing product evidence: `/var/folders/zr/dr3n4hcx5h1fr9c63_gncck40000gn/T/codex-clipboard-eb32f8de-6d09-4f17-9bae-6bf22862dbac.png`
- Intended viewport: desktop Workbench, responsive down to 620 px
- Intended state: Share Dialog open for an existing Excalidraw drawing
- Implementation screenshot: unavailable because the running local platform still serves the previously installed plugin runtime rather than the rebuilt source package

## Full-view comparison evidence

The source uses a compact floating share surface with a clear title, latest-version setting, current-version status, access selector, and one dominant copy action. The implementation follows the same hierarchy in a centered Xpert Dialog and moves JSON, PNG, and SVG exports into a separate lower section.

## Focused-region comparison evidence

A post-build browser capture could not be produced without reinstalling the rebuilt plugin into the running platform. The currently rendered Workbench still shows the old share dropdown and standalone export buttons, so it is not valid post-fix evidence.

## Findings

- [P1] Post-build visual state is not loaded in the running platform.
  - Location: Excalidraw Workbench toolbar and Share Dialog.
  - Evidence: the browser still renders the previous share dropdown and standalone JSON/PNG/SVG buttons.
  - Impact: spacing, typography, responsive behavior, and interaction fidelity of the new Dialog cannot be visually certified yet.
  - Fix: reinstall the rebuilt `@xpert-ai/plugin-excalidraw` source package, restart the backend, reload the Workbench, and capture the open Dialog.

## Required fidelity surfaces

- Fonts and typography: implemented with existing Xpert design-system typography; post-install visual verification pending.
- Spacing and layout rhythm: implemented as a 600 px Dialog with 22–24 px section padding and responsive stacking; post-install visual verification pending.
- Colors and visual tokens: uses the shared shadcn tokens mapped to host `--xui-*` variables; post-install visual verification pending.
- Image quality and asset fidelity: no new image assets are required; all controls use the existing icon/component library.
- Copy and content: bilingual labels cover latest/fixed version, access scope, link lifecycle, and export actions.

## Comparison history

- Initial finding: sharing was a dropdown, export actions remained in the toolbar, and Copy link could remain disabled after publication.
- Fixes made: replaced the dropdown with a structured Dialog, moved all exports into it, normalized nested share results, accepted the exact platform-returned URL, and added clipboard fallback behavior.
- Post-fix evidence: blocked until the rebuilt plugin is installed into the running platform.

## Implementation checklist

- Reinstall rebuilt plugin runtime.
- Open the Share Dialog at the same desktop viewport.
- Test latest/fixed toggle and all three access modes.
- Create a public link, confirm Copy link becomes active, and verify clipboard contents.
- Test JSON, PNG, and SVG exports from the Dialog.
- Capture the Dialog and rerun visual comparison.

final result: blocked
