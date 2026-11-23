# PDF Preview

Read-only PDF plugin for Xpert Cloud, ChatKit and collaboration-space project resources. Open a `.pdf` from project files or Spaces; the shared content-editor resolver selects this plugin.

Supports visible-page thumbnails, page navigation, fit/zoom, selectable text, next matching page search, password-protected files and original-file download. The package contains PDF.js, its worker, fonts, CMaps and WASM; no CDN is required. Preview runs in the host's sandboxed iframe. File bytes and assets pass through authenticated host actions.

No editing, annotation writes, forms, scripting or AI generation is exposed. Files are limited to 40 MiB and 1,000 pages. Search requires a text layer; scanned images are not OCRed. Original bytes are never rewritten.

Build and check from `xpertai`: `pnpm exec nx run-many -t build,typecheck,test -p pdf-viewer`. `verify:dist` checks remote bundle and PDF assets; `verify:package-output` checks the actual npm archive.
