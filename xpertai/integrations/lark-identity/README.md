# Lark Identity Plugin

- Chinese guide: [README.zh-CN.md](./README.zh-CN.md)

`@xpert-ai/plugin-lark-identity` provides two identity flows for Feishu/Lark:

- bind a logged-in Xpert user to a Feishu identity
- sign in through Feishu SSO by resolving that binding first

This plugin is intended to run as a `system` plugin. Configure it once at the host level, then expose its SSO provider on the Xpert login page for the tenants that should use it.

## Why `union_id`

`union_id` is the primary binding key because it is the stable cross-app identity within one Feishu developer ownership. This matches the current deployment assumption: one Xpert tenant serves one fixed Feishu developer ownership.

`open_id` is still collected, but only stored inside the binding `profile`. It is not used as the primary binding key because it is app-scoped and can change across apps.

## Plugin Config

- `appId`: Feishu app id used only by this identity plugin
- `appSecret`: Feishu app secret used for OAuth and JWT state signing
- `publicBaseUrl`: optional public origin used for callback URL generation and same-origin `returnTo` validation

## Routes

- `GET /api/lark-identity/bind/start`
  - requires the current Xpert user to be logged in
  - starts Feishu OAuth and redirects to the host-side current-user confirmation page on callback
- `GET /api/lark-identity/login/start`
  - accepts `tenantId`, optional `organizationId`, optional `returnTo`
  - starts Feishu OAuth and signs in only if a binding already exists in the current tenant
- `GET /api/lark-identity/callback`
  - completes bind or login based on the signed JWT state and then redirects back into the host auth flow

## Bind Flow

1. Call `/api/lark-identity/bind/start`.
2. The plugin signs a 10-minute JWT state with `HS256` and redirects to Feishu OAuth.
3. On callback, the plugin fetches Feishu profile data, requires `union_id`, and creates a pending binding ticket with flow `current_user_confirm`.
4. The callback redirects to `/auth/sso-confirm?ticket=...` so the logged-in Xpert user can confirm the binding inside the host UI.

## Login Flow

1. Call `/api/lark-identity/login/start?tenantId=...`.
2. The plugin signs the tenant-scoped JWT state and redirects to Feishu OAuth.
3. On callback, the plugin fetches Feishu profile data and asks the host to log in through the bound identity capability.
4. If a bound user exists, the host returns Xpert login tokens and the plugin redirects to `/sign-in/success?...`.
5. If no binding exists, the plugin creates a pending binding ticket and redirects to `/auth/sso-bind?ticket=...`.
6. It never auto-provisions a user and it does not fall back to legacy login behavior.

## `returnTo` Rules

Only these `returnTo` values are accepted:

- root-relative paths such as `/settings/account`
- absolute URLs whose origin matches `publicBaseUrl`

Anything else is rejected to prevent open redirects.

## Scope

This plugin only owns Feishu identity binding and SSO sign-in entry points. It does not change legacy `@xpert-ai/plugin-lark` inbound identity resolution by itself.
