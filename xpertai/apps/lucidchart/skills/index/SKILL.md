---
name: index
description: "Use when an Agent needs to create, update, review, or manage Lucidchart drafts through the Xpert Lucidchart plugin, including Lucid Standard Import document.json, Mermaid drafts, external Lucid links, versioning, import/export, and failure reporting."
---

# Lucidchart Agent Drawing

Use this skill when a user asks to create, edit, review, import, export, or manage a Lucidchart-oriented diagram draft in Xpert.

## Plugin Purpose

The Lucidchart plugin gives an Agent a reviewable draft loop without pretending to control Lucid's proprietary editor directly:

- Save Lucid Standard Import `document.json` drafts.
- Save Mermaid drafts while the structure is still being refined.
- Register real Lucid document IDs, Lucid URLs, or Embed URLs when they exist.
- Preserve versions, status, logs, and failure evidence for Workbench review.

## Workflow

1. Identify whether the user needs a Lucid-importable draft, a conceptual flow draft, or a reference to an existing Lucid document.
2. Prefer Lucid Standard Import JSON when the structure is ready to become a Lucidchart document.
3. Use Mermaid with `lucidchart_save_mermaid_draft` when the diagram is still being explored or when a flow is easier to communicate first.
4. Use `lucidchart_register_external_document` only when a real Lucid document ID, document URL, or Embed URL is available.
5. Before updating an existing plugin document, call `lucidchart_get_document` and preserve user-edited Standard Import content.
6. If a requested diagram cannot be safely represented as Standard Import JSON, Mermaid, or a real Lucid reference, call `lucidchart_report_failure`.

## Tool Selection

- `lucidchart_create_document`: create a managed Lucidchart plugin document record.
- `lucidchart_save_standard_import_version`: save complete Lucid Standard Import JSON as a version.
- `lucidchart_patch_standard_import`: patch or replace current Standard Import JSON after reading it.
- `lucidchart_save_mermaid_draft`: save Mermaid source for Workbench review.
- `lucidchart_register_external_document`: register an actual Lucid document or embed link.
- `lucidchart_search_documents`: find existing managed documents.
- `lucidchart_get_document`: read current version, links, versions, and logs before edits.
- `lucidchart_update_document_status`: mark draft, reviewed, or archived after user confirmation.
- `lucidchart_report_failure`: record Standard Import, Mermaid, link, or import/export failures.

## Lucid Boundary

Do not claim that a real Lucidchart file exists unless a real Lucid document link or embed has been registered. Standard Import JSON is a draft artifact that can be imported into Lucid through an external Lucid import flow.

## Response Style

Keep responses concise. Tell the user whether you saved Standard Import JSON, Mermaid, or a Lucid link, and what they can review next in the Workbench.
