# Spreadsheets acceptance

The initial 1.0.0 workflow was verified locally on 2026-09-23. Runtime: independently implemented
`@xpert-ai/artifact-tool` 0.1.0, Excelize WASM 0.1.3, Univer OSS 0.25.1,
LibreOffice Calc and PDFium. No proprietary Codex runtime is redistributed.

## Actual browser acceptance

A published Spreadsheets portable plugin was selected in the local Xpert web UI.
An actual Agent conversation generated a workbook with Sales, Summary and Hidden
worksheets, Chinese headers, freeze panes, decimal formats, a native table and a
native chart. Tool records confirmed doctor, build, inspect, validate, rendering
and both page images delivered to the model through ViewImage.

1. Opened the generated XLSX in Files and changed Sales!B2 from 120 to 155 using
   the browser grid, then clicked Save. Downloaded bytes independently confirmed
   revenue 575 and profit 265. The native chart cache became `[75, 80, 110]`.
2. Asked the Agent to inspect the saved file without telling it the edited value.
   It read B2=155, D2=75, revenue=575 and profit=265 from the current file and
   used that file's SHA-256 in its patch.
3. The Agent changed only Sales!C3 from 100 to 110 and wrote a new
   `web-sales-final.xlsx`. Revenue stayed 575; profit became 255. Formula strings
   and numeric caches, chart values `[75, 70, 110]`, the native table and hidden
   Hidden!A2=42 were independently verified.
4. Clicked the final file's Download menu in the actual web UI. The downloaded
   file matched the authenticated workspace-download bytes and render input hash.
   Reopened its Summary sheet in the browser. Both final page PNGs were also
   independently visually reviewed: readable Chinese, complete tables and chart,
   no clipped content. The requested two-decimal margin appears as 0.44, not a
   percentage; templates can choose a percentage format explicitly.

Both the browser edit and subsequent Agent edit changed only two worksheet XML
parts and the chart cache XML. Seventeen other package parts stayed byte-identical,
including table definitions, styles, drawings and the hidden worksheet.
Machine-specific IDs, account context, logs and downloaded evidence are kept in
private local receipts, outside source control.

The browser check exposed and fixed a real CORS regression: a custom Cache-Control
header in the revision check triggered a rejected preflight. The check now uses
a cache-busting query parameter; a component regression test covers this path.

## Other verification

- Runtime SDK: seven tests, including literal strings, formula failures,
  stale revisions, native objects, table-header consistency and bounded inspection.
- Xpert and Xpert PRO: fourteen spreadsheet frontend tests each; the live Xpert
  Angular development bundle compiled successfully. PRO received identical frontend
  changes and tests; a separate PRO web server was not used for browser acceptance.
- Portable quickstart: fourteen contract tests; all ten portable packages loaded
  through each platform's production extraction/parser lifecycle.
- Desktop: actual build/edit/inspect/validate/render fixture with isolated npm and
  Python dependencies. Both pages visually reviewed.
- PRO: complete ARM64 interactive sandbox image built. Spreadsheets ran through
  its normal HTTP shell service as UID 10001, without external networking.
  Both rendered pages reviewed. Documents, PDF and Presentations regression
  fixtures also passed in the full image during this migration.
- Eight runtime/Docker contract tests passed. Desktop, PRO desktop and Docker
  share the same SHA-256-pinned npm tarball and locked dependencies. Frozen
  frontend lockfile installation passed. AMD64 Dockerfile contract checked;
  an actual AMD64 image execution is not claimed.

## Release packaging verification (2026-09-24)

The portable package is now 1.0.2, with explicit `present_files({paths})` delivery
and an embedded display icon matching the bundled PNG.

- All 15 quickstart contract tests pass, including Spreadsheets packaging,
  installation bindings and paths-only final-file presentation.
- All ten portable ZIPs pass the production extractor/parser, content digest,
  Skill and dependency binding checks against both Xpert and Xpert PRO.
- A clean temporary runtime installs `@xpert-ai/artifact-tool@0.1.0` from the
  public npm registry. The portable launcher passes all 12 smoke checks using
  that SDK and the installed desktop Python/Calc dependencies: formulas, native
  objects and caches, conservative edits, rejected stale revisions, bounded
  inspection, source preservation and two-page Chinese rendering.
- The existing PRO ARM64 sandbox image also passes all 12 checks through its
  normal HTTP shell service as UID 10001 with external networking disabled.
  This image retains its pre-publication runtime; this run does not validate a
  rebuilt Docker image using the registry dependency.
- All four page images from these two fixture runs were visually inspected.
  Chinese headers, chart labels and table values are readable without clipping;
  summary revenue is 570, profit 260 and the percentage margin 45.61%.

These are packaging and runtime regressions. The browser results above describe
the earlier UI acceptance; a new browser conversation was not run for staging.
Dependency locks, render receipts and review evidence remain in private temporary
directories rather than in the portable archive.

## V1 boundaries

The npm package is an independent API, not a drop-in OpenAI artifact-tool clone.
XLSX authoring supports bounded multi-sheet scalar data, the documented formula
subset, formatting, tables and bar/line/pie charts. No live Google Sheets,
macro execution, pivot authoring or complete Excel fidelity is claimed.

Browser saving supports cell values and formulas while retaining source package
objects. Structural and formatting edits are rejected before writing. Native
charts are retained in XLSX and shown through generated PDF/PNG previews; the OSS
browser grid does not render/edit them. Browser and desktop font rendering can
vary. Validate checks cached formula errors; it does not calculate formulas.

Source-byte checks and Agent SHA-256 checks are optimistic checks, not an atomic
server-side compare-and-swap or a collaborative editor. Reopen the saved workspace
file before concurrent external/Agent changes; a browser Blob preview alone does
not provide a fresh remote revision. Changes between check and upload still
require future server-side revision enforcement.

The new runtime is installed locally. Production rollout requires building the
intended sandbox architecture, configuring SANDBOX_IMAGE, creating new sandboxes,
and publishing/selecting the portable plugin in the intended workspace. Existing
containers are not upgraded automatically. The initial acceptance used a locally
packed SDK. The SDK has since been published as `@xpert-ai/artifact-tool@0.1.0`;
older host runtime manifests and installers still need a separate migration from
vendored tarballs to the released npm dependency.
