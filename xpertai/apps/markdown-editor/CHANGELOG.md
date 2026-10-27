# @xpert-ai/plugin-markdown-editor

## 0.2.0

### Minor Changes

- 90bd390: Add Project-backed collaborative Spaces with file organization, knowledge search, resource references, subpages, and explicit Feishu document text-copy imports. Project permissions and Assistant bindings govern shared access.

  Add a Tiptap/Yjs Markdown editor with block actions, insert menus, tables, formulas, authorized images and attachments, presence, and save-aware navigation inside ChatKit Workbench. Add a separate version-checked XLSX file editor through the platform's generic content editor contracts.

  Share host-themed shadcn controls and centralized English/Simplified Chinese dictionaries across Remote Views, including accessible component labels.

  These features require the accompanying platform content contracts/runtime and ChatKit content commands. Existing published platform SDK packages do not yet provide the complete interface: release the platform packages, align plugin dependency ranges and the lockfile with those releases, then publish the plugins. Source validation with a local platform build does not establish compatibility with the currently pinned published packages. Feishu imports are local text copies, not remote writeback or bidirectional synchronization.
