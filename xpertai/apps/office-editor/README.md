# Office Editor

Xpert system plugin for editing Univer-native spreadsheets, documents, and presentations with humans and Agents.

This plugin provides:

- A React remote component Workbench powered by Univer OSS.
- A plugin-owned Yjs/Socket.IO collaboration gateway for real-time rooms and update persistence.
- Versioned XLSX file storage plus best-effort OSS import for XLSX, DOCX, and experimental PPTX into Univer-native snapshots.
- Server-side XLSX automation for reading ranges, setting values and formulas, clearing ranges, and managing sheets.
- Agent middleware tools for automatic XLSX editing and download as well as queued document and presentation review.
- Tenant-scoped persistence for documents, snapshots, Yjs updates, and operations.
- An Assistant template and plugin-scoped skill.

XLSX imports retain the real workbook in scoped Workspace Files and create immutable file versions. Agents can read and edit the persisted workbook without opening the Workbench, and every successful edit produces a downloadable XLSX version plus a synchronized Univer snapshot. Workbench saves of imported spreadsheets also create a new XLSX file version.

DOCX and PPTX imports remain Univer-native best-effort conversions and do not retain their original binary files. XLSX round-tripping is also best-effort: values, formulas, number formats, merged cells, and sheet structure are supported, while charts, images, pivot tables, macros, data validation, and complex formatting are not guaranteed to survive edits made through Univer or the OSS XLSX writer.

## Excel automation tools

- `office_excel_read`: inspect workbook metadata or read a bounded A1 range.
- `office_excel_edit`: apply typed server-side operations and return the new XLSX artifact.
- `office_excel_get_versions`: list immutable XLSX versions.
- `office_excel_restore_version`: restore an older file as a new version.
- `office_excel_get_file`: return the current XLSX artifact.

`office_excel_edit` supports setting values, setting formulas, clearing ranges, and creating, renaming, or deleting sheets. Use `expectedVersionNumber` for optimistic concurrency and `idempotencyKey` for safe retries.

## Validation

```bash
pnpm -C xpertai/apps/office-editor test
pnpm -C xpertai/apps/office-editor build
pnpm -C plugin-dev-harness build
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/office-editor --plugin @xpert-ai/plugin-office-editor --verbose
```
