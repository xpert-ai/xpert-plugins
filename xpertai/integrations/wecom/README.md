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

### Long-connection reconnect policy

Automatic restore is allowed only when all of these conditions are true:

- The integration provider is `wecom_long`.
- The integration is enabled.
- A routing target exists from a persisted trigger binding.
- The connection was not persistently stopped by a user or by a terminal system state.

States that should reconnect:

| Situation | Expected behavior | Notes |
| --- | --- | --- |
| API process restarts after a normal active long connection | Reconnect automatically | The previous runtime should be restored only if it was not manually disconnected. |
| Runtime websocket closes while `shouldRun=true` | Reconnect automatically | Covers network drops, WebSocket close, ping failure, timeout, and temporary gateway errors. |
| Another API instance owns the same bot lease | Stay in `retrying` and retry | `lease_conflict` means this instance is waiting for ownership; it is not a terminal stop state. |
| User clicks `Reconnect` | Reconnect explicitly | This action may restart a connection from `manual_disconnect` or `runtime_error`. |

States that should not reconnect automatically:

| Stop reason | Expected behavior | Notes |
| --- | --- | --- |
| `manual_disconnect` | Do not restore on API restart | Manual disconnect is a persistent user intent and must not rely only on in-memory session state. |
| `integration_disabled` | Do not reconnect | The integration must be enabled before any runtime is started. |
| `xpert_unbound` | Do not reconnect | A long connection without a routing target cannot process inbound messages safely. |
| `config_invalid` | Do not reconnect after terminal failure | Covers invalid Bot ID, Secret, auth, permissions, or other unrecoverable configuration errors. |
| Integration deleted or provider is not `wecom_long` | Do not reconnect | Registry and runtime state should be cleaned up. |

Runtime state meanings:

| State | Meaning |
| --- | --- |
| `idle` | No active websocket is running. This can be a valid stopped state when `shouldRun=false`. |
| `connecting` | A websocket is being opened and authenticated. |
| `connected` | The websocket is authenticated and available for callbacks or replies. |
| `retrying` | The runtime intends to keep running and is waiting for retry, reconnect, or lease ownership. |
| `unhealthy` | The runtime reached a terminal failure and should not reconnect without an explicit user action or valid configuration save. |

`shouldRun` records the runtime intent. `shouldRun=true` means transient disconnects should be retried. `shouldRun=false` means the service must stay stopped until an explicit `Reconnect` action or a valid configuration save starts it again. `disabledReason` records why the service stopped; `manual_disconnect`, `integration_disabled`, `xpert_unbound`, and terminal `config_invalid` must survive API restarts.

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
