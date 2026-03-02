# @xpert-ai/plugin-dingtalk

DingTalk integration plugin for Xpert AI platform.

## Features

- Bidirectional messaging with DingTalk
- HTTP webhook event handling (messages, mentions, card actions)
- HTTP callback signature verification + AES decrypt
- Encrypted callback ACK response (`msg_signature + encrypt + timeStamp + nonce`)
- Outbound text/markdown/interactive card message sending
- Message update/recall with degrade fallback (`degraded=true`)
- Anonymous conversation key strategy:
  - `integrationId + conversationId + senderId`
- Trigger binding + conversation binding persistence
- Built-in notify middleware tools:
  - `dingtalk_send_text_notification`
  - `dingtalk_send_rich_notification`
  - `dingtalk_update_message`
  - `dingtalk_recall_message`
  - `dingtalk_list_users`
  - `dingtalk_list_chats`

## Installation

This plugin is loaded automatically when placed in the plugins directory.

## Configuration

Configure integration options in admin panel:

- `clientId` (AppKey)
- `clientSecret`
- `robotCode` (required for group/user proactive send APIs)
- `xpertId`
- `preferLanguage`
- `httpCallbackEnabled` (must be `true` in v1)
- `callbackToken`
- `callbackAesKey`
- `appKey` (optional alias for callback decrypt validation, defaults to `clientId`)
- `webhookAccessToken` / `webhookSignSecret` (optional fallback path)

## Webhook URL

```
POST /api/dingtalk/webhook/:integrationId
```

## API Endpoints

- `POST /api/dingtalk/webhook/:integrationId`
- `GET /api/dingtalk/callback-config?integration=<id>`
- `GET /api/dingtalk/action?integrationId=<id>&conversationUserKey=<key>&action=dingtalk:end`
- `GET /api/dingtalk/user-select-options?integration=<id>`
- `GET /api/dingtalk/chat-select-options?integration=<id>`
- `GET /api/dingtalk/recipient-select-options?integration=<id>&recipientType=<type>`

## Database

The plugin registers two entities (and corresponding tables) in TypeORM:

### `plugin_dingtalk_conversation_binding`

Purpose: bind one DingTalk conversation user key to one Xpert conversation.

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | primary key |
| `userId` | `varchar(128)` | yes | optional normalized sender id |
| `conversationUserKey` | `varchar(255)` | no | `integrationId:conversationId:senderId` or fallback key |
| `xpertId` | `varchar(36)` | no | target xpert id |
| `conversationId` | `varchar(36)` | no | Xpert chat conversation id |
| `tenantId` | `varchar(36)` | yes | tenant scope |
| `organizationId` | `varchar(36)` | yes | organization scope |
| `createdById` | `varchar(36)` | yes | audit |
| `updatedById` | `varchar(36)` | yes | audit |
| `createdAt` | `timestamptz` | no | auto create timestamp |
| `updatedAt` | `timestamptz` | no | auto update timestamp |

Indexes:
- unique: `plugin_dingtalk_conversation_binding_user_id_uq` on (`userId`)
- unique: `plugin_dingtalk_conversation_binding_user_key_xpert_uq` on (`conversationUserKey`, `xpertId`)
- index: `plugin_dingtalk_conversation_binding_tenant_org_idx` on (`tenantId`, `organizationId`)

### `plugin_dingtalk_trigger_binding`

Purpose: bind one DingTalk integration to one xpert in trigger mode.

| Column | Type | Nullable | Notes |
| --- | --- | --- | --- |
| `id` | `uuid` | no | primary key |
| `integrationId` | `varchar(36)` | no | integration id |
| `xpertId` | `varchar(36)` | no | target xpert id |
| `tenantId` | `varchar(36)` | yes | tenant scope |
| `organizationId` | `varchar(36)` | yes | organization scope |
| `createdById` | `varchar(36)` | yes | audit |
| `updatedById` | `varchar(36)` | yes | audit |
| `createdAt` | `timestamptz` | no | auto create timestamp |
| `updatedAt` | `timestamptz` | no | auto update timestamp |

Indexes:
- unique: `plugin_dingtalk_trigger_binding_integration_id_uq` on (`integrationId`)
- index: `plugin_dingtalk_trigger_binding_tenant_org_idx` on (`tenantId`, `organizationId`)

## Event Subscription Setup (DingTalk Console)

Use the callback-config endpoint output to configure callback URL and check required callback fields.
In DingTalk event subscription, select robot-related events based on your scenario, at minimum:

- Robot message receive events
- Robot card callback events

In Xpert integration settings, click "Test" to validate credentials and get `webhookUrl` directly for DingTalk callback configuration.

## Migration

- ChatBI middleware is not included in v1.
- OAuth login is not included in v1.
- AI interactive card (`ai_card`) is intentionally removed from plugin v1 scope.
- Use `interactive` mode in `dingtalk_send_rich_notification` for URL button cards.

## License

AGPL-3.0
