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

For manual viewing and AI review of public PRs, you can omit the entire `githubApp` configuration. Private repository access and manual GitHub review submission still require a GitHub connection in the current workspace.

### 2. Set up the GitHub App

In your GitHub account or organization, open **Settings → Developer settings → GitHub Apps** and create or edit the App for automatic reviews.

1. Record the numeric **App ID** from its settings page and the actual `<slug>` from its public URL, `https://github.com/apps/<slug>`.
2. Generate and download a PEM private key through **Credentials → Key pairs → New key**. Older interfaces may show **Private keys → Generate a private key**. See [Managing private keys for GitHub Apps](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/managing-private-keys-for-github-apps).
3. Under **Webhooks**, select **Active** and enter the complete **Webhook URL**:

   ```text
   https://api.example.com/api/code_review/github/webhook
   ```

   Replace the example domain with your public API domain. Create a random **Webhook secret** of at least 32 characters and enter the same value in GitHub and the Xpert plugin configuration. To generate a 64-character secret locally:

   ```sh
   openssl rand -hex 32
   ```

4. Under **Repository permissions**, set **Contents: Read-only** and **Pull requests: Read & write**. Under **Subscribe to events**, select **Pull request**.
5. Use **Install App** to install the App on the target account or organization and grant access to the repositories you want to review.

### 3. Configure the Xpert plugin

Open **Plugins → Code Review → Configuration**, expand **GitHub App for automatic reviews**, and fill in the following fields:

| Field | Configuration key | Value |
| --- | --- | --- |
| App ID | `githubApp.appId` | The numeric App ID from the GitHub App settings page. Do not use the Client ID or Installation ID. |
| App slug | `githubApp.slug` | Copy the last segment of the App's public URL. For `https://github.com/apps/example-review-bot`, enter `example-review-bot`. Only lowercase letters, digits and hyphens are accepted, with a letter or digit first. Do not enter a display name containing uppercase letters, spaces or periods. |
| Private key (PEM) | `githubApp.privateKey` | Paste the complete contents of the downloaded `.pem` file, including `-----BEGIN RSA PRIVATE KEY-----` and its matching end line. Enter the file contents, not its path or a Client Secret. |
| Webhook secret (32+ characters) | `githubApp.webhookSecret` | The exact same secret configured in the GitHub App, at least 32 characters long. |
| Public API origin | `githubApp.publicBaseUrl` | Your public HTTPS API origin, such as `https://api.example.com`, without `/api` or the webhook path. |

**Required fields:** The current form may label fields as optional, but the backend only allows omitting the entire `githubApp` object. Once that object is configured, all five fields are required. See [`configSchema`](src/automation-domain.ts) for the validation rules. Enter the private key and webhook secret only in the corresponding configuration fields; do not commit them to the repository.

Use `https://api.example.com` for Xpert's **Public API origin** and `https://api.example.com/api/code_review/github/webhook` for GitHub's **Webhook URL**.

### 4. Connect repositories and enable rules

1. In Code Review, open **Connect repositories** and click **Connect GitHub**. Complete the platform's OAuth or token dialog. OAuth requires an administrator to configure the GitHub integration's Client ID and Client Secret; these belong to the account connection settings, not the App private key field above. The current connection is shared within the workspace.
2. Confirm that the connected account has write or admin permission on the target repository and that the GitHub App is installed with access to it. The account connection verifies the user's repository permissions; the App installation receives events and publishes reviews. Both are required.
3. Enter `owner/repository`, click **Add repository**, and open **Configure rules**.
4. Enter the number of an existing open, non-draft PR and click **Try review (no publishing)**. Trials consume model usage and save results privately without publishing to GitHub.
5. Inspect the trial result, select **Enable automatic reviews**, configure triggers, base branches, ignored paths, additional review guidance and the daily limit, then save the rules.
6. Choose a delivery mode: **Save draft, confirm before publishing** requires confirmation in the inbox. **Automatically post summary and P0/P1 findings** publishes a `COMMENT` as the GitHub App; it never approves, requests changes or merges PRs.

By default, automation is paused and delivery requires confirmation. Once enabled, the default triggers cover opened or reopened PRs, drafts marked ready for review, and new commits. Draft and bot-authored PRs are excluded by default. The daily limit is 20 review attempts per repository per UTC day, including trials.

### 5. Verify the setup

- Check the GitHub App's webhook delivery history to confirm that requests reach the configured URL. The plugin returns HTTP `202` for valid deliveries. This confirms webhook handling, not completion of the model review or comment publication.
- In Code Review, check the repository's **Last event** timestamp and inbox records, then inspect the trial or event-triggered review result. New-commit events wait at least 30 seconds to combine consecutive pushes.
- If the configuration cannot be saved, check the actual lowercase slug, complete PEM contents, secret length and missing fields. For signature errors, verify that both webhook secrets match and that the host retains `request.rawBody` for signature verification.
- If a repository cannot be added, check the GitHub account connection, the user's write/admin permission, the App's repository access and its permissions separately. If events arrive without a review, check whether rules are enabled, branch filters, draft or bot-authored PR status, daily quota, and Assistant and model availability.

See [Automatic PR review](docs/automation.mdx) for publication behavior, queue requirements and failure recovery.

## Build and test

Code Review requires published `@xpert-ai/contracts` and `@xpert-ai/plugin-sdk`
3.25.0 or newer for the Project Pipeline API. Development dependencies are pinned
to 3.25.0 in the workspace lockfile. No adjacent platform checkout or local SDK
link is required.

From the repository's `xpertai/` directory:

```sh
corepack pnpm install --frozen-lockfile
corepack pnpm exec nx build @xpert-ai/plugin-code-review
corepack pnpm exec nx run-many -t typecheck,test,verify:dist -p @xpert-ai/plugin-code-review --parallel=1
```

Set `XPERT_PIPELINE_TEST_DATABASE_URL` to a dedicated PostgreSQL test database
whose name starts with `xpert_pipeline_test_` to run persistence, scope enforcement,
and delivery tests. Without it, those tests are skipped. Tests create isolated
schemas and remove them on completion. Verify the built plugin's lifecycle
locally by following [`plugin-dev-harness`](../../../plugin-dev-harness/README.md).

Install with the platform `plugin:deploy:local` command. Initialize the application from the catalog with an existing model. Public PR reads need no connector; private repositories and GitHub submission require the scoped GitHub connector.
