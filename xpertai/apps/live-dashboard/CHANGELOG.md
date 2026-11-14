# @xpert-ai/plugin-live-dashboard

## 0.7.0

### Minor Changes

- 161d155: Discover dashboards through the platform conversation directory. Add source filters, server search, pagination and fixed-version permission labels to the Workbench picker. Open shared references through the generic host navigation command while preserving current Project scope and separate source editing permissions.
- c3437a7: Add explicit dataset/field/row analysis grants to published dashboards and declare fixed-version dataset bindings through the existing Artifact Type analytics extension. Preserve published control defaults and allowlists while platform Analytics orchestrates execution independently of rendering.
- 6148712: Add a beta new-dashboard starter with SDK navigation to data, templates and examples, including loading and navigation-error states. Show it in editable personal scope as well as project scope. Keep the explicit Assistant-analysis action and clear the previous edit target before sending. No bundled template content is added. Entry points and navigation contracts may change incompatibly during beta.
- 9a61fa6: **Beta:** Add Data views and reusable datasets are experimental. View identifiers, action APIs, payloads, and persisted formats may change incompatibly at any time during beta. Backward compatibility is not guaranteed; upgrades may require migrating or recreating dataset definitions.

  Add an on-demand Add Data Workbench view for browsing authorized analytics sources and managing reusable datasets. Support source discovery, query and field editing, reuse of existing dashboard bindings, live query previews, revision-aware saves, and confirmed recycling.

  Use shared shadcn controls and localized copy. Reset view state when its host scope changes, and ignore errors from requests belonging to the previous scope.

- 240119e: Add a `template-create` View action that generates a standard dashboard draft from an authorized, revision-checked reusable dataset. Validate field mappings, preserve parameter defaults, and reuse the normal dashboard query validation and draft save workflow. Generated dashboards own a copy of the binding; recycling the source dataset does not delete the dashboard.

  **Beta:** Generation contracts and preset semantics may change incompatibly at any time during beta. This foundation does not include a template catalog, example datasets, covers, publication, or library import/export.

- 11e1823: Add reusable dataset storage backed by platform Artifacts and managed draft files. Persist validated query bindings and control defaults, recheck source access before saving or previewing, and protect edits and recycling with draft revision checks.

  Register the dataset Artifact type with personal ownership and Project editor access policies. Keep dataset persistence independent of template recipes, catalog content, and public resource sharing.

- c3437a7: Separate the dashboard collection from single-document Workbench views. Resolve source dashboards through the content catalog, preserve document identity and unsaved edits across versions, and reuse the canvas with viewing controls for authorized group presentations.
- 091d543: Add ten example tasks, deterministic synthetic datasets, the hotel analysis template, regenerated covers and 86 non-executable catalog previews. Connect the Explore landing page and paginated V2 catalog to explicit ZIP imports; keep task preparation composer-only. Provide offline content-package exporters, provenance records and content tests without registering legacy catalog services. Resource and content contracts remain beta and may change incompatibly.
- c3437a7: Allow source-project managers to offer a fixed published dashboard to a group, inspect and revoke grants from the Share dialog. Group viewers use the same read-only dashboard renderer and current-viewer data permissions without joining the authoring project.
- 1c2cb4b: Add beta example preparation and generic template instantiation through existing Analytics, Workspace Files and Dashboard save APIs. Pin explicit dataset mappings/revisions, preserve template provenance, and recover interrupted submissions without duplicate drafts. Roll back failed input reservations so corrected requests can reuse their intent ID; guide unchanged tasks to pass recipe arguments without invented inputs. Guard composer handoffs against conversation changes. This batch contains no business template packages, covers or gallery screens. These beta contracts may change incompatibly; public attachment copying remains unsupported.
- 8cd2b7f: Add beta library resource, draft, version, attachment and import-job storage with SDK-managed files, strict portable ZIP validation, owner-scoped idempotency and transactional imports. Register resource catalog and file actions without adding template content or switching the gallery UI. Use existing Artifact and Workspace Files APIs without storage-provider settings or deferred shared-read extensions. Public resources with attachments remain unsupported until an authorized copy API is available. Task execution and directory views follow in later batches. These beta contracts may change incompatibly.
- 39c4301: Add a reusable resource detail dialog for fixed-version inspection, ZIP export, confirmed publication, withdrawal and composer-only task preparation. Support typed Dataset mappings and template parameters. Isolate authorized preview-image reading from bundled catalog artwork. These UI and action contracts are beta and may change incompatibly; catalog entries, sample content and page integration remain separate changes.
- 9a67835: Connect the example, template and public-dataset views to paged resource queries, ZIP imports and fixed-version details. Support private/public audiences, search, template-kind and appearance filters, persisted navigation and composer-only task preparation. Export the shared Sparkles icon used by directory cards. Bundled catalog content and cover artwork remain separate. These views and navigation contracts are beta and may change incompatibly.
- 16f3eb7: Add a reusable resource ZIP import dialog with conflict previews, explicit confirmation, cancellation and resumable job inspection. Use shared shadcn controls and localized copy. Directory-page integration and template content are separate changes. The import UI and host action contracts are beta and may change incompatibly.
- 1773a4e: Add optional standard-dashboard theme settings and map host color/font tokens into the isolated renderer. Follow host theme changes without modifying saved bindings or query results. HTML-authored dashboards retain their own presentation styles.

  **Beta:** Theme keys, token mappings, and the persisted `visualTheme` field may change incompatibly at any time during beta; backward compatibility is not guaranteed.

### Patch Changes

- c3437a7: Use platform resource navigation for conversational dashboard viewing and retain dashboard_open for source editing.
- c3437a7: Show a retryable group authorization error when loading fails and reserve the no-groups hint for a successful empty result.
- 998d99d: Reuse the Live Dashboard icon for project resource types and shared artifact resource cards.
- 920483a: Reuse authored catalog covers in resource details and add a production-iframe regression harness for previews, ZIP import, ten composer handoffs, Dataset mapping and responsive layouts. Align the harness with the V2 provider and preserve generic execution fixtures. The resource-library interfaces remain beta and may change incompatibly.
- 33b6b31: Add dashboard_present_analysis to display a verified, reauthorized query as a bounded inline Widget without creating a dashboard. Preserve exact table values, mark partial results, and reuse generic group result projection.
- 418a48f: Document the beta template-to-Agent handoff in the live-dashboard skill: preserve prepared arguments, wait for a successful draft receipt, recover the same request on retry, and respect explicit data mappings and provider policy. Connect resource library feature guides without bundling template content. These beta contracts may change incompatibly.
- 1c0f139: Reload mounted dashboard views after project or conversation context changes by renewing the host handshake. Deduplicate React and React DOM in remote view bundles to preserve the shared component hook dispatcher.

  Include plugin assets in build freshness checks and reject mismatched package and portable manifest versions.

- c3437a7: Widen the sharing dialog for data authorization forms while preserving viewport gutters and vertical scrolling. Document deferred resource-sharing decoupling proposals without changing authorization behavior.

## 0.6.2

### Patch Changes

- 00cdeca: Keep the selected working draft or published version during manual and periodic refresh. Preserve draft selection after publication and follow subsequent Assistant saves without switching pinned historical versions.

  Defer Assistant save notifications during navigation and editing, keep catalog refreshes independent of the selected document mode, and prevent late refresh responses from replacing the editor's saved revision.

## 0.6.1

### Patch Changes

- dcb272a: Show draft, published-version and unsaved dashboard states, and reliably select share URLs for copying with localized failure feedback.

## 0.6.0

### Minor Changes

- 61e962f: Support a default authoring capacity of 32 Bindings and a storage ceiling of 64, with installation policy that preserves historical dashboard maintenance. Add incremental source queries, bounded scheduling, searchable Sources with individual refresh and bounded previews, batch Agent validation, and durable scoped save validation with progress, idempotency and recovery.

  Require published SDK/contracts 3.33.0 and use its Artifact Document scheduler and grouped query runtime directly, removing the temporary SDK backport. Live source dispatch remains limited to 60 per minute; immutable Sandbox snapshot replay has a separate bounded interaction budget.

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
