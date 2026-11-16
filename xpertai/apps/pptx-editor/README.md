# PPTX Editor

Native PPTX file and resource editor for Xpert. Includes slide navigation, editable objects,
speaker notes, PPTX-preserving saves, presentation mode and Spaces integration.

Spaces owns resource identity, permissions, immutable file versions and atomic saves.
Platform collaboration sessions carry presence and new-version notifications. The plugin
uses the same PPTX file, not a separate independently saved presentation copy.

- [Usage and current status](docs/index.mdx)
- [Architecture](docs/architecture.mdx)
- [Verification and acceptance](docs/verification.mdx)

Local validation: `corepack pnpm run typecheck`, `corepack pnpm run build`,
`corepack pnpm test`, `corepack pnpm run verify:dist`.

Requires the corresponding Xpert SDK/contracts, Spaces and browser SDK changes; this is
a coordinated source release, not a plugin compatible with an unchanged registry SDK.

Local acceptance on 2026-11-15 passed Cloud/ChatKit cross-host saves, refresh, notes,
conflict preservation, close autosave and WPS Office 12.1.29182 reopen of a 20-slide deck.
See `docs/verification.mdx` for the evidence boundary and remaining fidelity limits.

## File result cards

Template composition and PPTX export can attach a first-slide PNG to one compact horizontal result card. ChatKit shows a small cover on the left, the document title and page count in the middle, and Open/Download actions on the right; Open keeps the editable original while Download uses the delivered snapshot. Covers use the existing native PPTX renderer, so its font and format limitations still apply.

The packaged `pptx.cover@1.0.0` Sandbox Action requires the platform `browser/playwright-1.61/v1` Runtime and a healthy `sandbox-browser` Managed Queue consumer. Browser execution runs in a background processor, never inside the API process. Missing runtime or a preview timeout retains the ordinary file card. Covers are cached by PPTX checksum and loaded through authenticated View file access; every image read rechecks source permissions and revision. An existing conversation card without cover metadata is not retroactively rewritten.

## Native template library

The same plugin now includes 16 DSH template collections / 192 editable layouts, each with English and Chinese source examples. Open **PPTX templates** in the Assistant workbench, or choose **PPTX template library** in the presentation's file menu. Preview the actual native pages, select/reorder pages, fill text and speaker notes, and create a separate editable PPTX. Enterprise `.pptx` uploads remain unchanged in the current Project's `presentation-templates` folder; outputs go to `presentations` and use the existing Content Editors ownership, Spaces, permission and version flows.

Assistant tools `pptx_templates`, `pptx_template_inspect` and `pptx_template_compose` extend the existing PPTX capability. Native composition uses `pptx-automizer` 0.9.4 with actual slide/object selectors. Supported fills include whole text objects (first-run style), same-dimension unmerged tables, standard bar/line/area/pie/doughnut charts with embedded workbooks, authorized Project PNG/JPEG images, and notes. Select/repeat/reorder native slides; never regenerate an existing human-edited deck merely to change its content. Composition and export emit standard preview/download resource cards.

Template inspection reports compatibility explicitly. Animations, SmartArt, active/embedded objects other than chart workbooks, and external file/media relations block composition. Unsupported charts and merged tables can remain unchanged but cannot be filled. The original root's master/layout/theme parts are retained byte-for-byte. Font availability and editor preview coverage still affect appearance; an OOXML check is not a PowerPoint fidelity certificate.

### Template provenance and reproducible migration

Source: [dataelement/dsh-desktop](https://github.com/dataelement/dsh-desktop/tree/bbc7494aa9ed1cda0b89888264d7ee74a26ec50e), pinned to `bbc7494aa9ed1cda0b89888264d7ee74a26ec50e`. Assets include the bilingual PPTD source plane, 32 native PPTX reference decks, cover illustrations, catalog and SHA256 provenance. `assets/templates/licenses` contains DSH/DeepSeek/Zara MIT notices and HTML Anything Apache-2.0 attribution. No withdrawn third-party packs or font binaries are included.

Run `node scripts/import-dsh-templates.mjs /path/to/clean/pinned/dsh-desktop` to reproduce the library. This runs the reviewed upstream generators and native PPTD compiler; it does not install or run the DSH host. Two upstream native-table layouts produce duplicate shape IDs; migration repairs those unreferenced duplicates, recorded per variant in `catalog.json`. Build/verify checks asset hashes and includes the assets/licenses in `dist/assets/templates`, so runtime generation is offline.

Tests compile all 192 layouts in both languages through the native composition engine and exercise enterprise master/media preservation, text/table/chart/image fills, independent duplicate pages and notes, stale source revisions, permissions, retry receipts and invalid slots. Uploaded documents are bounded before decompression; parsing/composition runs in the existing limited Worker pool.
