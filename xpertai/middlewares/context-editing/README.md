# Xpert Plugin: Context Editing Middleware

`@xpert-ai/plugin-context-editing` adds automatic context pruning to [Xpert AI](https://github.com/xpert-ai/xpert) agents. The middleware wraps LangChain chat requests and mirrors Anthropic-style context editing: once the dialog grows past a threshold, older tool outputs are cleared or collapsed so the model stays within its input window.

## Key Features

- Clears older `ToolMessage` results once token/message/fraction triggers are met (default: 100,000 tokens).
- Keeps the most recent tool outputs by count, token budget, or fraction of model context (default: last 3 results).
- Optional input scrubbing for tool calls plus exclusion lists per tool name; inserts a placeholder for cleared results.
- Removes orphaned tool messages automatically and annotates cleared entries with `response_metadata.context_editing`.
- Supports fast approximate token counting or exact model-based counting when available (e.g., OpenAI `getNumTokensFromMessages`).
- Ships as a global NestJS module that plugs directly into the Xpert agent middleware pipeline.

## Installation

```bash
pnpm add @xpert-ai/plugin-context-editing
# or
npm install @xpert-ai/plugin-context-editing
```

> **Note**: Ensure the host service already provides `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@langchain/core@^0.3`, `zod`, and `chalk`. These are treated as peer/runtime dependencies.

## Quick Start

1. **Register the Plugin**  
   Start Xpert with the package in your plugin list:
   ```sh
   PLUGINS=@xpert-ai/plugin-context-editing
   ```
   The plugin registers the global `ContextEditingPlugin` module.
2. **Enable the Middleware on an Agent**  
   In the Xpert console (or agent definition), add a middleware entry with strategy `ContextEditingMiddleware` and provide options as needed.
3. **Configure Triggers and Retention**  
   Example middleware block:
   ```json
   {
     "type": "ContextEditingMiddleware",
     "options": {
       "trigger": { "tokens": 100000 },
       "keep": { "messages": 3 },
       "excludeTools": ["healthcheck"],
       "placeholder": "[cleared]",
       "clearToolInputs": false,
       "tokenCountMethod": "approx"
     }
   }
   ```
   Swap `trigger` or `keep` to use `fraction` (of model context) or `tokens` depending on your needs.

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `trigger` | object | When to start clearing. Provide exactly one of:<br/>- `tokens`: number of tokens in the conversation.<br/>- `messages`: total message count.<br/>- `fraction`: fraction of the model max input tokens. | `{ "tokens": 100000 }` |
| `keep` | object | How much to preserve once triggered. Provide exactly one of:<br/>- `messages`: keep the most recent N tool results.<br/>- `tokens`: keep tool results until this token budget is reached (counting from the newest).<br/>- `fraction`: keep tool results up to this fraction of model context. | `{ "messages": 3 }` |
| `excludeTools` | string[] | Tool names that should never be cleared. | `[]` |
| `placeholder` | string | Text inserted into cleared `ToolMessage` content. | `"[cleared]"` |
| `clearToolInputs` | boolean | Also clears the originating tool call parameters on the AI message. | `false` |
| `tokenCountMethod` | `"approx"` \| `"model"` | Token counting mode: `approx` is fast character-based; `model` calls the model's `getNumTokensFromMessages` when available. | `"approx"` |

> Tips  
> - Use `trigger.fraction` with models that expose `profile.maxInputTokens` to keep pruning aligned with model limits.  
> - Combine `excludeTools` with `keep.tokens` to protect critical tool outputs (e.g., auth checks) while trimming large artifacts.

## Editing Behavior

- Before evaluating thresholds, orphaned tool messages (no matching AI tool call) are removed.
- When triggered, earlier tool results are replaced by the placeholder and tagged with `context_editing.strategy = "clear_tool_uses"`.
- If `clearToolInputs` is true, tool call args on the corresponding AI message are cleared and noted in `context_editing.cleared_tool_inputs`.
- System messages are included in token counting; approximate mode assumes ~4 characters per token.

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-context-editing
npx nx test @xpert-ai/plugin-context-editing
```

TypeScript artifacts emit to `packages/context-editing/dist`. Validate middleware behavior against a staging agent run before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
