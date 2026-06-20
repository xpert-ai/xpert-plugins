# Lucidchart Agent Drawing Skill

Use this skill when an Agent needs to create, update, or manage reviewable Lucidchart document drafts.

## Core Boundary

- The plugin stores Lucid Standard Import `document.json` drafts, Mermaid drafts, version history, and external Lucid document/embed references.
- The plugin does not create a real Lucid document unless an external Lucid REST import/manual Lucid action has happened and a real Lucid document id or URL is registered.
- A `.lucid` import file is a ZIP package containing `document.json`; the Workbench exports/imports the `document.json` content for review.

## Planning

1. Identify the diagram type, audience, key nodes, relationships, and review criteria.
2. Use Lucid Standard Import JSON for diagrams that need to become Lucidchart documents.
3. Use Mermaid when the structure is still being drafted or the user supplied Mermaid source.
4. Register external Lucid document URLs or Embed URLs when the user provides a real Lucid document.
5. Read the current document before updating an existing user-edited draft.

## Standard Import Path

- Create a document with `lucidchart_create_document` or save a version with `lucidchart_save_standard_import_version`.
- Store serializable Standard Import `document.json` content in `standardImport`.
- Prefer stable page ids, shape ids, readable labels, and simple lines.
- Use `lucidchart_patch_standard_import` for small shallow updates after reading the current version.

## Mermaid Path

- Save Mermaid with `lucidchart_save_mermaid_draft`.
- Mermaid is an intermediate draft for review; it is not proof that a real Lucidchart document exists.
- Keep Mermaid concise and valid.

## External Lucid Path

- Use `lucidchart_register_external_document` when a real Lucid document id, Lucid document URL, or Lucid Embed URL is available.
- Explain that viewing/editing depends on Lucid permissions, cookies, or token-based embed configuration.

## Versioning

- Every meaningful Agent or Workbench change should become a version with a short `changeSummary`.
- `draft` means still being prepared or reviewed.
- `reviewed` means a human accepted the current version.
- `archived` means it is removed from the active workbench.

## Failure Reporting

Call `lucidchart_report_failure` when source material cannot be represented safely as Standard Import JSON, Mermaid, or an external Lucid reference.
