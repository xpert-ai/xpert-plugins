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
  1. Middleware configured `recipient_type` + `recipient_id` (if both are present)
  2. Tool call parameter `recipient_id` (defaults to `open_id` type)
- Both middleware config and tool call support:
  - Literal ID values
  - System variable paths (e.g., `runtime.chatId`)
  - Mustache templates (e.g., `{{channel.foo}}`)
- **Note**: UI currently only exposes `open_id` as recipient_type option. Backend supports all types (`chat_id`, `open_id`, `user_id`, `union_id`, `email`) via direct configuration.

## License

AGPL-3.0
