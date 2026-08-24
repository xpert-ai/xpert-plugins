# DingTalk SSO

`@xpert-ai/plugin-dingtalk-sso` adds DingTalk OAuth2 sign-in and account binding to Xpert.

Source code: [xpert-ai/xpert-plugins](https://github.com/xpert-ai/xpert-plugins/tree/main/xpertai/integrations/dingtalk-sso)

This package is independent from `@xpert-ai/plugin-dingtalk`, which handles bots and messaging. SSO credentials are stored as a tenant-level System Integration, so the plugin itself has no client secret fields.

## Configuration

Configure the integration in Xpert Settings -> System Integration:

1. Create `DingTalk OAuth Sign-in` (`dingtalk-sso`). Do not select the separate `DingTalk` messaging integration.
2. Enter `clientId` (DingTalk AppKey) and `clientSecret` (DingTalk AppSecret).
3. Set a stable, non-default `SECRETS_ENCRYPTION_KEY` in the Xpert server environment. The AppSecret is encrypted before it is stored.

Register this callback URL in the DingTalk developer console:

```text
https://<xpert-public-origin>/api/dingtalk-identity/callback
```

The callback URL shown by System Integration is the authoritative value. It is generated from the host `clientBaseUrl`; when that host value is unavailable, prefix the callback path with the public Xpert origin.

The DingTalk login button is shown only when the current tenant has exactly one valid tenant-level `dingtalk-sso` integration. Organization-level integrations are intentionally ignored.

Enable web sign-in and the permission required by DingTalk's "Get user contact information" API, then publish the application version.

## Behavior

- Anonymous sign-in starts at `GET /api/dingtalk-identity/login/start`.
- Current-user binding starts at `GET /api/dingtalk-identity/bind/start`.
- OAuth callbacks return to `GET /api/dingtalk-identity/callback`.
- DingTalk `unionId` is the stable external binding subject.
- Bound identities sign in immediately.
- Unbound identities receive an Xpert `/auth/sso-bind` challenge.
- The user access token is used only for `/v1.0/contact/users/me` and is not persisted.

## DingTalk APIs

- Authorization: `https://login.dingtalk.com/oauth2/auth`
- User token: `https://api.dingtalk.com/v1.0/oauth2/userAccessToken`
- Current user: `https://api.dingtalk.com/v1.0/contact/users/me`

Official references:

- [Web application sign-in](https://open.dingtalk.com/document/orgapp/tutorial-obtaining-user-personal-information)
- [Obtain user token](https://open.dingtalk.com/document/orgapp/obtain-user-token)
- [Get user contact information](https://open.dingtalk.com/document/orgapp/dingtalk-retrieve-user-information)

## Privacy

The plugin processes the DingTalk `unionId`, `openId`, display name, and avatar URL to identify the user and maintain the Xpert account binding. The `unionId` is the binding subject; the remaining profile fields are stored with the binding for display and diagnostics.

DingTalk user access tokens are used only to request the current user's profile and are never persisted. The application AppSecret is encrypted in the tenant-level System Integration. Identity data remains in the configured Xpert deployment and can be removed by deleting the account binding or the integration. DingTalk remains responsible for data processed by its OAuth service under DingTalk's own privacy terms.

## Verification

```bash
cd xpertai
pnpm exec nx test @xpert-ai/plugin-dingtalk-sso --runInBand
pnpm exec nx build @xpert-ai/plugin-dingtalk-sso
```

After creating or changing the integration, refresh `/auth/login` (a hard refresh may be needed if the browser cached the provider request). The login page loads providers for the current tenant and will then display DingTalk.
