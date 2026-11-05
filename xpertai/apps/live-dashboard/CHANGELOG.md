# @xpert-ai/plugin-live-dashboard

## 0.5.0

### Minor Changes

- fbd2708: Add a Sources side panel with saved query configuration, parameter mappings, output fields and recent execution results. Inspect HTML components or standard charts and tables to open their declared sources without triggering business interactions. Extend Agent authoring with validated source metadata and stable component references.

  Export saved dashboard pages, definitions and bundled dependencies as integrity-checked archives. Import archives into independent drafts with explicit resource mapping, current-user query validation and preserved internal component IDs. Native resource mapping uses provider discovery extensions; Data Xpert users need the companion Analytics Data Xpert provider update.

  Keep complete query payloads restricted to definition editors, bound result previews to memory, and validate archive size, contents, dependency bytes and import-session scope. Include localized controls, authoring guidance and acceptance documentation.

### Patch Changes

- 5e06dea: Report malformed JSON input locations with the field, UTF-16 offset, line, column and offending character without echoing the payload. Distinguish syntax errors from valid JSON with an invalid object shape.

  Include expected and observed Binding IDs in HTML preflight failures and clarify how to preserve existing Binding identities and current-run preview receipts when updating filters. Failed preflight checks leave saved drafts and published versions unchanged.

## 0.4.1

### Patch Changes

- f6acf6b: Improve the project and dashboard picker with compact spacing, responsive sizing, and independent infinite scrolling. Search all authorized projects and dashboards on the server, and preview a project's dashboards on hover without changing the active project until a dashboard is selected.

  Show dashboard update times and deletion controls on hover, with keyboard and touch access. Support confirmed, revision-protected deletion from cross-project previews while preserving the current selection when another dashboard is deleted and clearing it when the selected dashboard is removed. Keep deletion available for selected dashboards outside the first loaded page, and preserve the target project's draft or published mode during navigation.

## 0.4.0

### Minor Changes

- a2abeaa: Allow manager-created authenticated organization shares of published Project dashboards to include non-Project members. Require the companion platform opt-in for link audiences; draft, edit, file and source-data permissions remain unchanged.
- 14f3270: Add optional Profit Atlas and Customer Brief document themes alongside Trend Workspace. Include reusable Agent guides, layout and chart components, distinct Superstore recipes, accessible selects and version-pinned theme libraries. Preserve existing Artifact identity and data contracts during requested visual upgrades.

  Bundle all three approved style prototypes and expose them after the cover in the App detail preview gallery, replacing the older onboarding screenshots.

- cffb399: Add project selection to the Live Dashboard View and synchronize it with the Assistant ChatKit project through the existing authorized host navigation. Use a two-column Project → Dashboard picker with independent search and pagination, a persistent active-project highlight, and New dashboard in the dashboard column header. Search all authorized dashboard display titles, including editor drafts, without exposing them to members. Keep publication and refresh as primary toolbar actions; move secondary actions and version history into More, with a compact draft/published badge. Search and paginate projects available to the current user and Assistant; isolate dashboard lists and clear stale targets on project changes.

  Keep the original dashboard authoring, version history, publication and sharing workflow inside the selected Project. Add the Live Dashboard project type and a project-required authoring Assistant template. Editors use revision-protected drafts, members consume published versions, and managers explicitly publish or share. Do not add a separate Project dashboard host or a plugin-specific delivery/review workflow.

  Use protected Artifact content while keeping Project membership and authenticated share audiences cumulative. Sharing never grants Project membership, draft access or source-data permissions. Keep exact published-version and draft targets synchronized with the Assistant.

  Requires the companion platform release providing protected Artifact content and draft publication authorization. Release that platform/SDK first and update the SDK dependency and lockfile before publishing this plugin.

- 91c5569: Add a governed Live Dashboard App setup, explicit authoring-template dependencies, and project-scoped quick-start prompts. Bundle regional sales, sales overview and production quality recipes with synthetic data, source, previews and verification steps; expose them through the existing new-dashboard empty state without changing saved dashboard identities or publication permissions.

  Add a matching Explore app cover and show three enterprise style prototypes in the App details, with documented paths to interactive project drafts.

  Order the three beginner examples before the advanced Superstore suite. Show concise starter labels while preserving the complete authoring instructions sent to the assistant.

- a2abeaa: Add the optional project-scoped Live Dashboard Monitor Assistant template and read-only inspection middleware. Register scheduler tools only on the monitor template and require the companion platform fix that reloads current run-as permissions for each execution.
- 14f3270: Add a versioned Superstore enterprise BI recipe with reproducible Tableau teaching data, Data Xpert semantic model/query plans, and three project-scoped dashboard pages. Preserve source attribution and distinct-order/customer and deduplicated-return semantics.

  Keep generated HTML readable within bounded file-tool lines and provide exact filter baselines. Allow the three-page authoring workflow to use the existing bounded maximum of 64 model calls.

- 14f3270: Add an Agent-readable Trend Workspace theme with a KPI rail, independently scaled trends, ranked charts and accessible two-line dropdowns. Package reusable CSS, icon, select and chart assets alongside complete Superstore recipes, with instructions for new data and safe updates of existing dashboards.

  Refine the host project/dashboard selector without changing its project synchronization or permission boundaries.

  Expose the same theme as a pinned document library so Agents author business layouts without repeating shared CSS/JS in large tool calls.

- 0ce88a1: Preserve the active dashboard across conversation turns, prioritize explicit Workbench selection and New actions, and require explicit new/copy intent before creating another dashboard. Apply edits by stable component IDs, retain unrelated bindings and HTML elements, and show a normal localized selection prompt when no dashboard is selected.

  Register the authenticated dashboard Artifact type with an explicit installation binding and support validated repair of legacy file bindings. Open the exact published dashboard in shared views and explain how private script dependencies can be prepared for authorized team sharing.

  Legacy type repair and publishing Analytics Definition visibility require the companion platform changes for xpert-ai/xpert#1280. Draft saving remains separate from human publication.

### Patch Changes

- 732768d: Temporarily enable unrestricted document networking for functional acceptance and align authoring guidance with preview and viewing. Refresh the selected draft from its latest saved revision while protecting unsaved edits and pinned published versions.

  Require published Plugin SDK and Contracts 3.30.0 for document networking and Artifact Content support; remove the temporary SDK patch.

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
