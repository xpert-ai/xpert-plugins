# @xpert-ai/plugin-dingtalk

DingTalk integration plugin for Xpert AI platform.

## Features

- Bidirectional messaging with DingTalk
- Recommended Stream Mode provider for DingTalk event handling (robot messages, card actions)
- Optional HTTP Mode provider for HTTP callback event handling (messages, mentions, card actions)
- HTTP callback signature verification + AES decrypt
- Encrypted callback ACK response (`msg_signature + encrypt + timeStamp + nonce`)
- Inbound image receiving and ordinary file receiving in human-to-bot conversations; ordinary files are stored in the Xpert workspace. Quoted file replies are also resolved from DingTalk's `repliedMsg` metadata. DingTalk does not deliver file events from group @-mentions or person-to-person chats to bots.
- Configurable inbound summary window for merging separate file and text events that DingTalk actually delivers to the bot.
- Outbound text/markdown/interactive card/workspace media sending. The middleware takes its integration and recipient directly from the trusted DingTalk trigger, so no integration or recipient selector is shown. Legacy stored notification targets remain runtime-compatible. Workspace media is limited to 10 MiB. Images (`jpg`, `jpeg`, `png`, `gif`, `webp`) use DingTalk image messages; documents and archives (`xlsx`, `pdf`, `zip`, `rar`, `doc`, `docx`) use DingTalk file messages.
- Message update/recall with degrade fallback (`degraded=true`)
- Anonymous conversation key strategy:
  - `integrationId + conversationId + senderId`
- Trigger binding + conversation binding persistence
- Built-in notify middleware tools:
  - `dingtalk_send_text_notification`
  - `dingtalk_send_file`
  - `dingtalk_send_rich_notification`
  - `dingtalk_update_message`
  - `dingtalk_recall_message`
  - `dingtalk_list_users`
  - `dingtalk_list_chats`

## Installation

This plugin is loaded automatically when placed in the plugins directory.

## Configuration

### QR setup in Assistant Settings

On Xpert hosts that support trigger quick connections, open **Assistant Settings > DingTalk > Connect**. Scan with DingTalk and complete its authorization flow. Xpert selects the existing Stream Mode integration for the same client ID in the current organization, or creates one, without exposing the returned secret to the browser. It binds the current assistant and starts its Stream connection immediately. The assistant must already have a published, runnable version. Only the selected trigger is updated in its published graph and draft; other draft changes are preserved. Connection failures roll back the trigger changes and allow retrying the authorized session. Disconnect stops the binding immediately. Backend restarts restore enabled published bindings, so an unused duplicate integration cannot receive messages intended for the bound integration.

The plugin uses DingTalk's device registration `init`, `begin`, and `poll` endpoints with the official connector's default source `DING_DWS_CLAW`, following its [device authorization flow](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/main/src/device-auth.ts) and [source configuration](https://github.com/DingTalk-Real-AI/dingtalk-openclaw-connector/blob/main/src/device-auth-config.ts). A custom product name is not a verified registration source: receiving a QR URL alone does not establish that mobile authorization will accept it. A dedicated Xpert source requires confirmation from DingTalk. The `SCANNED` state still awaits authorization and must not create an integration. Registration availability and required permissions are controlled by DingTalk. System Integrations also offers **New > DingTalk (Stream Mode) > Scan to create**: authorization creates or reuses an integration, preserves the name, description and avatar on new integrations, and opens its details. This entry does not bind an assistant or activate a trigger. The manual configuration mode remains available; manually configured triggers can be managed in workspace settings. Closing or refreshing the dialog discards the local pending authorization; it does not remove a robot already created in DingTalk.

### Manual setup

Choose one of the DingTalk integration providers in the admin panel:

- `DingTalk (Stream Mode)` / `钉钉-Stream模式`: recommended mode. It does not require a public HTTP callback URL.
- `DingTalk (HTTP Mode)` / `钉钉-HTTP模式`: optional HTTP callback mode.

Stream Mode options:

- `clientId` (AppKey)
- `clientSecret`
- `robotCode` (required for group/user proactive send APIs)
- `preferLanguage`

HTTP Mode options:

- `clientId` (AppKey)
- `clientSecret`
- `robotCode` (required for group/user proactive send APIs)
- `preferLanguage`
- `callbackToken` (required in HTTP callback mode)
- `callbackAesKey` (required in HTTP callback mode)
- `appKey` (optional alias for callback decrypt validation, defaults to `clientId`)
- `webhookAccessToken` / `webhookSignSecret` (optional fallback path)

DingTalk integrations are linked to a digital expert through the DingTalk trigger binding, not through an integration-level `xpertId`.

For Stream Mode, enable Stream Mode for the DingTalk robot in the DingTalk developer console. The plugin subscribes to:

- `/v1.0/im/bot/messages/get`
- `/v1.0/card/instances/callback`

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
- Existing HTTP callback integrations keep working through the `dingtalk` HTTP Mode provider.

## License

AGPL-3.0
