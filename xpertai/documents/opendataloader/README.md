# OpenDataLoader PDF

Knowledge-base document parser `@xpert-ai/plugin-opendataloader`. Install as a **system plugin**; it registers the `opendataloader` transformer and `opendataloader.convert` Sandbox Action (1.2.1).

## Execution

- Uses platform Sandbox Jobs and scoped Workspace Files. API processes do not load native modules or start Java themselves.
- Runtime profile: `document/java-17/v1`. Conversion dependencies are installed, pinned and verified by the host Runtime Suite.
- No URL, token, executable-path or dependency-installation settings in the parser form.
- Input limit 100 MiB; output/decoded assets limit 128 MiB; 1,000 assets maximum; job timeout 300 seconds.
- Each conversion uses tenant/document/content/runtime-scoped identity and unique persisted asset paths. Cancelling processing cancels the same Job, including retries.
- Conversion failures are failed Jobs and retain their parser error code and affected pages. Retrying after recovery executes again; successful results are reused only for the same conversion identity, including the Runtime dependency fingerprint.

## Formats and limits

Supports **PDF only**, using Java 17 and the official OpenDataLoader PDF 2.5.8 CLI JAR. Native text pages retain their Java extraction results. Pages without verified text use the official Hybrid OCR backend through a job-local Python process with Docling/EasyOCR, simplified Chinese and English models, and CPU execution. The managed Runtime preinstalls the Python dependencies and model weights; jobs do not download models or call an external OCR service. The local backend is stopped when the Job ends or fails.

The parser form exposes an **OCR minimum confidence** slider (`ocrConfidenceThreshold`, 0–1, default 0.5). Lower values retain more uncertain recognized text; the setting applies to OCR pages and participates in the conversion identity.

Markdown page separators and JSON page evidence must agree. OCR that cannot verify all requested pages fails explicitly instead of returning partial success; blank pages are not guessed from missing text. OCR uses the same 300-second Job budget, so large or slow scanned documents can time out.

Text, tables, verified page numbers, external PNG images and the original JSON result are preserved. Extracted images are ordinary image assets; they are not labelled as full-page scans. Image paths must remain within the conversion directory; symlinks and traversal are rejected.

## Local development

The host must include this Runtime profile and support knowledge-document `fileScope`. Use the platform-managed installer from the host checkout with Node 20.20.2:

```sh
corepack pnpm --filter @xpert-ai/sandbox-runtime install:document-java
corepack pnpm --filter @xpert-ai/sandbox-runtime verify:local-document-java
```

Local process execution is development/test only. Production needs a published `document-java` OCI image bound through the existing Runtime infrastructure; jobs use non-root, read-only filesystem and network isolation. Installing this plugin does not publish/bind a Runtime image.

From `xpertai/`:

```sh
corepack pnpm exec nx run @xpert-ai/plugin-opendataloader:build
corepack pnpm exec nx run @xpert-ai/plugin-opendataloader:test
```

From the repository root:

```sh
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @xpert-ai/plugin-opendataloader
```

The installable package includes `.xpertai-plugin/plugin.json`, which declares `dist/sandbox-actions/convert/action.json`, and its hashed bundle. Official artwork is bundled under `dist/_assets` and shared by the plugin card and parser metadata; displaying it does not fetch external URLs. After installing from this workspace into the local host, restart the API explicitly, then select OpenDataLoader PDF under the relevant file type. Existing documents need reprocessing to use a new parser. Browser/knowledge-base indexing acceptance is separate from converter and lifecycle tests.
