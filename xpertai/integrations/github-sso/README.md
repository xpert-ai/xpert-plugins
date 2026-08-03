# GitHub SSO

`@xpert-ai/plugin-github-sso` adds GitHub OAuth App sign-in to Xpert.
The plugin is installed at system level, while each tenant owns its OAuth
credentials through a tenant-level **GitHub OAuth Sign-in** System Integration.

## Configuration

1. Install the system plugin.
2. Create one tenant-level System Integration with provider `github-sso`.
3. Enter the GitHub OAuth App `clientId` and `clientSecret`.
4. Configure this authorization callback URL in the GitHub OAuth App:

   ```text
   https://<xpert-public-origin>/api/github-identity/callback
   ```

The login page exposes GitHub only when exactly one complete tenant-level
integration exists. Organization-level integrations are not used.
The client secret is encrypted at rest with the host
`SECRETS_ENCRYPTION_KEY`. Configure a non-default value before saving the
integration, and keep that key stable across restarts and replicas.

## Login behavior

- The OAuth request uses `scope=user:email` and PKCE S256.
- Xpert requires GitHub's primary verified email.
- An existing bound GitHub numeric user ID signs in to its original Xpert
  account.
- An unbound identity with one matching tenant email is bound and signed in by
  the host.
- A new email is redirected to `/auth/register?ticket=...` to set a password
  and optionally enter a referral code before the host creates the account.

The GitHub access token is used only to call `/user` and `/user/emails`; the
plugin does not persist or expose it.

## Host compatibility

This plugin requires `@xpert-ai/plugin-sdk` 3.15.19 or later with the
`bound_identity_login:provision` permission and
`loginOrPrepareVerifiedEmail()` host capability.
