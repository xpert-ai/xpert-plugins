# Code Review

Installable Xpert app for GitHub PR review in the right-hand Workbench panel. Built with Shadcn UI + Tailwind CSS. Includes immutable diff snapshots, private AI findings, viewed files, checks, repository policies, a review inbox, automatic GitHub App review comments, and explicit manual submission.

See [automatic PR review setup](docs/automation.mdx), [setup and usage](docs/index.mdx), [architecture](docs/architecture.mdx), and [validation](docs/verification.mdx).

## Configure automatic reviews

Automatic reviews require three steps: an administrator configures the GitHub App, a user connects their GitHub account and grants repository access, and the user enables repository review rules in Code Review. Saving the plugin configuration alone does not enable automatic reviews.

### 1. Install and initialize

- Install `@xpert-ai/plugin-code-review` at its declared `system` level, using tenant scope in the Default tenant.
- Initialize Code Review from the application catalog with an existing, available model. Confirm that the generated Assistant is published and can run.
- Install `@xpert-ai/plugin-github-connector` in the application's organization to connect users' GitHub accounts. Select the plugin installation scope separately from the application's organization and workspace scope.
- Provide a public HTTPS API origin, such as `https://api.example.com`, that GitHub can reach. Route the webhook path below to the Xpert backend. GitHub cannot deliver events directly to `localhost`.

For manual viewing and AI review of public PRs, you can leave the plugin configuration empty. Private repository access and manual GitHub review submission still require a GitHub connection in the current workspace.

### 2. Set up the GitHub App

In your GitHub account or organization, open **Settings → Developer settings → GitHub Apps** and create or edit the App for automatic reviews.

1. Record the numeric **App ID** from its settings page and the actual `<slug>` from its public URL, `https://github.com/apps/<slug>`.
2. Generate and download a PEM private key through **Credentials → Key pairs → New key**. Older interfaces may show **Private keys → Generate a private key**. See [Managing private keys for GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).
3. Under **Webhooks**, select **Active** and enter the complete **Webhook URL**:

   ```text
   https://api.example.com/api/code_review/github/webhook
   ```

   Replace the example domain with your public API domain. For webhook-triggered reviews, create a random **Webhook secret** of at least 32 characters and enter the same value in GitHub and the GitHub system integration. You can leave the secret empty to save the integration while preparing setup, but webhook deliveries will be rejected until a secret is configured. To generate a 64-character secret locally:

   ```sh
   openssl rand -hex 32
   ```

4. Under **Repository permissions**, set **Contents: Read-only** and **Pull requests: Read & write**. Under **Subscribe to events**, select **Pull request**.
5. Use **Install App** to install the App on the target account or organization and grant access to the repositories you want to review.

### 3. Configure one GitHub system integration

Open **Settings → System Integration** at **tenant scope** in the Default tenant where the system plugin is installed. Create or edit a `github` integration for this App:

| Integration option | Value |
| --- | --- |
| `appName` | A display name for the App. |
| `appSlug` | The lowercase URL identifier from `https://github.com/apps/<slug>`, not the display name. |
| `appId` | The numeric GitHub App ID, not the Client ID or Installation ID. |
| `clientId` / `clientSecret` | The same App's OAuth Client ID and Client Secret. |
| `privateKey` | The complete PEM contents, including the BEGIN/END lines; not a file path. |
| `webhookSecret` | The same secret configured in GitHub, at least 32 characters. Optional while preparing setup; required to accept webhook events. |

Configure the App's **User authorization callback URL** as `https://api.example.com/api/connector/oauth/callback` and its **Webhook URL** as `https://api.example.com/api/code_review/github/webhook`. Set the host's `API_BASE_URL` to the public API origin. OAuth authorization and App installation are different grants for this one App.

Then open **Plugins → Code Review → Configuration** and select that **GitHub system integration**. The plugin stores only this reference:

```json
{
  "githubIntegrationId": "00000000-0000-4000-8000-000000000001"
}
```

Replace the example UUID with the integration selected in the UI. All organizations using this system plugin must belong to its installation tenant; organization-scoped and other-tenant integrations are not eligible. An unavailable or incomplete selected integration stops automatic reviews; the plugin never searches for a replacement.

The integration may be saved without a webhook secret, but signed and unsigned webhook deliveries are both rejected until a secret is configured. Blank secret fields on an existing integration preserve the saved value; enter a new value to rotate it. Credentials are resolved again for each operation, so key/secret rotations do not require copying them into the plugin. Never commit credentials to source control.

### 4. Connect repositories and enable rules

1. In Code Review, open **Connect repositories** and click **Connect GitHub**. Complete the platform's OAuth dialog, which is pinned to the selected system integration. Automatic repository setup requires GitHub App OAuth from that integration. PATs remain available for manual connector use. The current connection is shared within the workspace.
2. Confirm that the connected account has write or admin permission on the target repository and that the GitHub App is installed with access to it. The account connection verifies the user's repository permissions; the App installation receives events and publishes reviews. Both are required.
3. Enter `owner/repository`, click **Add repository**, and open **Configure rules**.
4. Enter the number of an existing open, non-draft PR and click **Try review (no publishing)**. Trials consume model usage and save results privately without publishing to GitHub.
5. Inspect the trial result, select **Enable automatic reviews**, configure triggers, base branches, ignored paths, additional review guidance and the daily limit, then save the rules.
6. Choose a delivery mode: **Save draft, confirm before publishing** requires confirmation in the inbox. **Automatically post summary and P0/P1 findings** publishes a `COMMENT` as the GitHub App; it never approves, requests changes or merges PRs.

By default, automation is paused and delivery requires confirmation. Once enabled, the default triggers cover opened or reopened PRs, drafts marked ready for review, and new commits. Draft and bot-authored PRs are excluded by default. The daily limit is 20 review attempts per repository per UTC day, including trials.

### 5. Verify the setup

- Check the GitHub App's webhook delivery history to confirm that requests reach the configured URL. The plugin returns HTTP `202` for valid deliveries. This confirms webhook handling, not completion of the model review or comment publication.
- In Code Review, check the repository's **Last event** timestamp and inbox records, then inspect the trial or event-triggered review result. New-commit events wait at least 30 seconds to combine consecutive pushes.
- If setup fails, check the integration reference, its App ID, lowercase slug, complete PEM, OAuth credentials and secret length. An existing connection with another integration, a PAT, or no recorded OAuth application identity must be disconnected in workspace connector settings and reauthorized using **Connect GitHub**. This shared connection is never silently replaced. For signature errors, configure matching webhook secrets in GitHub and Xpert and verify that the host retains `request.rawBody` for signature verification.
- If a repository cannot be added, check the GitHub account connection, the user's write/admin permission, the App's repository access and its permissions separately. If events arrive without a review, check whether rules are enabled, branch filters, draft or bot-authored PR status, daily quota, and Assistant and model availability.

See [Automatic PR review](docs/automation.mdx) for publication behavior, queue requirements and failure recovery.

Code Review resolves the configured integration through the built-in
`INTEGRATION_PERMISSION_SERVICE_TOKEN` and `IntegrationPermissionService.readConfiguration(id)`.
The host checks the plugin's declared access and configuration tenant/organization scope.
Code Review validates the returned GitHub identity and retains its review execution scope
checks. Webhook payloads never select the configuration scope. No plugin-specific CQRS
query is required.

The **Connect GitHub** action requests the generic `workspace.connector.connect`
command with `provider: 'github'`, `authMethodId: 'github-app-oauth'`, and the configured
`integrationId`. The platform validates the Connector's declared capabilities and
pins the authorized method and integration in its dialog. GitHub-specific method
selection and error guidance belong to this plugin; the host supports the same
constraints for other Connectors, including API key methods. An active or pending
shared connection with different credentials must be resolved explicitly in the
workspace Connector settings.

## Upgrade from inline GitHub App configuration

1. Upgrade the platform (host configuration-read capability, system integration schema and host connection dialog), then GitHub Connector and Code Review. The new reference mode requires these host capabilities; upgrading only the plugins is insufficient.
2. Before starting the upgraded plugin against an existing database, apply [`20261021-github-system-integration.sql`](migrations/20261021-github-system-integration.sql), or let the host synchronize the two nullable repository columns. The migration is idempotent and does not backfill an identity.
3. Copy the legacy App values into the intended GitHub system integration, including the OAuth credentials for that **same App**. Select it in Code Review configuration. Saving the selection removes the legacy `githubApp` copy. Legacy configuration remains supported only until a reference is selected; an invalid reference never falls back to it.
4. Reauthorize the shared Connector if prompted. The connector records the integration and OAuth Client ID from the actual authorization. Changing the integration's Client ID invalidates that proof even if its integration ID stays the same.
5. Open each existing repository's rules and save with automation enabled to revalidate its installation and pin the integration and App ID. Pending runs from the previous policy revision are cancelled; trial/retry creates a run using the current binding. Changing App identity requires revalidation; switching to a different installation requires an explicit ownership migration.
6. Redeliver a GitHub event and inspect the review inbox. The webhook endpoint and one-owner-per-installation/repository rule remain unchanged. Rotate webhook secrets in GitHub and System Integration together; events signed with the previous secret are rejected.

For rollback, pause automatic reviews first, retain the additive database columns, and restore a compatible plugin configuration and Connector authorization. No automated migration or rollback copies secrets between tenants.

## Build and test

Code Review requires published `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk`
3.26.1 or newer for the Project Pipeline API, host configuration reads and pinned integration connect contracts. Deploy the matching platform and GitHub Connector for reference mode. Development dependencies are pinned
to 3.26.1 in the workspace lockfile. No adjacent platform checkout or local SDK
link is required.

From the repository's `xpertai/` directory:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx build @xpert-ai/plugin-code-review
corepack pnpm --filter @xpert-ai/plugin-shadcn-ui build
corepack pnpm exec nx run-many -t typecheck,test,verify:dist -p @xpert-ai/plugin-code-review --parallel=1
```

The authorization tests import the shared UI bridge, so its workspace package must be built before testing in a clean checkout.

Set `XPERT_PIPELINE_TEST_DATABASE_URL` to a dedicated PostgreSQL test database
whose name starts with `xpert_pipeline_test_` to run persistence, scope enforcement,
and delivery tests. Without it, those tests are skipped. Tests create isolated
schemas and remove them on completion. Verify the built plugin's lifecycle
locally by following [`plugin-dev-harness`](../../../plugin-dev-harness/README.md).

Run `node apps/code-review/scripts/automation-acceptance.mjs` with the same dedicated database URL for signed webhook ingestion, real App/Connector resolution, single-owner routing and publication checks against fixture GitHub/model transports.

Install with the platform `plugin:deploy:local` command. Initialize the application from the catalog with an existing model. Public PR reads need no connector; private repositories and GitHub submission require the scoped GitHub connector.

### Host configuration-read capability

Integration references require the host's `integration.readConfiguration(id)` capability.
The host binds it to the plugin installation scope, checks declared integration access
and resolves system configuration in the Default tenant. Code Review supplies only the
Integration ID and does not require configuration-tenant metadata in `PluginContext`.
Upgrade the host before this plugin. If the capability is unavailable, configuration
references fail closed; they never fall back to the legacy `read(id)` lookup. Legacy
inline App configuration remains supported during migration.
