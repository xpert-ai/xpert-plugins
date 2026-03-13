# @xpert-ai/plugin-wecom

Generic WeCom integration plugin for Xpert. It supports both WeCom bot callback mode and WeCom AI Bot long-connection mode, plus a robot-only notification middleware for sending replies inside an active WeCom conversation.

## Capabilities

- Two integration providers:
  - `wecom`: WeCom short-connection callback mode
  - `wecom_long`: WeCom long-connection websocket mode
- Callback endpoint exposure: `/api/wecom/webhook/:integrationId`
- GET URL verification for WeCom callback mode
- POST event decryption and inbound message processing
- Workflow trigger: `WeCom Trigger`
- Agent middleware: `WeComNotifyMiddleware`
- Unified chat channel: `wecom`

## Integration Modes

### Short Connection

Use provider `wecom` when you want WeCom to call your Xpert API endpoint directly.

Required fields:

- `token`
- `encodingAesKey`

Optional fields:

- `xpertId`
- `preferLanguage`
- `timeoutMs`

Callback URL format:

- `https://<your-api-domain>/api/wecom/webhook/<integrationId>`

### Long Connection

Use provider `wecom_long` when you want to connect through the WeCom AI Bot websocket channel.

Required fields:

- `botId`
- `secret`

Optional fields:

- `wsOrigin`
- `xpertId`
- `preferLanguage`
- `timeoutMs`

When a long-connection integration is saved, the plugin attempts to establish the websocket connection automatically.

## Routing to Xpert

You can route inbound WeCom messages in either of these ways:

1. Set `xpertId` directly on the integration.
2. Use `WeCom Trigger` in a workflow to bind `integrationId -> xpertId`.

The trigger-based binding is the recommended setup because it is explicit and aligns with the plugin workflow model.

## Middleware Configuration

`WeComNotifyMiddleware` is intentionally minimal.

It only keeps one required field:

- `integrationId`

The middleware is robot-only. It does not expose recipient type, recipient ID, template settings, or default timeout fields in the config UI.

For normal conversation replies, the model should output plain text directly instead of calling tools.

## Available Tools

### `wecom_send_text_notification`

Send a text reply through the active WeCom robot conversation context.

Required input:

- `content`

Optional runtime context:

- `senderId`
- `chatId`
- `responseUrl`
- `reqId`
- `timeoutMs`

### `wecom_send_rich_notification`

Send a rich reply through the active WeCom robot conversation context.

Supported modes:

- `markdown`
- `textcard`
- `template_card`

The tool can infer the mode automatically from the payload you provide.

Optional runtime context:

- `senderId`
- `chatId`
- `responseUrl`
- `reqId`
- `timeoutMs`

### `wecom_update_message`

Update a template card in the current WeCom robot conversation context.

Accepted payload aliases:

- `templateCard`
- `template_card`
- `card`

Optional runtime context:

- `senderId`
- `chatId`
- `responseUrl`
- `reqId`
- `timeoutMs`

## Runtime Behavior

- Short-connection integrations use callback context from the inbound WeCom request.
- Long-connection integrations use websocket session context from the active AI Bot connection.
- If no valid robot context is available, the middleware returns a context-missing error instead of falling back to application OpenAPI sending.

## Local Build

```bash
cd xpertai/integrations/wecom
node ../../node_modules/typescript/bin/tsc -p tsconfig.lib.json
```

## Lifecycle Validation

After modifying the plugin, run the plugin lifecycle validation through `plugin-dev-harness`.

```bash
cd xpertai/integrations/wecom
node ../../node_modules/typescript/bin/tsc -p tsconfig.lib.json
cd ../../..
node plugin-dev-harness/dist/index.js --workspace ./xpertai --plugin @hxr222223323232323/plugin-wecom-xr --verbose
```
