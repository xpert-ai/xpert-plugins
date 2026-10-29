# @xpert-ai/plugin-spaces

## 0.3.1

### Patch Changes

- eeee40e: Declare the public GitHub repository and npm access for Spaces so its existing release workflow can publish with trusted-publisher provenance.

## 0.3.0

### Minor Changes

- 8117ba6: Register native presentations, static sites and live dashboards in the Project content catalog. Discover types and create implementations dynamically in Spaces, with logical folder placement, editor preferences and permission-checked knowledge projections. Use current Project membership for shared resources; preserve personal ownership boundaries and native Markdown identities. SpaceItemCatalog exposes native pages and files without introducing a historical-data migration layer.

  Add self-contained Presentation Studio source backup/recovery, lifecycle and collaboration handling; Sites source editing and full-package version restore with concurrency checks; and Live Dashboard draft conflicts, viewer-specific partial query results and fixed-version sharing. Expose each implementation as an optional Assistant capability. Deploy with the coordinated host resource catalog and Plugin SDK release, including its capability composition and collaboration-client changes.

  Expose a revision-checked presentation metadata rename tool to Assistants. Preserve slide content and the collaboration document identity while broadcasting the change, recording the Agent actor and updating editing presence. Subscribe the document picker and Workbench tab title to shared metadata, including changes made from other conversations; retain pending local edits and advance the revision on remote updates.

  Propagate recorded presentation source-file failures to the platform's durable materialization recovery, preserving accepted edits and the previous immutable snapshot until a retry succeeds.

  Let Presentation Studio action groups wrap to the Workbench pane width and fit the slide canvas without a fixed minimum viewport, preserving access to export and inspector controls in narrow panes.

  Align Spaces content labels with I18nObject and the shared remote-view localization adapter, accepting optional translations and falling back to English when needed.

  Complete duplicate/recycle/restore operations across the three types. Copies retain source content with independent identities and omit publications, credentials and live query results. Add safe revision-bound outline cards, list/grid switching, provider templates, implementation selection and an explicit handoff to the current Assistant. Display source synchronization independently of collaboration status and refresh opted-in live dashboards only while their view is active. Keep UI text in shared-adapter locale catalogs, including optional Traditional Chinese catalogs.

### Patch Changes

- Require published contracts/plugin-sdk 3.28.0 for content catalog, project files and extensible resource integrations, and align development dependencies with the runtime peer requirements.

## 0.2.0

### Minor Changes

- 90bd390: Add Project-backed collaborative Spaces with file organization, knowledge search, resource references, subpages, and explicit Feishu document text-copy imports. Project permissions and Assistant bindings govern shared access.

  Add a Tiptap/Yjs Markdown editor with block actions, insert menus, tables, formulas, authorized images and attachments, presence, and save-aware navigation inside ChatKit Workbench. Add a separate version-checked XLSX file editor through the platform's generic content editor contracts.

  Share host-themed shadcn controls and centralized English/Simplified Chinese dictionaries across Remote Views, including accessible component labels.

  These features require the accompanying platform content contracts/runtime and ChatKit content commands. Existing published platform SDK packages do not yet provide the complete interface: release the platform packages, align plugin dependency ranges and the lockfile with those releases, then publish the plugins. Source validation with a local platform build does not establish compatibility with the currently pinned published packages. Feishu imports are local text copies, not remote writeback or bidirectional synchronization.

- 4d8ab94: Register Spaces as an optional Assistant capability with a quick creation switch, localized metadata and tool-calling model requirements. Enabling it composes the primary Agent middleware and managed instructions; Project creation, bindings and authorization stay with the platform. Requires the platform capability catalog with supportsQuickCreation metadata for Cloud creation.
