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
the snapshot and head in one database transaction. The file contains the versioned
Xpert workbook envelope, with compatibility extensions retained by the Univer
adapter. Missing projections are rebuilt from the committed snapshot. Damaged
projection bytes are copied into a hash-addressed quarantine before compare-and-swap
repair; a concurrent file change rejects the repair. A mismatching database head
or checksum fails closed. Recovery does not create a business revision. Back up
the database and Project files together.

Native workbooks declare provider write ownership in the Content Catalog. Ordinary
Workspace upload/write/delete APIs reject mutations of their source tree; the
authorized provider Runtime capability maintains projections. Existing catalog
entries need the packaged `migrations/20261112-workbook-write-ownership.sql`
backfill before generic Workspace writes reopen. Pause writes, back up the database,
run the SQL in a transaction, then refresh provider metadata. The script validates
exact provider/model/Project/path boundaries, covers archived rows, is idempotent,
and aborts all changes if legacy metadata is invalid. Refresh invalid entries with
the provider and retry; do not invent ownership from filenames. Do not remove these
protections during rollback. Production execution is a separate release step.

Creation uses a stable UUID request ID. Writes lock the resource and compare the
expected revision; retrying the same request is idempotent, while reusing a request
ID for a different intent is rejected. Project ACLs are enforced on the server for
read, edit and lifecycle operations. Native resources cannot be written through
the original snapshot, Yjs, operation-queue or XLSX restore endpoints.

Native workbooks use an independent operation protocol with explicit Save. Concurrent
changes to different cells merge; same-cell changes, ABA, legacy snapshots and
structural transitions reject stale writes. The existing Collaboration transport
broadcasts authoritative revisions and bounded presence/selection updates. Reconnect
reads a bounded operation log, with snapshot fallback at structure barriers or
outside the 100-revision merge window. Dirty clients retain their local drafts.

Version history supports preview, full restore as a new revision, and selective
undo of the current actor's cell changes. Selective undo preserves other cells,
rejects subsequent changes to affected cells (including ABA), and records the
target revision. It uses the same writer and idempotency checks as normal saves.
Structural/legacy revisions require full restore. The Assistant uses the existing
`office_excel_read/edit` tools against the same native resource. Univer recalculates
formula results; server-side edits do not fabricate cached calculation results.
Stable-axis structural transformation and formula-reference AST work remain pending.

Selection context v2 separates formula text from `calculatedValue`. The editor
waits for Univer's latest result application, rejects stopped/incomplete sessions,
and binds the browser result to the server base revision and local edit generation.
Edits, resource changes or a new remote revision during that wait reject the
reference. Values remain bounded to 200 selected cells and 32 KB, and never become
persisted formula inputs or business certification evidence.

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

### Workspace spreadsheet files

The plugin requires `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk` 3.39.0 or later in the 3.x series for workspace file support. It registers `office.xlsx`, `office.xls`, `office.csv` and `office.tsv` with the generic Content Editor registry. Project files and standalone Assistant files open the same `office.files__office.file` Workbench view. The view reuses the native Office Univer engine and host theme, translations and dirty-close lifecycle.

The host owns authorization, workspace scope, file ownership, download references and atomic compare-and-swap writes. A resource provider remains the sole writer for its owned paths; unmanaged files retain their original path. A rejected save keeps the local draft and its original revision. Native Office workbooks retain their existing version, CRDT, history and idempotency protocol.

XLSX saves patch cell values, formulas and calculated results in the original package, preserving unrelated formatting, tables, validation and charts. Unsupported formatting and structural commands are blocked. CSV and TSV store one worksheet of values. Identifiers such as `00123`, long numeric codes and date-like text retain their spelling when another cell is edited. Formulas entered in the editor save as calculated values. XLS preserves visible, hidden and very hidden worksheet states. XLS workbooks with formulas open read-only because the SheetJS XLS writer cannot preserve their formulas. Read limits are 20 MiB and 100,000 populated cells.

### Local workbook drafts and offline saves

The workbook uses the host's `workbench.content.draft` bridge. The host obtains an actor/tenant/organization/Project/view/resource binding from the platform before reading browser storage. Draft content stays in IndexedDB on the host origin; opaque plugin iframes do not receive direct storage access or the namespace. Reopening a draft requires an online authorization check. This is recovery for previously loaded editing sessions, not an offline application shell.

Editing retains a local draft after a short debounce. Only explicit Save creates a queued submission, and that exact request is persisted before sending it. After a lost response, retry resolves the original idempotent request before rebasing later edits. Same-cell or structural conflicts preserve the draft and require review. A pending save retries while connected; unsent edits remain drafts until Save. Successful clean saves remove their local queue entry.

Each browser origin retains at most 20 drafts, 20 MiB per draft and 50 MiB total (UTF-8 bytes). Quota errors never evict unsaved data. The status panel distinguishes a retained draft from a pending local write. The Local drafts menu supports recovery and confirmed deletion. Competing tabs use compare-and-swap; conflicts fork a separate draft instead of replacing another tab's content. Browser data deletion/private-session closure removes these local copies. Export a local copy when storage is unavailable.

Cell presence carries the canonical `baseRevision`. A peer range is drawn only on that exact revision. Dirty/imported/structural drafts suppress coordinate presence until saved; collaborator names remain visible. A timestamp never substitutes for the coordinate basis.

The platform coalesces operation revisions and ephemeral presence per socket, with one live authorization check in flight. Revision/presence delivery is volatile and recovered by periodic sync/heartbeat. Durable Yjs deltas retain order in a queue capped at 64 messages / 2 MiB; overflow or a blocked transport disconnects the client so it resynchronizes persisted state. Incoming sync has one request in flight; presence has one write and one latest patch with 120 ms spacing.

Workbook transactions enter a queue before acquiring a database connection. Each DataSource admits at most two active workbook transactions, serializes each document locally, and retains at most 64 waiting writes / 32 MiB of input. The shared queue covers separate tenant plugin copies and preserves each caller's async identity. Database row locks and fresh ACL checks still arbitrate writes across nodes. Queue overflow returns `503 office.workbook_busy`; a saved pending intent can retry with the same request ID. The deployment must retain pool capacity for the host's ACL/file capabilities; the tested local pool has ten connections.

Local integration requires the matching platform, ChatKit/Cloud/Data Xpert host, and Xpert SDK source builds containing this bridge. Registry SDK 0.24.0 alone does not contain the new API; the source pairing is recorded in the local deployment receipts. Package publication/version adoption is a separate release step.

### Native workbook backups

The Import / Export dialog downloads `.xpert-workbook.json` archives of the saved
canonical workbook, including opaque extensions. The archive includes its resource
ID, source revision and a SHA-256 checksum. This detects corruption; it is not a
signature or authorization grant. Restore accepts the same resource ID only, stages
an unsaved draft, and uses the ordinary versioned writer on Save. It does not
replace history, restore permissions, or silently move the head backwards. CSV/XLSX
remain interoperability exports with their existing fidelity limitations.

Full disaster recovery still requires consistent database and Project-file backups;
a native archive contains the workbook body only. A binary rollback must first
freeze writes and verify readable compatible snapshots. Never point an older
writer at a new canonical envelope.

### XLSX compatibility boundary

| Feature | Native XLSX import/export |
| --- | --- |
| Values, formulas (including absent caches), Unicode sheet names, hidden sheets and merged ranges | Preserved within the declared size limits |
| Number formats stored inline or in the Univer style table | Resolved and preserved |
| 1900-system dates and times | Numeric serials and fractional days retain their number formats; formula arithmetic remains numeric |
| 1904 date system | Import rejected; convert in the source application first |
| Charts, images, macros, pivots, validation, named ranges, external links and complex styles | Not preserved by this adapter; keep the source file |
| Complete native workbook payload and opaque extensions | Use the native backup format instead of XLSX |

The browser stages imports as drafts. Review the result before Save. XLSX exports
keep formulas but do not claim a new server-side recalculation.

### Stable row/column identity and structural edits

The **Rows, columns and sheets** menu submits `xpert.workbook.operations@2` through
exactly the same authorized, locked, idempotent writer as cell edits. Its first
successful operation upgrades that workbook to `xpert.workbook` schema 2; existing
schema 1 histories remain readable. Schema 2 stores compressed identity spans, so
one million empty rows do not allocate one million IDs. Old protocol writers are
rejected for upgraded workbooks. Restore creates a new revision and a fresh identity
epoch, including when the selected historical snapshot is schema 1.

Supported operations are row/column insertion and deletion, sheet rename, whole-row
reordering/sorting, and merge/unmerge. Stale **cell** edits can follow their original
row/column across these operations. Deleted targets, concurrent structural edits,
ABA changes, merge-boundary changes and competing cell edits remain conflicts. The
journal records the applied coordinates so other clients replay the same operation.
Native editor structural commands and opaque snapshot replacement remain strict CAS
barriers and start a new identity epoch; their coordinates are never guessed.

The engine-independent reference AST handles A1 references, absolute/mixed references,
quoted Unicode sheet names, rectangular ranges and whole-row/column ranges. Insertions
expand interior ranges; deletions shrink surviving edges or produce `#REF!`. It is a
reference transformer, not a formula evaluator. Names, structured/external/3-D
references, dynamic `INDIRECT`, shared/array formulas, out-of-grid references, frozen
panes and opaque engine resources reject the whole structural operation. No partial
mutation is committed. This boundary follows the reference grammar in
[MS-XLSX Formulas](https://learn.microsoft.com/en-us/openspecs/office_standards/ms-xlsx/3d025add-118d-4413-9856-ab65712ec1b0).

Whole-row sort orders input values by number, boolean, text and empty value, with
stable ties; descending reverses nonempty values and leaves empty rows last. Text
uses deterministic UTF-16 ordering. Formula sort keys are rejected because persisted calculation caches are
not authoritative. References follow original row identities. A range that would
become disjoint is rejected rather than widened to unrelated cells. Partial-range
sorting stays in the native editor under a structural barrier. Merge refuses to
hide populated subordinate cells or overlap another merge.

Rollout: upgrade only after compatible clients and this writer are active. An old
binary must not write schema 2. Roll back by freezing writes, retaining DB/Project
backups and verifying a compatible export; do not drop identity metadata in place.
Native backup restore preserves workbook inputs/extensions while the writer creates
a fresh identity epoch. Maximum lag remains 100 revisions, structural permutations
and identity spans are bounded to 10,000, and existing workbook size limits apply.

Evidence-derived native documents and presentations retain a source-access guard pinned to their immutable first snapshot. Every native read/write, Catalog extraction/authorization and user-facing collaboration operation rechecks the evidence Provider under the current actor. Editing or removing provenance fields in a later snapshot cannot remove this guard. Missing/malformed origin or unavailable evidence fails closed; ordinary non-evidence documents retain their existing behavior. Source changes require an explicit new evidence snapshot and a new converted document; previous human edits and snapshots are retained.
