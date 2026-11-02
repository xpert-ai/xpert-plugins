# @xpert-ai/plugin-live-dashboard

## 0.3.1

### Patch Changes

- dc1c17d: Contribute a Live Dashboard Assistant template with editable prompt workflow shortcuts, provide an explicit import helper for existing Assistants, and select allowed Providers from the current user's accessible data sources.

## 0.3.0

### Minor Changes

- 39300e2: Add confirmed deletion to the dashboard picker. Recycle saved dashboards through the platform revision and permission checks, revoke shared links, and clear selected dashboard context and navigation after deletion.
- e51ac7f: Add twelve built-in prompt workflows to the LiveDashboard middleware: standard and HTML authoring, save recovery, and read-only source, metric and interaction checks. Expose them through the existing slash-command picker with localized labels and editable user arguments.

### Patch Changes

- 86ecb26: Return HTTP 400 for dashboard deletion requests with missing confirmation or invalid input, without mutating the dashboard.
- 22dc65b: Isolate HTML preflight interaction scenarios so synthetic select and button checks do not exhaust one document's query quota. Follow buttons revealed or enabled by prerequisite actions, reuse successfully loaded static resources within the validation, and cancel on a bounded deadline. Preserve the normal query/concurrency limits and initial-load, shared-filter and refresh validation in each scenario.

## 0.2.0

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
- 8904321: Build Live Dashboard with published SDK and contracts 3.27.0, replacing the local
  Artifact document network-policy backport with the released browser runtime.

  Allow scripts, styles and fonts from the declared HTTPS origins in both the viewer
  and HTML preflight, and reject saves when required online resources fail to load.
  Discover missing query contracts before previews, preserve actionable diagnostics,
  and bound repeated or concurrent failed previews so the Agent cannot loop indefinitely.

## 0.1.4

### Patch Changes

- 3afcd71: Use canonical Analytics sources: database connections, immutable Definitions and script Artifacts. Move the five native Providers out of DataSource Types, expose their configuration entries and update Live Dashboard authoring, rendering and sharing. Requires published platform Contracts/SDK 3.26.1 containing the canonical Analytics API; no historical Binding decoder or migration is included.

  Generate Files/REST/MCP/data-xpert Definitions through the Live Dashboard Agent using authorized input discovery, actual-data validation and immutable registration receipts.

  Fix dashboard viewer parsing of canonical Definition and Artifact source references so Agent-generated drafts can be opened, filtered and published.

- f9633aa: Fix missing live dashboard Workbench icons by using a self-contained SVG identity icon for tabs and menus. Reuse the same design for middleware tools and resource cards without depending on host icon fonts.
- f1b700d: Require published SDK and Contracts 3.26.1 and pin development builds to the same release. Use the canonical Analytics, integration permission, Connector scope and connection command contracts instead of local SDK type extensions or platform dependency overlays. Preserve authorization checks for optional host capabilities and existing configuration migration behavior.

## 0.1.3

### Patch Changes

- b025616: Allow LiveDashboard to initialize when legacy hosts omit optional middleware configuration, while retaining strict validation of explicit invalid options and provider lists.

## 0.1.2

### Patch Changes

- 1056034: Preserve the Project navigation target when opening dashboards, switching versions, and following Assistant tool results. Revalidate data source sharing compatibility before publishing a new version followed by an active team share, preserving the previous published version and link when a draft contains private or unavailable dependencies.

## 0.1.1

### Patch Changes

- 19ac008: Publish the first patch release of Live Dashboard and the analytics providers through the GitHub Actions `release-plugin.yml` trusted publisher after the manual npm 0.1.0 bootstrap release.

  Ship the packages from the xpertai workspace with repository metadata for trusted publishing, published SDK/contracts 3.25.0, and the published Data Analytics renderer. Clean builds resolve the required runtime capabilities without local platform or cross-workspace links.
