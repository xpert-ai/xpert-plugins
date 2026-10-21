# GitHub Connector

Workspace connector provider for GitHub. It supports GitHub App user OAuth with PKCE and personal access tokens, then injects the active workspace credential into sandboxed `gh` and `git` commands.

GitHub App OAuth reads the existing `github` system integration. It selects a tenant-level integration first and falls back to the current organization when the tenant has no valid GitHub App credentials. Configure the GitHub App callback URL as `<Xpert base URL>/api/connector/oauth/callback`.

The Connector stores only the selected system integration ID alongside the OAuth tokens. The GitHub App client secret remains in the host-owned system integration and is resolved again for callback exchange and token refresh. If neither scope has a configured GitHub integration, configure one under **Settings → System Integration** before connecting.

## Unified Code Review application

Code Review references a tenant-level GitHub system integration by `githubIntegrationId`. Configure the same GitHub App's `appId`, `appSlug`, OAuth `clientId`/`clientSecret`, PEM `privateKey`, and `webhookSecret` there. Set the App webhook to `<public API origin>/api/code_review/github/webhook`; OAuth continues to use `/api/connector/oauth/callback`.

The Code Review connect command pins this integration in the host-owned OAuth dialog. An existing shared connection using another integration or PAT must be disconnected explicitly before reconnecting. A PAT remains supported for manual GitHub use.

New OAuth credentials record the actual integration ID and non-secret `oauthClientId`; the runtime projects those fields alongside the access token for server-side application matching. Client secrets, PEMs and refresh tokens are never projected. Code Review rejects a missing or mismatching application identity. Older connections may need reauthorization (or a successful refresh that records the identity). Callback exchange and refresh reject a changed Client ID when an original identity is recorded; rotating the Client Secret for the same Client ID remains supported.

This flow requires the corresponding platform integration resolver and pinned-dialog upgrade. Upgrade the platform first, then this connector and Code Review. See [Code Review migration](../../apps/code-review/README.md#upgrade-from-inline-github-app-configuration).

## Sandbox GitHub CLI

When the GitHub Connector middleware and `SandboxShell` are enabled on the same agent, GitHub `gh` and `git` commands run with the active workspace connector credential.

The runtime writes a permission-restricted environment file under the sandbox `.xpert/secrets/github-connectors` directory, sources it only for the intercepted command, and removes the token file after the command completes. `GH_CONFIG_DIR` is isolated from the host configuration so `gh` does not use the API host's existing login.

The sandbox image or local sandbox host must already provide the `gh` and `git` executables.

## Shared Connector authentication

This connector uses [`@xpert-ai/connector-runtime`](../../packages/connector-runtime/README.md) for shared authentication infrastructure. The migration retains its provider/auth-method IDs, credential format and vendor-specific adapters. See the shared migration matrix and verification command before releasing.
