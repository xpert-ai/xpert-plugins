# Xpert Artifact Tool 0.1

An independently implemented, local npm SDK and CLI for the Spreadsheets portable
plugin. No OpenAI artifact-tool code, binaries, credentials or private runtime is
included. This package is not API-compatible with that proprietary package.

`createWorkbook(spec)`, `editWorkbook(bytes, revisionedPatch)`,
`recalculateWorkbook(bytes)` and `inspectWorkbook(bytes, options)` are async SDK
entry points. The `./xlsx` browser entry provides OPC-preserving cell edits and
metadata without importing Node, WASM or the calculation engine into the browser.

The CLI exposes `doctor`, `build`, `inspect`, `edit`, `recalculate`, `validate` and
`render`. Outputs must use new paths; cell edits require the source SHA-256.
Inspect output is bounded and explicitly reports truncation. Render outputs carry
the source hash and are not marked visually reviewed automatically.

Implementation: Excelize WASM 0.1.3 authors native XLSX files; Univer OSS 0.25.1
calculates the same formula subset as the platform's editor; JSZip and xmldom
patch values/caches in the original package; LibreOffice Calc and PDFium produce
PDF/PNG previews using a disposable copy. The authoritative workbook is never
round-tripped through LibreOffice. Unsupported formula functions fail before a
new workbook is written. Basic scalar formulas and bounded A1 references only;
no shared/array/external/structured references, macros, pivots or collaboration.

Browser edits preserve all unrelated package members and refresh native chart
caches. The host must supply calculated formula values, detect unsupported edits,
and retain authorization/revision checks for writes. This is a file library, not
an untrusted-code execution sandbox or a replacement for Xpert access controls.

Run `corepack pnpm --filter @xpert-ai/artifact-tool test` from the plugin repository.

## Package and release

From this package directory, run `npm pack --dry-run` to inspect the published
contents, then `npm pack` to create a local package for verification. An authorized
maintainer can publish a release with `npm publish --access public`.

Automatic releases use the existing `release-plugin.yml` workflow and the
`xpertai` workspace, which includes `../packages/*`. Add this package's changesets
under `xpertai/.changeset/` (the root `.changeset` alias can point to a different
workspace). Merging into `main` creates a version PR; merging that PR runs
`release:prepare` and publishes the new npm version. This source package runs its
SDK tests in `release:prepare` instead of requiring an Nx compilation target.
The official workspace generates changelogs for the version PR. Its version
script also stages changed shared-package manifests and changelogs outside
`xpertai`, so the release commit contains the SDK's new version.
The community workspace explicitly excludes this package from discovery, since
Changesets 2.x `ignore` alone does not exclude unpublished packages from publish.

The included patch changeset advances `0.1.0` to `0.1.1`. `xpert-artifact --version`
and `doctor` read the version from package metadata. Keep the root and
`xpertai/pnpm-lock.yaml` dependency entries current; CI uses the latter with
`--frozen-lockfile`.

Before the first automated publication, an npm maintainer must authorize this
package for trusted publishing: GitHub owner `xpert-ai`, repository `xpert-plugins`,
workflow filename `release-plugin.yml`. The workflow supplies `id-token: write`.
Leave the environment name empty and allow direct `npm publish` in Allowed
actions, since this workflow does not use npm staged publishing.
The package declares public access and the matching repository URL. Package-side
authorization is configured on npm, not by a changeset. If the package does not
yet exist, complete npm's initial package setup/publication with a maintainer
account before configuring its trusted publisher. See
[npm trusted publishing](https://docs.npmjs.com/trusted-publishers/).

After publication, pin the released npm version in the host's desktop and Docker
runtime dependencies and regenerate their lockfiles. The npm package provides the
SDK and CLI; PDF/PNG rendering also requires Python with PDFium/Pillow, LibreOffice
Calc and CJK fonts. Prepare these dependencies before running Agent tasks. The
package does not install them or modify a platform checkout during packing.

Third-party licenses: Univer Apache-2.0; Excelize WASM BSD-3-Clause; JSZip MIT;
xmldom MIT; Zod MIT. LibreOffice and PDFium/Pillow retain their respective licenses.
Exact transitive dependencies are pinned by each runtime lockfile.
