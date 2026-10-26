# Office Editor

Xpert system plugin for editing Univer-native spreadsheets, documents, and presentations with humans and Agents.

This plugin provides:

- A Project-owned `xpert.spreadsheet` implementation in the shared Spaces Content Catalog.
- A React remote component Workbench powered by Univer OSS.
- The existing Office native view's Yjs snapshot transport through the shared Collaboration Runtime. Its whole-snapshot register is not a cell-level merge protocol; new Spaces workbooks use the version protocol described below.
- Versioned XLSX file storage plus best-effort OSS import for XLSX, DOCX, and experimental PPTX into Univer-native snapshots.
- Server-side XLSX automation for reading ranges, setting values and formulas, clearing ranges, and managing sheets.
- Agent middleware tools for automatic XLSX editing and download as well as queued document and presentation review.
- Tenant-scoped persistence for documents, snapshots, Yjs updates, and operations.
- An Assistant template and plugin-scoped skill.

XLSX imports retain the real workbook in scoped Workspace Files and create immutable file versions. Agents can read and edit the persisted workbook without opening the Workbench, and every successful edit produces a downloadable XLSX version plus a synchronized Univer snapshot. Workbench saves of imported spreadsheets also create a new XLSX file version.

DOCX and PPTX imports remain Univer-native best-effort conversions and do not retain their original binary files. XLSX round-tripping is also best-effort: values, formulas, number formats, merged cells, and sheet structure are supported, while charts, images, pivot tables, macros, data validation, and complex formatting are not guaranteed to survive edits made through Univer or the OSS XLSX writer.

## Excel automation tools

- `office_excel_read`: inspect workbook metadata or read a bounded A1 range.
- `office_excel_edit`: apply typed server-side operations; return a new XLSX artifact in file mode, or a new native revision for a Spaces workbook.
- `office_excel_get_versions`: list immutable XLSX versions.
- `office_excel_restore_version`: restore an older file as a new version.
- `office_excel_get_file`: return the current XLSX artifact.

`office_excel_edit` supports setting values, setting formulas, clearing ranges, and creating, renaming, or deleting sheets. Use `expectedVersionNumber` for optimistic concurrency and `idempotencyKey` for safe retries.

For Spaces native workbooks, both fields are mandatory. Sheet rename/delete and
edits involving shared or array formula groups are rejected by the server-side
tool; use Univer for these operations so formula references remain intact.

## Spaces Spreadsheet resources

The existing plugin registers `office-editor.workbooks` as a content provider and
`office-editor.univer-workbook` as a resource editor. Spaces discovers its type,
creation action and compatible editor from the platform catalog. It has no
Spreadsheet-specific navigation or business logic.

| Contract | Value |
| --- | --- |
| Type | `xpert.spreadsheet` |
| Model / schema | `office-editor.univer-workbook` / `1` |
| Edit protocol | `office-editor.snapshot-cas` / `1` |
| Implementation | `office-editor.univer` |
| Editor | `office-editor.univer-workbook` |
| Remote View | `office.workbooks__office.workbook` |

The committed `OfficeSnapshot` and `OfficeDocument` head are the sole writable
authority. Each commit first writes an immutable Project file at
`.xpert/spreadsheets/<resourceId>/revisions/<revision>-<sha256>.json`, then commits
the snapshot and head in one database transaction. The file contains the full
Univer 0.25.0 workbook, not a lossy XLSX conversion. A missing file is recoverable
from the committed snapshot; an externally modified file is reported as a source
conflict and is not overwritten. Disaster recovery requires the database and
Project files to be backed up together.

Creation uses a stable UUID request ID. Writes lock the resource and compare the
expected revision; retrying the same request is idempotent, while reusing a request
ID for a different intent is rejected. Project ACLs are enforced on the server for
read, edit and lifecycle operations. Native resources cannot be written through
the original snapshot, Yjs, operation-queue or XLSX restore endpoints.

This is **version collaboration**, with explicit Save, conflict detection and
clean-client refresh. It does not merge concurrent edits or advertise real-time
cursors. A dirty client keeps its draft when another member or Assistant saves;
it can download the draft as JSON before explicitly reloading. Saved workbooks
reopen with the same identity. Unsaved browser-refresh/offline recovery is not
provided. The Assistant uses the existing `office_excel_read/edit` tools against
the same native resource and revision protocol. Formula results are recalculated
by Univer; server-side edits do not fabricate cached calculation results.

The outer controls use shared shadcn UI and English/Chinese language resources;
Univer keeps its professional editing UI and consumes host appearance through its
locale/theme APIs. There is no Univer upgrade or Pro dependency.

See [implementation plan](docs/PLAN_spaces_spreadsheet_20261026.md) and
[delivery and verification record](docs/DELIVERY_spaces_spreadsheet_20261026.md).
This integration requires the current platform Content Resources/Catalog and
resource-editor protocol v2 APIs. Validation used the local platform SDK build;
the older published `3.21.0` package alone does not contain these APIs.

## Validation

```bash
pnpm -C xpertai/apps/office-editor test
pnpm -C xpertai/apps/office-editor build
pnpm -C plugin-dev-harness build
npx -y node@20 plugin-dev-harness/dist/index.js --workspace ./xpertai/apps/office-editor --plugin @xpert-ai/plugin-office-editor --verbose
```

### Project file editor integration

`OfficeSpreadsheetFormat` registers `office.xlsx` with the generic `ContentEditorRegistry`. It owns XLSX parsing, validation, grid operations and serialization. `OfficeFileView` provides an independent `office.files__office.file` Remote View, using shadcn components, host theme variables and English/Chinese catalogs.

The platform routes authorized resource references and opaque versioned bytes through `platform.content.editors`; it does not expose spreadsheet-specific types. Spaces owns the library and file snapshots, not the editor. File mode preserves formulas without recalculation and uses compare-and-swap saves, not live CRDT merging. The existing native Office document engine remains separate.
