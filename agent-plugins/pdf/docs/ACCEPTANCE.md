# PDF migration acceptance

Verified locally on 2026-09-23. Host-specific identities, transcripts, screenshots
and generated files remain in protected local receipts, outside this package.

## Implementation

The portable package uses the existing SandboxShell, SandboxFile and
ViewImageMiddleware providers. It adds no MCP server or hosted service. A separate
PDF virtual environment and checksum-pinned OFL Chinese font are installed on
the desktop and in the PRO interactive sandbox image. No Assistant graph or model
change is needed. OCR and complex forms are not part of this migration.

## Automated and runtime checks

- Twelve quickstart installer/packaging checks passed.
- The lifecycle harness loaded all eight portable packages through the production
  ZIP extractor and parser in both Xpert and Xpert PRO. PDF helpers/references,
  digests and middleware bindings were validated.
- PDF and Documents runtime contracts passed, including matching PDF install
  assets and Docker stages for both Dockerfile variants.
- Desktop smoke passed with real embedded Chinese text, table extraction,
  merge/page selection, source preservation, ordinary forms, shared Parent/Kids
  widgets across pages, flattening, rejected duplicate/orphan/hidden/read-only
  fields and fresh render receipts.
- The complete ARM64 PRO sandbox image was built. Its normal `/shell/exec/`
  service ran the same PDF smoke successfully as an unprivileged user without
  network access. The Documents smoke passed in the same image.
- Six PDF page images on each runtime and two Documents regression pages in the
  image were visually inspected. Final regression renders matched the inspected
  pixels. AMD64 has configuration parity checks, but was not built in this run.

## Web conversation acceptance

PDF was published to the authorized local test workspace with normal platform
authentication and organization-scoped headers. In the actual web conversation,
PDF was selected and a natural-language request submitted for a two-page Chinese
project acceptance report with a three-column, four-row table including its header.

The Agent loaded the portable Skill, ran its doctor against the installed PDF
environment, generated a PDF, inspected it, rendered it and used `view_image` on
both pages. The first response produced five table rows. A follow-up in the same
web conversation corrected the table and saved a new final PDF. The Skill now
explicitly requires checking requested row/column counts before delivery.

The final two page PNGs were opened and checked in the web Files panel. Clicking
the PDF file menu's Download action returned HTTP 200 with `application/pdf`.
The exact response bytes were saved through browser developer tooling, reopened,
and checked for two pages, Chinese text and a 4-by-3 table. Their SHA-256 matched
the Agent's render receipt, proving the checked pages correspond to the downloaded
PDF. No API was used to initiate the Agent conversation.

## Observed UI limitation

The Codex in-app browser displayed a black embedded native PDF preview and did not
emit the automation download event. The preview URL returned HTTP 200 with PDF
content; the browser subsequently reported `net::ERR_BLOCKED_BY_CLIENT` while
loading its native PDF viewer. Consequently, native PDF preview and a normal
browser-managed save were **not** marked passed. The download HTTP response and
PDF bytes were verified, and PNG previews worked. This browser limitation is
separate from generation/rendering; no preview bypass or browser security change
was made.
