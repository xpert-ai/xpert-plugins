# @xpert-ai/plugin-code-review

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
