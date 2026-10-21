# @xpert-ai/plugin-github-connector

## 0.2.2

### Patch Changes

- 9dae0b7: Use one GitHub system integration for Code Review App credentials and workspace OAuth. Code Review now stores an integration reference, verifies Connector application provenance, and pins repository automation to the confirmed integration and App. GitHub Connector records the original OAuth Client ID and rejects application changes during callback or refresh.

  Upgrade the host configuration-read capability and pinned connection dialog first. Migrate inline App settings to a tenant-level GitHub integration, reauthorize older or mismatching shared connections, and revalidate repository rules. Includes an additive repository migration, English setup/migration documentation, and signed-webhook PostgreSQL acceptance coverage.

  Keep GitHub-specific OAuth selection and error guidance in Code Review. Request the generic host Connector command with an explicit authentication method and integration reference.

  Resolve the selected application through the built-in integration.readConfiguration(id) capability. The host owns configuration tenant and organization authorization; Code Review checks GitHub identity and review execution scope without configuration storage details in PluginContext. Reject unavailable capabilities without falling back to legacy runtime reads.

## 0.2.1

### Patch Changes

- 98203eb: Support selecting or creating a GitHub system integration in the connector dialog. Resolve the selected application using the connection's persisted tenant and organization scope for authorization, callbacks and refresh, while retaining legacy credential compatibility. Declare the GitHub MCP resource so the host can route Agent Plugin connections through GitHub App OAuth or PAT instead of dynamic client registration.

  Deploy the companion platform connector update before enabling the new integration-selection and MCP adapter flows. Existing hosts retain their previous integration lookup behavior.
