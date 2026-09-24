# Spreadsheets

Portable Agent Plugin backed by the independently implemented
[`@xpert-ai/artifact-tool`](https://www.npmjs.com/package/@xpert-ai/artifact-tool)
npm package. Its source is maintained in `../../packages/artifact-tool`.

Capabilities: native XLSX, multiple sheets, Chinese text, explicit formulas with
cached calculation results, number formats, tables, charts, bounded inspection,
revisioned cell edits, Calc/PDFium preview and mandatory visual review.
The Skill/resources archive contains no dependencies or host-specific paths.

Install the desktop runtime from Xpert's `tools/spreadsheets-runtime/install.mjs`.
PRO's sandbox image must preinstall the same locked package plus Calc/PDFium/CJK fonts.
Install the portable package using the existing agent-plugins quickstart command
with the correct organization/workspace context. It needs a published Assistant
with SandboxShell, SandboxFile and ViewImage capabilities.

Pin a released SDK version in the platform runtime and retain its dependency
lockfile. The portable plugin does not bundle npm dependencies or install them
during conversations. Older platform checkouts may still reference a vendored
tarball; migrate their manifests, lockfiles and installer separately before
rolling out the registry-based runtime. See `docs/ACCEPTANCE.md` for the tested
SDK version and the distinction between historical and release verification.

The browser supports cell/formula edits while preserving original package
objects. Structural/formatting changes are rejected before save; charts are
retained in XLSX and visible in the generated PDF/PNG, not editable/rendered by
the OSS browser grid. See `docs/ACCEPTANCE.md` for actual test coverage.

This is an original Xpert implementation; no proprietary OpenAI artifact-tool
code is redistributed. Third-party dependencies retain their own licenses.
The plugin's display icon is reused from Codex; see [icon provenance](assets/README.md).

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
