# @xpert-ai/plugin-office-editor

## 0.7.0

### Minor Changes

- 8117ba6: Integrate the existing Univer editor with the generic Spaces Spreadsheet catalog and resource editor protocol. Project-native workbooks use immutable JSON source snapshots, idempotent creation, permission-checked version saves, and the same CAS writer for Assistant tools. Keep existing XLSX, Docs and Slides flows; do not advertise snapshot collaboration as real-time cell merging.

### Patch Changes

- Require published contracts/plugin-sdk 3.28.0 for content catalog, project files and extensible resource integrations, and align development dependencies with the runtime peer requirements.

## 0.6.0

### Minor Changes

- 90bd390: Add Project-backed collaborative Spaces with file organization, knowledge search, resource references, subpages, and explicit Feishu document text-copy imports. Project permissions and Assistant bindings govern shared access.

  Add a Tiptap/Yjs Markdown editor with block actions, insert menus, tables, formulas, authorized images and attachments, presence, and save-aware navigation inside ChatKit Workbench. Add a separate version-checked XLSX file editor through the platform's generic content editor contracts.

  Share host-themed shadcn controls and centralized English/Simplified Chinese dictionaries across Remote Views, including accessible component labels.

  These features require the accompanying platform content contracts/runtime and ChatKit content commands. Existing published platform SDK packages do not yet provide the complete interface: release the platform packages, align plugin dependency ranges and the lockfile with those releases, then publish the plugins. Source validation with a local platform build does not establish compatibility with the currently pinned published packages. Feishu imports are local text copies, not remote writeback or bidirectional synchronization.

## 0.5.1

### Patch Changes

- 4c0a7c6: Publish application covers using the platform's marketplace screenshot inheritance. Keep App overrides optional, synchronize portable manifest versions, and verify runtime/manifest screenshot metadata and bundled image assets before publishing.

## 0.5.0

### Minor Changes

- 88c1f06: Publish refreshed application cover images and SVG/PNG icons, including bundled branding assets and marketplace screenshot metadata.

## 0.4.4

### Patch Changes

- 7cc62cd: Expose the bundled applications in Xpert discovery with localized app descriptions, business categories, dedicated organization workspaces, and links to their Assistant templates. Keep portable and runtime metadata aligned, enable the Sites template for Xpert, and require compatible app configuration contracts.
