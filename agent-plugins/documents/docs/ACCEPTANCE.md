# Documents acceptance, 2026-09-23

## Implemented contract

The portable package contributes one Skill plus SandboxShell, SandboxFile and
ViewImageMiddleware. It uses the host's existing Skill mounting and middleware
overlay, with no Assistant graph rewrite. Helpers provide DOCX inspection,
paragraph comments, conservative tracked replacement and fresh DOCX/PDF/PNG QA.
The package includes independently authored code under the repository's AGPL-3.0
license; no Codex scripts, templates or runtime binaries are included.

## Verified

- Quickstart tests: 11 passed, including assets, Skill-only installation, cache
  and symlink rejection, and resource version preservation.
- Actual ZIP extraction, content digests and production parsers: all 7 packages
  passed against both Xpert and Xpert PRO source checkouts.
- Desktop: dedicated Python environment, LibreOffice Writer and Noto CJK installed.
  The real smoke test passed comments/anchors, revision text/style, source
  preservation, rejected ambiguous/cross-run edits, Chinese text and page images.
  All pages were inspected; the final smoke images match the inspected pixels.
- PRO Linux ARM64 Documents dependency image: built successfully. Generation,
  comments, revisions and rendering passed with networking disabled and a non-root
  user. Both pages were inspected; Chinese and repeated table headers are visible.
- Full PRO ARM64 sandbox image `xpert-pro-sandbox:documents-test`: built successfully.
  The running service executed the current smoke script through `/shell/exec/`
  with networking disabled and a non-root user. Both Dockerfiles inherit identical
  Documents dependencies; the AMD64 full image has not been built on this host.
- Live Xpert: authenticated workspace import/publication and conversation selection
  succeeded. An existing published desktop sandbox Assistant ran the doctor,
  created a two-page Chinese document with a native editable table, inspected its
  structure, rendered it and loaded both images through `view_image`.
- File delivery: the conversation's authenticated Files download API returned the
  DOCX, PDF and both PNGs. Downloaded DOCX SHA-256 matched the render receipt.
  Independent page inspection passed. The Assistant graph was unchanged.

## Boundaries

Word pagination can differ across LibreOffice/font versions (the long-table smoke
has three desktop pages and two Linux pages). Each target runtime must review its
own final render. The CLI supports ordinary paragraph comments and single-run
tracked replacements; it rejects complex/cross-run edits and pre-existing revisions.
Native Google Docs creation is outside this package.

Xpert currently delivers generated files through the conversation Files panel.
The Skill reports an exact workspace-relative path; it does not invent
`sandbox://` or unauthenticated download links.

Test context and detailed execution receipts remain in protected local storage;
machine identifiers, credentials and conversation contents are not committed.
See the repository harness README for reproducible commands.
