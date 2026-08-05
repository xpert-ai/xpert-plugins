# DOCX Editor

Xpert plugin for browser-based `.docx` editing, AI-assisted review, comments, tracked changes, versioning, and Workbench review.

This plugin wraps the upstream Apache-2.0 `@eigenpal/docx-editor` packages and exposes the experience as a Xpert system plugin with:

- A React remote component Workbench built with the shared shadcn UI primitives.
- Agent middleware tools for DOCX reading, comments, tracked changes, formatting, and navigation.
- Tenant-scoped persistence for documents, versions, snapshots, and operations.
- Read-only public links that preserve semantic headings, lists, tables, inline formatting, and embedded images.
- An installable Assistant template and plugin-scoped skill.

## Current Workbench document context

The Workbench does not expose a separate "get current document" Agent middleware tool. Instead, the remote component sends the active document metadata to the Assistant runtime through the declared `assistant.context.set` client command.

The context payload uses the fixed key `docxEditor`, includes `env.docxEditorDocumentId` and `env.docxEditorMode`, and provides lightweight `context.currentDocument` metadata such as title, file name, version, workspace file path, dirty state, mode, selection, and page state when available. When no document is selected or the Workbench unloads, it clears the same key.

`DocxEditorMiddleware` reads this runtime context before model and tool calls. The model prompt receives the current document metadata, and `docx_*` tools may omit `documentId` when they target the current Workbench document. Explicit `documentId` arguments still take precedence. Full document text, comments, tracked changes, pages, and selection details should continue to be fetched with `docx_read_document`, `docx_find_text`, `docx_read_comments`, `docx_read_changes`, `docx_read_page`, `docx_read_pages`, or `docx_read_selection`.

## Agent-created documents and public links

An Agent-created `.docx` no longer needs to be uploaded or opened manually before it can be shared. The Agent writes the native file into its runtime workspace and calls `docx_import_workspace_file`. That call creates an official DOCX Editor document/version, returns its `documentId` and `versionId`, and causes an open Workbench to load the imported document.

The Agent can then pass the returned `documentId` to `docx_publish_artifact_link`. Fixed-version links render the exact saved DOCX version used by the Workbench, so headings, lists, tables, inline formatting, and embedded images do not diverge between the editor and the public page.

## Validation

```bash
pnpm -C xpertai/apps/docx-editor test
pnpm -C xpertai/apps/docx-editor build
pnpm -C plugin-dev-harness build
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/docx-editor --plugin @xpert-ai/plugin-docx-editor --verbose
```
