# Presentations v1 acceptance

Verified on 2026-09-23 against the local Xpert desktop sandbox and the PRO ARM64
Docker sandbox. This is an independent portable implementation using PptxGenJS,
python-pptx, LibreOffice Impress and PDFium. It includes no Codex-private runtime,
copied Codex Skill, assets or scripts.

## Delivered behavior

- Author an editable 16:9 PPTX from a validated JSON spec with original light and
  navy themes, Chinese text, local PNG/JPEG, native tables, native bar/line/pie
  charts with embedded data workbooks, and speaker notes.
- Inspect slide order, object IDs, text runs, tables, chart values, notes and
  package relationships. Preserve uploaded source files.
- Change one uniquely matched text run in a selected top-level shape using a
  checked source SHA-256, then save a new file without rewriting unrelated parts.
- Render every final slide through an isolated Impress profile to PDF and PNG,
  with an input hash receipt for Agent image review.
- Open, edit, save and download the resulting PPTX in the existing browser
  editor; ask the Agent to inspect and continue from the saved workspace file.

## Actual browser acceptance

The local Xpert source UI and API were used with the published Presentations
portable plugin selected on an existing published sandbox Assistant. The
Assistant graph and model were not changed. Authentication, organization scope,
workspace access and package publication used the normal platform interfaces.

1. Send a natural-language request for four Chinese slides: cover, a 4-by-3
   table, a native column chart with Q1/Q2/Q3 values 20/35/50, and a summary;
   include speaker notes on every slide.
2. Observe successful runtime doctor, generation, inspection, four-slide
   rendering and two image-review calls covering all four pages.
3. Open the generated PPTX in Files, edit the cover title and click Save.
4. Ask the Agent to read the saved title without telling it the new title, then
   replace one specified sentence on slide 4 and create a new PPTX. The Agent
   correctly reads the browser-saved title, applies the hash-checked edit,
   renders the new file and reviews all four new page images.
5. Open the final file in the browser. Verify the saved title and visible native
   chart. Download it using the actual file menu's Download action.
6. Inspect and render those downloaded bytes independently. All four final PNGs
   were visually reviewed: Chinese glyphs, table cells, chart labels and final
   text are visible without clipping. The saved title, table, chart workbook and
   all four notes remain. Comparing the downloaded saved source and final PPTX
   shows only `ppt/slides/slide4.xml` changed; all other ZIP parts are identical.

Final workspace artifact: `presentations/web-final-v2/web-deck-final.pptx`.
Private evidence includes the UI screenshots, tool observations, both downloaded
PPTX files, extracted inspection result, rendered pages and hash comparison.
Machine identifiers, credentials and private context are not included here.

The browser test exposed two host integration defects, now fixed in both Xpert
and PRO: the missing binary-save callback made PPTX editing unavailable in the
conversation/workbench views; unhandled `multiLvlStrCache` categories made
PptxGenJS charts blank in preview. Editable/read-only routing and bar/line/pie
category parsing have focused regression tests.

## Verification matrix

| Layer | Result |
| --- | --- |
| Portable packager | 13 tests; validates resources, excludes dependencies/caches and accepts required `.mjs` helpers |
| Production package lifecycle | All 9 packages pass ZIP extraction, parsing, digest and dependency binding against both Xpert and PRO |
| Desktop runtime | Separate pinned Python environment and npm lockfile installed; standalone Impress and CJK fonts used |
| Desktop fixture | Native objects/workbooks/notes, both themes, three chart types, image aspect ratio, unique IDs, slide order and conservative edit checks pass |
| PRO dependency contracts | 6 tests covering Documents, PDF and Presentations pass; shared runtime pins and both final Dockerfiles checked |
| PRO ARM64 final image | Complete image builds; normal HTTP sandbox service runs as non-root with external network disabled |
| Docker service regression | Documents, PDF and Presentations fixtures pass through `/shell/exec/`; latest Presentations helpers also pass after final visual adjustments |
| Xpert frontend | 50 relevant component, binary-save, document-state and chart/parser tests pass |
| PRO frontend | Same 50 relevant tests pass; mirrored implementation checked |
| Real Xpert browser | Generate, render/review, open, manually edit/save, Agent re-read/edit, preview and download pass |
| Downloaded output | Four slides independently rendered and visually reviewed; only intended XML part changed |

The smoke fixtures also reject stale source hashes, ambiguous cross-run edits,
external media and reuse of an existing QA output directory. Source ZIP parts
are preserved during conservative edits. Generated shape IDs are normalized
before publication because the authoring library can reuse table/title IDs;
uploaded presentations are never normalized this way.

Reproduction commands are in the repository's `plugin-dev-harness/README.md`.
The browser procedure above is required in addition to automated checks.

## Scope and remaining coverage

The real UI run used Xpert desktop, not a separately started PRO web instance.
The PRO code is mirrored and tested, and its final Docker service was exercised.
AMD64 has matching dependency/Dockerfile contracts but was not built or run in
this ARM64 environment. Visual review is not a guarantee of identical rendering
in every PowerPoint, LibreOffice or font version.

V1 does not provide Google Slides integration, legacy `.ppt` conversion,
arbitrary template reconstruction, animation authoring, browser chart-data
editing or a guarantee of full-fidelity roundtripping for complex uploaded decks.
Agent editing is deliberately limited to exact single-run text replacement;
unsupported edits are reported instead of flattening or rebuilding the source.
