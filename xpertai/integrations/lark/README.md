# @xpert-ai/plugin-lark

Lark (Feishu) integration plugin for Xpert AI platform.

## Features

- Bidirectional messaging with Lark (Feishu) platform
- Webhook event handling (messages, card actions)
- Send text, markdown, and interactive card messages
- @mention detection in group chats
- Message update support (streaming)
- Middleware built-in notify tools (`LarkNotifyMiddleware`)

## Installation

This plugin is loaded automatically when placed in the plugins directory.

## Configuration

### Connect from assistant settings by QR code

In **Assistant settings → Triggers → Feishu → Connect**, scan the QR code with the
domestic Feishu client, choose an existing app or create one, and confirm the
permissions. The plugin uses
Feishu's official `PersonalAgent` app registration flow to obtain App ID and App
Secret on the server. The host saves the integration, binds the selected trigger
and starts the existing long-connection runtime without a plugin restart.

- Requires a host with generic integration QR setup and trigger quick-connect
  support. The optional `intervalIncrementSeconds` polling result lets the host
  persist Feishu's `slow_down` backoff across API instances.
- The QR setup keeps Feishu's default app picker. After scanning, choose one of
  the existing PersonalAgent apps or choose to create a new one. Feishu returns
  the selected App ID and secret; the host reuses an integration with the same
  App ID in the current organization, or creates one when a new app was chosen.
  Existing manually configured apps and international Lark still use the manual
  configuration below.
- The consent URL requests only tenant permissions for private messages, group
  mentions, bot replies, attachments, and app self-management for setup verification.
  It subscribes to `im.message.receive_v1` and `card.action.trigger`. No user OAuth
  login or user-identity permissions are requested.
- Feishu controls availability of app registration, permission approval and the
  `addons` preset. Before saving, the plugin verifies the resulting tenant scopes,
  message/callback subscriptions, bot identity and a real WebSocket connection probe.
  If app metadata omits event configuration, it checks `event_infos[].event_type`
  on the published app version instead of relying on localized event names.
  If the tenant has not applied these settings, complete them in the Feishu
  developer console, publish as required, and retry. A connected socket alone is
  not treated as sufficient setup validation.
- This preset supports private chat and group @mentions. Receiving all group
  messages or using optional directory tools requires additional permissions.
- Disconnecting the trigger persists its disabled state. New messages, historical
  conversations, card actions and buffered trigger messages cannot invoke the assistant
  until it is connected again. The integration runtime remains available to other plugin features.

The implementation follows the [official Node SDK registration flow](https://github.com/larksuite/node-sdk/tree/main/scene/registration).
The [application configuration API](https://open.feishu.cn/document/uAjLw4CM/ukTMukTMukTM/application-v7/application-v7/application-config/patch)
has creation-source and publication restrictions, so QR setup does not silently
rewrite or publish an existing application's configuration.

To verify after loading the rebuilt plugin: open the trigger's Connect action,
scan and confirm, wait for Connected, then send a private message or @mention the
bot in a group. Confirm that the selected assistant replies. Also test cancel,
QR refresh, denied/expired authorization, and stopping the trigger.

### Manual configuration

Configure the Lark integration in the Xpert AI admin panel:

- **App ID**: Your Lark app ID
- **App Secret**: Your Lark app secret
- **Verification Token**: Token for webhook verification
- **Encrypt Key**: Key for message encryption (optional)
- **Is Lark**: Set to true for international Lark, false for Feishu (China)

## Webhook URL

```
POST /api/lark/webhook/:integrationId
```

## Migration

- `feishu_create_message` (builtin `feishu_message` toolset in `server-ai`) is deprecated.
- Use `LarkNotifyMiddleware` tools instead:
  - `lark_send_text_notification`
  - `lark_send_rich_notification`
  - `lark_update_message`
  - `lark_recall_message`
  - `lark_list_users`
  - `lark_list_chats`
- `integrationId` is resolved from middleware config (`configSchema.integrationId`).
- Recipient resolution priority:
  1. Middleware configured `recipient_id` (with optional `recipient_type`, defaults to `open_id`)
  2. Tool call parameter `recipient_id` (defaults to `open_id` type)
- Both middleware config and tool call support:
  - Literal ID values
  - System variable paths (e.g., `runtime.chatId`)
  - Mustache templates (e.g., `{{channel.foo}}`)
- **Note**: UI currently only exposes `open_id` as recipient_type option. Backend supports all types (`chat_id`, `open_id`, `user_id`, `union_id`, `email`) via direct configuration.

## License

AGPL-3.0
