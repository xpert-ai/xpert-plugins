# GitHub Connector

Workspace connector provider for GitHub. It supports GitHub App user OAuth with PKCE and personal access tokens, then injects the active workspace credential into sandboxed `gh` and `git` commands.

GitHub App OAuth reads the existing `github` system integration. It selects a tenant-level integration first and falls back to the current organization when the tenant has no valid GitHub App credentials. Configure the GitHub App callback URL as `<Xpert base URL>/api/connector/oauth/callback`.

The Connector stores only the selected system integration ID alongside the OAuth tokens. The GitHub App client secret remains in the host-owned system integration and is resolved again for callback exchange and token refresh. If neither scope has a configured GitHub integration, configure one under **Settings → System Integration** before connecting.

## Sandbox GitHub CLI

When the GitHub Connector middleware and `SandboxShell` are enabled on the same agent, GitHub `gh` and `git` commands run with the active workspace connector credential.

The runtime writes a permission-restricted environment file under the sandbox `.xpert/secrets/github-connectors` directory, sources it only for the intercepted command, and removes the token file after the command completes. `GH_CONFIG_DIR` is isolated from the host configuration so `gh` does not use the API host's existing login.

The sandbox image or local sandbox host must already provide the `gh` and `git` executables.
