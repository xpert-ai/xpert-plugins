# PDF for Xpert

An independently authored Agent Plugins 1.0.0 package for PDF generation,
text/table extraction, rendering, page merge/selection and ordinary AcroForms.
It contains no Codex runtime code, telemetry helper or prompt text. The plugin's
display icon is reused from Codex; see [icon provenance](assets/README.md) and
[implementation provenance](../docs/UPSTREAM.md#pdf-migration).

## Runtime and installation

Requires an enabled interactive Assistant sandbox, the installed
`@xpert-ai/plugin-view-image` provider and an image-capable model. Selecting PDF
adds SandboxShell, SandboxFile and ViewImageMiddleware for that run. It does not
enable a disabled sandbox or require an MCP/OAuth connection.

In the Xpert desktop source checkout run:

```sh
node tools/pdf-runtime/install.mjs
```

This creates a separate `~/.local/share/xpert/pdf/venv` and installs pinned Python
packages and an OFL Noto Sans SC TrueType font verified by SHA-256. Chinese fonts
are embedded into generated PDFs. Override `XPERT_PDF_PYTHON` or `XPERT_PDF_FONT`
for a custom installation. No Documents/system Python environment is changed.
First installation requires network access; subsequent PDF operations are local.

PRO's two interactive sandbox Dockerfiles build an isolated PDF runtime and copy
it into the final image. Rebuild and create a new sandbox to use it. These changes
do not apply to the separate Sandbox Jobs Runtime images.

From `agent-plugins`, pack with:

```sh
corepack pnpm quickstart --pack --output-dir /tmp/xpert-pdf pdf
```

Import the ZIP under Settings > Plugins > Agent Plugins and publish to the target
workspace, or use the quickstart installer's normal authenticated organization
scope. Choose PDF in a sandbox-enabled conversation. Generated files are available
in the conversation Files panel, without an Assistant graph change.

## Scope

- ReportLab creation with embedded Chinese TrueType font; PDFium page rendering.
- pdfplumber text/table extraction with explicit truncation flags.
- pypdf merge and page selection/reordering for ordinary unsigned PDFs.
- Interactive ASCII text fields and checkboxes, including shared Parent/Kids
  widgets across pages; optional explicit flattening with structural verification.
- New output paths, source preservation, SHA-256 render receipt and visual QA.

The form helper rejects duplicate/orphan fields, signatures, XFA, radio/choice
fields, hidden/read-only fields and Unicode form values needing font-aware
appearances. Arbitrary PDF text rewriting, OCR, digital signing and encrypted
input processing are outside this first package. It is not full Codex parity.
Text extraction and successful rendering do not establish visual approval.

## Tests

```sh
corepack pnpm test
corepack pnpm test:lifecycle --platform-root "$XPERT_PLATFORM_ROOT"
python3 pdf/skills/pdf/scripts/pdf.py run ../plugin-dev-harness/pdf-smoke.py \
  --skill pdf/skills/pdf --output /tmp/pdf-smoke-new
```

The smoke test creates actual PDFs and checks embedded CJK, extraction, page order,
source hashes, form values/appearances, multi-page widgets, flattening, duplicate
and orphan rejection, and fresh renders. Inspect the resulting PNGs separately.
See [acceptance evidence](docs/ACCEPTANCE.md) for the tested layers.

## Explicit final-file presentation

Version 1.0.2 uses the platform SandboxFile `present_files` tool after generation
and verification. Its only input is `paths`; the Agent selects the final files,
and the host validates and archives immutable versions before emitting cards.
File writes and Shell operations only record file changes. Directory names and
extensions no longer select deliverables automatically. Existing files and
explicitly requested previews may also be presented. Re-present after edits;
older message cards stay pinned to their saved versions.

Requires the updated Xpert/PRO host with `present_files`; no new sandbox package
is needed. Existing conversations pin plugin versions: reselect this version to
load its new skill instructions. Historical output cards remain available.
