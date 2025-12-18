# Xpert Plugin: Tool Call Limit Middleware

`@xpert-ai/plugin-tool-call-limit` enforces tool call quotas for [Xpert AI](https://github.com/xpert-ai/xpert) agents. It tracks tool usage per thread and per run, blocking or ending execution once limits are exceeded while surfacing clear feedback to both the model and the user.

## Key Features

- Enforce tool call budgets per thread (persistent) and per run (per invocation), with optional per-tool targeting.
- Three exit behaviors: `continue` (strip blocked calls, keep going), `error` (throw), and `end` (stop the run with a final message).
- Injects tool-level error messages so the model knows a limit was hit; adds user-facing notices for blocked calls.
- Guards against misconfigured tool filters and prevents “end” exits when other tools would continue running.
- Ships as a global NestJS module that slots directly into the Xpert middleware pipeline.

## Installation

```bash
pnpm add @xpert-ai/plugin-tool-call-limit
# or
npm install @xpert-ai/plugin-tool-call-limit
```

> **Note**: Ensure the host already provides `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@langchain/core@^0.3`, `zod`, `chalk`, and `@metad/contracts` as peer/runtime deps.

## Quick Start

1. **Register the Plugin**  
   - Global env-based loading:
     ```sh
     PLUGINS=@xpert-ai/plugin-tool-call-limit
     ```
   - Or install dynamically via the system plugin management UI (manual add from the interface).  
   The plugin registers the global `ToolCallLimitPlugin` module.
2. **Attach the Middleware**  
   In the Xpert console (or agent definition), add a middleware entry using strategy `ToolCallLimitMiddleware`.
3. **Set Limits and Exit Behavior**  
   Example middleware block:
   ```json
   {
     "type": "ToolCallLimitMiddleware",
     "options": {
       "toolName": null,
       "threadLimit": 50,
       "runLimit": 5,
       "exitBehavior": "continue"
     }
   }
   ```
   Set `toolName` to target a specific tool, or leave `null` to count all tool calls. Provide at least one limit; `runLimit` cannot exceed `threadLimit`.

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `toolName` | string \| null | Tool name to limit; `null` applies limits to all tool calls. | `null` |
| `threadLimit` | number \| null | Max tool calls per thread (persists across runs). | `null` (no thread cap) |
| `runLimit` | number \| null | Max tool calls per run (reset each invocation). | `null` (no run cap) |
| `exitBehavior` | `"continue"` \| `"error"` \| `"end"` | How to react when limits are hit: `continue` blocks excess calls and keeps the run alive; `error` throws; `end` stops the run and returns a final message (only when no other tools would continue). | `"continue"` |

> Rules  
> - At least one of `threadLimit` or `runLimit` must be provided.  
> - If both are set, `runLimit` must be less than or equal to `threadLimit`.

## Behavior Notes

- Run counts reset at the start of each invocation; thread counts accumulate for the conversation/thread.
- Blocked tool calls are replaced with `ToolMessage` errors so the model avoids retrying them; user-facing AI messages describe the limit that was hit.
- For `exitBehavior="end"`, the middleware requires all tool calls to match the filter; otherwise it rejects the configuration to avoid partial execution.
- Non-matching tools are allowed and not counted, with warnings to help catch misconfigured `toolName` filters.

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-tool-call-limit
npx nx test @xpert-ai/plugin-tool-call-limit
```

TypeScript output lands in `packages/tool-call-limit/dist`. Validate middleware behavior in a staging agent before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
