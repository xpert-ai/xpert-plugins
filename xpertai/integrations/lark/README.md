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

## QR channel setup

In Bosi, open Assistant → Channels → Add channel → Feishu → Connect with QR code.
Scan and confirm in Feishu to create/authorize a PersonalAgent app. The plugin uses
[Feishu's official registration protocol](https://github.com/larksuite/cli/blob/main/internal/auth/app_registration.go)
and saves the app credentials through the host Integration QR service. Credentials and
opaque device codes are server-only. The stable app/brand identity lets the host reuse
an authorized integration within the same tenant and organization.

The trigger declares `quickConnect` and reports actual long-connection status. Authorization
starts the existing websocket transport, binds the current published Assistant and preserves
unrelated draft edits. The initial response defaults allow direct messages and group mentions;
advanced scopes can be edited in Xpert. OAuth pending/backoff, denial and expiry are mapped to
the host QR lifecycle. The host must support Integration QR setup and trigger quick connections.
The small structural QR types remain local until those interfaces are released in the npm SDK.

## Configuration

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
