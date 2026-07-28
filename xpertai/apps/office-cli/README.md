# OfficeCLI

`@xpert-ai/plugin-office-cli` is an independent Xpert system app plugin that keeps native DOCX, XLSX, and PPTX files as the authoritative document state while exposing the OfficeCLI engine through a visual Workbench and Agent middleware tools.

It does not depend on or replace `@xpert-ai/plugin-office-editor`.

## Capabilities

- Create and import native `.docx`, `.xlsx`, and `.pptx` files.
- Render OfficeCLI HTML previews inside an isolated Xpert Workbench iframe.
- Select renderer elements that expose stable OfficeCLI paths.
- Click rendered text, cells, or shapes and edit their content in an inline Chinese editor inside the preview.
- Save direct edits back to the native Office file through OfficeCLI.
- Permanently delete documents and their stored Workspace File versions from the Workbench after confirmation.
- Keep the OfficeCLI L1/L2/L3 command model available to Agent tools without exposing a raw command console in the Workbench.
- Use `batch`, `dump`, `merge`, validation, issue inspection, and raw OOXML fallback.
- Store the current native file at a stable sandbox-visible Workspace File path under `/workspace/files/office-cli/documents/<documentId>/`.
- Store hidden recovery snapshots in `.versions` while retaining only the latest five snapshots per document.
- Restore an older version without deleting history.
- Return native Office files as Agent artifacts.
- Load OfficeCLI's pinned professional Word, Excel, financial-model, dashboard, and PowerPoint workflow guidance for the Agent.
- Define real Word Title/Heading/TOC styles, repair legacy heading references, create a native clickable TOC, and enable TOC field updates when Word/WPS opens the file.
- Install an OfficeCLI Skill and Assistant template.

## Architecture

```text
OfficeCLI Workbench / Agent tools
                |
       OfficeCliService
        |             |
Workspace Files    OfficeCliRuntimeService
        |             |
current + snapshots   pinned OfficeCLI binary
```

The Workbench never converts the authoritative file to a Univer snapshot. Preview HTML is generated from the current native file and treated as a derived view.

Each document has one stable current file:

```text
/workspace/files/office-cli/documents/<documentId>/<fileName>
```

This is the same runtime workspace tree used by Xpert sandbox and file tools.
Successful saves overwrite that stable current file and create a separate hidden
recovery snapshot:

```text
/workspace/files/office-cli/documents/<documentId>/.versions/v000001-<checksum>.<ext>
```

Existing records stored in the plugin's legacy `office-cli/.../versions` folder
remain readable and migrate lazily to the standard `files/...` tree on their next
successful save.

The Workbench `delete_document` action is a permanent aggregate delete. It removes the scoped document and version records and attempts to remove every corresponding Workspace File. The UI requires an explicit confirmation before invoking it.

Preview refreshes are coalesced by immutable version, keep the last successful preview visible while a new preview is generated, and stop waiting after 45 seconds with an actionable retry message. The OfficeCLI renderer itself is bounded to 40 seconds so the server can return an error before the Workbench watchdog expires.

## Binary runtime

The plugin pins OfficeCLI `v1.0.142`. Release asset names and SHA-256 digests are recorded in `assets/officecli-release.json`.

Resolution order:

1. `OFFICECLI_BINARY_PATH`, when configured.
2. A checksum-verified binary in `OFFICECLI_CACHE_DIR`.
3. A checksum-verified binary in Xpert's persistent per-user cache.
4. A checksum-verified download from the pinned GitHub Release.

The default cache survives operating-system restarts:

- macOS: `~/Library/Caches/xpert/office-cli/<version>`
- Linux: `${XDG_CACHE_HOME:-~/.cache}/xpert/office-cli/<version>`
- Windows: `%LOCALAPPDATA%\xpert\office-cli\<version>`

The plugin prewarms and validates this runtime during plugin bootstrap. Downloads
are retried within a bounded ten-minute preparation window, and preview requests
retry preparation if bootstrap could not reach GitHub. For production systems
that cannot access GitHub Releases, provision the pinned executable in the
deployment image and set `OFFICECLI_BINARY_PATH`; this removes the first-start
network dependency entirely.

Supported assets:

- Linux x64 and ARM64
- Alpine Linux x64 and ARM64 (auto-detected; `OFFICECLI_ALPINE=1` can force selection)
- macOS x64 and ARM64
- Windows x64 and ARM64

OfficeCLI auto-update and automatic resident mode are disabled for plugin executions. Each operation runs in a bounded temporary directory and receives a managed copy of the current Workspace File.

## Safety

- Child processes are spawned with argument arrays, never through a shell.
- User commands cannot control the authoritative input/output file paths.
- CSV/TSV import is accepted through stdin; merge data must be inline JSON.
- Media properties accept inline data URIs, not server file paths or external URLs.
- `install`, `config`, `mcp`, `watch`, `open`, and `close` are not document commands exposed by the plugin.
- `raw-set` and `add-part` require `dangerousConfirmed=true`.
- Output, argument, file size, download size, and execution time are bounded.
- Every stored version is SHA-256 verified before execution.
- Writes support optimistic concurrency through `expectedVersionNumber`.

## Agent tools

- `officecli_create_document`
- `officecli_list_documents`
- `officecli_read_document`
- `officecli_execute`
- `officecli_get_versions`
- `officecli_restore_version`
- `officecli_get_file`
- `officecli_help`
- `officecli_load_skill`
- `officecli_apply_word_design`

## Development

```bash
pnpm -C xpertai exec nx build @xpert-ai/plugin-office-cli
pnpm -C xpertai exec nx test @xpert-ai/plugin-office-cli
pnpm -C plugin-dev-harness build
node plugin-dev-harness/dist/index.js \
  --workspace ./xpertai \
  --plugin @xpert-ai/plugin-office-cli \
  --verbose
```

For a real runtime smoke test, either set `OFFICECLI_BINARY_PATH` or allow the pinned binary download. A configured binary must be executable by the Xpert server process.

## Upstream

OfficeCLI is developed at https://github.com/iOfficeAI/OfficeCLI and licensed under Apache-2.0. The Xpert plugin code in this repository follows the repository AGPL-3.0 license.
