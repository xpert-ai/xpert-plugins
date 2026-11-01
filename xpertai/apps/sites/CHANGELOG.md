# @xpert-ai/plugin-sites

## 0.5.0

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

## 0.4.2

### Patch Changes

- 78fe538: Respect the Assistant's shared or user-isolated workspace policy when publishing Sites deployments, preserving host authorization and the resolved file reference.

## 0.4.1

### Patch Changes

- 4c0a7c6: Publish application covers using the platform's marketplace screenshot inheritance. Keep App overrides optional, synchronize portable manifest versions, and verify runtime/manifest screenshot metadata and bundled image assets before publishing.

## 0.3.3

### Patch Changes

- 7cc62cd: Expose the bundled applications in Xpert discovery with localized app descriptions, business categories, dedicated organization workspaces, and links to their Assistant templates. Keep portable and runtime metadata aligned, enable the Sites template for Xpert, and require compatible app configuration contracts.
