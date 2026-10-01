# AnyDoc

Knowledge-base document parser `@xpert-ai/plugin-anydoc`. Install as a **system plugin**; it registers the `anydoc` transformer and `anydoc.convert` Sandbox Action (1.0.3).

## Execution

- Uses platform Sandbox Jobs and scoped Workspace Files. API processes do not load native modules or start Java themselves.
- Runtime profile: `document/node-20/v1`. Conversion dependencies are installed, pinned and verified by the host Runtime Suite.
- No URL, token, executable-path or dependency-installation settings in the parser form.
- Input limit 100 MiB; output/decoded assets limit 128 MiB; 1,000 assets maximum; job timeout 300 seconds.
- Each conversion uses tenant/document/content/runtime-scoped identity and unique persisted asset paths. Cancelling processing cancels the same Job, including retries.

## Formats and limits

Supports `doc`, `docx`, `ppt`, `pptx`, `xls`, `xlsx`, `csv`, `odt`, `ods`, `odp`, `rtf`, `epub`, and PDF using `@firecrawl/anydoc@0.2.4`.

XLS/XLSX/CSV use **document/form interpretation**; row-record ingestion remains builtin. CSV must be UTF-8. Embedded raster images are exported separately for the existing image-understanding stage; unsupported embedded objects are retained as file assets. Their page/position is not invented.

Native PDF text is extracted locally. When AnyDoc reports scanned pages, the managed Runtime isolates pages and renders scans as PNG assets, preserving page order and coverage diagnostics. Enable knowledge-base image understanding and select a vision model to transcribe those pages. Without successful image understanding, scanned pages remain explicitly unrecognized. The renderer limits PDFs to 500 pages and page images to a 2,200-pixel longest edge. Firecrawl hosted OCR is never enabled; whether vision inference is local depends on the configured model.

Conversion failures are failed Jobs with bounded parser error codes. Retrying after recovery executes again; successful Job reuse includes the Runtime dependency fingerprint.

## Local development

The host must include this Runtime profile and support knowledge-document `fileScope`. Use the platform-managed installer from the host checkout with Node 20.20.2:

```sh
corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-node
corepack pnpm --filter @xpert-ai/sandbox-runtime verify:local-document-node
```

Local process execution is development/test only. Production needs a published `document-node` OCI image bound through the existing Runtime infrastructure; jobs use non-root, read-only filesystem and network isolation. Installing this plugin does not publish/bind a Runtime image.

From `xpertai/`:

```sh
corepack pnpm exec nx run @xpert-ai/plugin-anydoc:build
corepack pnpm exec nx run @xpert-ai/plugin-anydoc:test
```

From the repository root:

```sh
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-anydoc
```

The installable package includes `.xpertai-plugin/plugin.json`, which declares `dist/sandbox-actions/convert/action.json`, and its hashed bundle. Official artwork is bundled under `dist/_assets` and shared by the plugin card and parser metadata; displaying it does not fetch external URLs. After installing from this workspace into the local host, restart the API explicitly, then select AnyDoc under the relevant file type. Existing documents need reprocessing to use a new parser. Browser/knowledge-base indexing acceptance is separate from converter and lifecycle tests.
