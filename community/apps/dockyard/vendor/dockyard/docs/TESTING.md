# Verification report

## Recorded result

**56/56 Node core tests, 34/34 Chromium browser groups, and the strict TypeScript integration check passed.** Full logs/reports are in `test-results/`. These counts are executable tests/grouped browser scenarios, not percentages of upstream AvalonDock coverage.

Core tests run against source modules. Browser scenarios run the generated standalone distribution; an additional scenario loads the native ES-module source graph with browser import maps and executes the sample/preset operations independently of the packer. TypeScript checks the declared integration surface and expected rejection of invalid orientation, capability values and tool-pane document insertion.

## Environment and method

Node 22.16.0; Chromium 144.0.7559.96, headless; Python Playwright; TypeScript compiler version is recorded in `test-results/environment.json`.

The installed Chromium has an enterprise navigation policy restricting normal HTTP/file navigation. Tests therefore use `page.set_content` on an offline about:blank document containing the real standalone runtime. The ES-module scenario supplies local source text as data-module URLs through an import map. No enterprise policy was changed. Pointer, mouse, keyboard, actual DOM, native popup and real file-input change paths run in Chromium rather than a DOM mock.

Opaque about:blank storage access can be denied. The suite checks safe handling, not successful cross-origin/reload durability. A normal target-browser deployment should additionally verify serving, its Content Security Policy, origin storage, popup policy and downloads. The native popup success scenario exercises window.open and the actual second browser window; a separate denial scenario tests the failure path.

## Core coverage

Observable events/properties and collections; GridLength and exact inspected strategy flags; typed trees, cycle/duplicate-ID prevention, ownership and invalid replacements; activation and pane selection; individual/group floating with return panes; interior/root-edge docking and document/tool restrictions; reorder and tab groups; mixed-orientation rules; grouped auto-hide; hide/show and cancelable close/hide; floating-close preflight; commands and enabled notifications; XML/JSON round-trips, content callbacks and known native-shaped fixtures; rejecting malformed/oversized/unknown layouts; history, batching, rollback and direct changes; observable sources and insertion strategies; explicit cross-manager transfer; unavailable storage; disposal.

The fixtures were not round-tripped through a running .NET AvalonDock process. Matching inspected XML structure is not equivalent to that interoperability test.

## Browser coverage

The machine-readable `browser-results.json` lists every named case. Important groups exercise actual tab dragging/reorder/splits; docking guides and cancellation; Control-drag float; floating move/eight-grip resizing/maximize/restore/dock; tool-group dragging; auto-hide click/hover/pin; physical and keyboard splitter resizing; context menus/capabilities/cancelable DOM close; property inspector; keyboard MRU/tab/pane paths; source-driven content; themes and presets; app menu/palette; XML import through a file input; custom elements and manager isolation; factory cleanup and errors; touch PointerEvents; popup denial and native popup dock-back; iframe state-preserving same-document moves; popup dock-back after layout load; actual dimensions and locked splitters; native browser ES modules; and the separate minimal declarative example.

The workload scenario adds 500 document models in a batch and verifies that only the active body is constructed. It is not 500 simultaneously live heavy editors and it does not establish a general FPS rate. The narrow viewport scenario is 760×800; this is not a certification for every phone size.

Touch coverage dispatches touch-kind PointerEvents through the real handlers. It is not a physical touch/stylus hardware test. Separate-browser drag-and-drop between OS monitors was not validated or claimed.

## Reproduce

```sh
npm run build
npm test
npm run check
CHROMIUM_EXECUTABLE=/path/to/chromium python tests/browser.py
node scripts/api-surface.mjs
```

The first two commands need Node only. `check` requires TypeScript already available on PATH. Browser tests require Python Playwright and a Chromium executable already installed; this project intentionally does not perform package or browser downloads during its tests.

## Still requires target-environment validation

Firefox and Safari; older browser fallbacks; real touch/stylus devices; screen-reader audits; application-specific Content Security Policy; storage across reloads on real origins; native .NET XML interchange; arbitrary custom themes/templates; integration with large third-party editors; application-level source/history coordination; and high-load memory/performance profiling. No production security audit or full native API-conformance suite has been completed.
