# Documents for Xpert

An independently authored Agent Plugins 1.0.0 package for DOCX creation, editing,
comments, text revisions and visual review. No Codex code, prompts or private
runtime libraries are redistributed. The plugin's display icon is reused from
Codex; see [icon provenance](assets/README.md) and [implementation provenance](../docs/UPSTREAM.md).

Requires an Assistant with an enabled interactive sandbox, SandboxShell,
SandboxFile, the installed `@xpert-ai/plugin-view-image` middleware and an
image-capable model. Selecting this package adds the middleware for that run;
it does not enable a disabled sandbox or install dependencies.

## Desktop setup

In the Xpert source checkout run:

```sh
node tools/documents-runtime/install.mjs
```

This installs pinned Python packages in `~/.local/share/xpert/documents/venv`.
Install LibreOffice separately (on macOS, `/Applications/LibreOffice.app` or
`~/Applications/LibreOffice.app`). `XPERT_DOCUMENTS_SOFFICE` can select an explicit
executable. No Codex dependency cache or global Python installation is modified.
Install Noto Sans CJK SC (or another font covering the document's languages).
The macOS renderer configures Fontconfig to read system and user font directories.

## Package and publish

From `agent-plugins`, use `corepack pnpm quickstart --pack --output-dir <directory>
documents`, then import the ZIP under Settings > Plugins > Agent Plugins and
publish to the intended workspace. The quickstart installer also accepts
`--install ... documents`; use its normal organization/workspace authentication.
Do not use the native npm plugin installer for this resource package.

Run `python3 <installed-skill>/scripts/documents.py doctor` through
`sandbox_shell`. The result identifies the actual Python and LibreOffice.
Run `python3 <installed-skill>/scripts/documents.py run builder.py` to use the
same Python for generated code. The launcher never installs packages at runtime.

## PRO Docker sandbox

The PRO interactive image installs the same pinned Python dependencies, Writer,
and Noto CJK fonts. Rebuild the image and use a new sandbox; updating source
does not change an existing container. See `xpert-pro/packages/sandbox/README.md`.
These changes do not depend on the separate Sandbox Jobs Runtime.

## Scope and verification

The Skill includes inspect, render, paragraph comments, and conservative tracked
text replacement helpers. Revisions are limited to an unambiguous text match in
one ordinary run; complex cross-run changes require deliberate OOXML editing.
Existing documents are always written to a separate output. Native Google Docs
import requires a separate authorized Connector and is not provided here.

Render writes a fresh result directory, page PNGs, a PDF and a SHA-256 receipt.
That receipt proves conversion, not visual approval. The Agent must inspect every
page with `view_image` after the final change. Only requested deliverables are
linked to the user through the Xpert workspace file surface.

Run `corepack pnpm test`, `corepack pnpm test:lifecycle --platform-root <xpert>`,
and `python3 documents/skills/documents/scripts/documents.py run
../plugin-dev-harness/documents-smoke.py --skill documents/skills/documents
--output <empty-directory>` from `agent-plugins`.

For a real Xpert conversation, use the [Documents live harness](../../plugin-dev-harness/README.md#documents-verification).
It imports the package into the explicitly supplied test workspace and verifies
execution on an existing published sandbox Assistant. It leaves the package
available for use and the Assistant graph unchanged.

See [acceptance results and limits](docs/ACCEPTANCE.md).

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
