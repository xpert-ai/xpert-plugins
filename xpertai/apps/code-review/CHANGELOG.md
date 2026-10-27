# @xpert-ai/plugin-code-review

## 0.4.0

### Minor Changes

- 578b922: Bind repository automation to saved Project review pipelines and use the same platform dispatch for manual and webhook starts. Add a lightweight single-reviewer template, preserve PR snapshots across rounds, and navigate the inbox to the authoritative Project approval. Expose persisted upstream findings to verification tools and preserve GitHub App authorization in delegated pipeline work. Existing private records remain private; unbound legacy automation requires explicit configuration. Apply the additive repository-pipelines migration before deployment when schema synchronization is external.

### Patch Changes

- 578b922: Allow manual reviews and repository rules to select a compatible review template and configure its Assistants and parameters inline, without first saving a configuration in Project Tasks. Preserve optional reuse of saved configurations, immutable bindings, permission checks and human publication approval.
- 578b922: Unify Code Review into a compact list/detail workbench with PR grouping, version history, search and filtering, collapsible panes, and contextual in-app pipeline navigation. Add a resizable PR list with keyboard controls, width presets and responsive bounds. Preserve review visibility boundaries and surface run failure reasons alongside snapshots.

## 0.3.3

### Patch Changes

- e692449: Declare the Code Review Project type consistently in pipeline templates, the App contribution and the Assistant workspace defaults. Require Contracts and Plugin SDK 3.26.2 so production startup validates against the published project-type contract.

## 0.3.2

### Patch Changes

- ab498ed: Preserve Project runtime scope when pipeline operations access a saved review. Add authorized Workbench entry resolution for GitHub and local review subjects, allowing Project pipelines to open the exact review inside the current Assistant while rechecking Project and actor access.
- f1b700d: Require published SDK and Contracts 3.26.1 and pin development builds to the same release. Use the canonical Analytics, integration permission, Connector scope and connection command contracts instead of local SDK type extensions or platform dependency overlays. Preserve authorization checks for optional host capabilities and existing configuration migration behavior.

## 0.3.1

### Patch Changes

- 9dae0b7: Use one GitHub system integration for Code Review App credentials and workspace OAuth. Code Review now stores an integration reference, verifies Connector application provenance, and pins repository automation to the confirmed integration and App. GitHub Connector records the original OAuth Client ID and rejects application changes during callback or refresh.

  Upgrade the host configuration-read capability and pinned connection dialog first. Migrate inline App settings to a tenant-level GitHub integration, reauthorize older or mismatching shared connections, and revalidate repository rules. Includes an additive repository migration, English setup/migration documentation, and signed-webhook PostgreSQL acceptance coverage.

  Keep GitHub-specific OAuth selection and error guidance in Code Review. Request the generic host Connector command with an explicit authentication method and integration reference.

  Resolve the selected application through the built-in integration.readConfiguration(id) capability. The host owns configuration tenant and organization authorization; Code Review checks GitHub identity and review execution scope without configuration storage details in PluginContext. Reject unavailable capabilities without falling back to legacy runtime reads.

## 0.3.0

### Minor Changes

- 3cf6f30: Allow saving GitHub App configuration without a webhook secret. Treat omitted, null, empty, and whitespace-only values as unset, while preserving nonblank secrets exactly and requiring at least 32 characters when provided.

  Update the configuration form, setup guidance, and documentation to explain the optional field. Webhook deliveries still require a configured secret and a valid signature; saving without a secret does not enable unsigned deliveries.

## 0.2.0

### Minor Changes

- d08af69: Add Project Pipeline reviews with parallel correctness and security checks, finding verification, and explicit human approval before GitHub delivery. Persist scoped review evidence and delivery receipts, and include the pipeline database migration.

  Support importing local Git changes through the bundled export script and archiving approved review results without posting to GitHub.

  Require published `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk` 3.25.0 or newer, with development dependencies locked to 3.25.0 so clean builds and tests no longer depend on a local platform checkout.

### Patch Changes

- a19f02d: Preserve the trusted View host identity and resolve Agent execution identity from each tool invocation when accessing the GitHub connector. This fixes authenticated repository access and source reads when a conversation has not started or the execution is assigned after middleware construction.

  Keep View authorization separate from Agent execution context and exclude untrusted runtime scope fields from business inputs.

## 0.1.2

### Patch Changes

- eba0b4b: Declare the plugin's GitHub repository and monorepo directory so npm can validate the package against GitHub Actions provenance during publication.

## 0.1.1

### Patch Changes

- d257389: Add a Chinese 16:9 marketplace cover for Code Review, following the Meetings composition with space for the host's information overlay. Configure the app screenshot, declare the local asset in the plugin manifest, and include the branding assets and manifest in the published package.
