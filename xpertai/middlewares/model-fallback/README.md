# Xpert Plugin: Model Fallback Middleware

`@xpert-ai/plugin-model-fallback` retries failed model calls with alternative models in sequence. It wraps agent LLM invocations so outages, throttling, or quality issues on the primary model can be absorbed automatically while preserving execution tracking and usage metrics.

## Key Features

- Ordered fallback chain: try primary once, then cycle through `fallbackModels` until one succeeds.
- Works with any configured LLM (`ICopilotModel`) and reuses Xpert’s `CreateModelClientCommand` for provider-specific setup and usage reporting.
- Keeps execution telemetry by wrapping each fallback attempt in `WrapWorkflowNodeExecutionCommand`.
- Surfaces the last failure if all models are exhausted so callers can handle errors explicitly.
- Opt-in middleware (non-global) that plugs into the Xpert agent pipeline.

## Installation

```bash
pnpm add @xpert-ai/plugin-model-fallback
# or
npm install @xpert-ai/plugin-model-fallback
```

> **Note**: Ensure the host already provides `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@langchain/core@^0.3`, `zod`, `chalk`, and `@metad/contracts` as peer/runtime dependencies.

## Quick Start

1. **Register the Plugin**  
   - Global env-based loading:
     ```sh
     PLUGINS=@xpert-ai/plugin-model-fallback
     ```
   - Or install dynamically via the system plugin management UI (manual add from the interface).  
   The plugin exposes the `ModelFallbackPlugin` module (non-global).
2. **Attach the Middleware**  
   In the Xpert console (or agent definition), add a middleware entry with strategy `ModelFallbackMiddleware`.
3. **Configure Fallback Models**  
   Example middleware block:
   ```json
   {
     "type": "ModelFallbackMiddleware",
     "options": {
       "fallbackModels": [
         { "provider": "openai", "model": "gpt-3.5-turbo" },
         { "provider": "anthropic", "model": "claude-3-sonnet-20240229" }
       ]
     }
   }
   ```
   Models are tried in array order after the primary model defined on the agent.

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `fallbackModels` | `ICopilotModel[]` | Ordered list of backup models to try when the primary fails. Must contain at least one entry. | – |

> Tips  
> - Keep the first fallback close in capability/price to the primary; use later slots for cheaper or more reliable providers.  
> - The UI uses `ai-model-select` with `modelType = LLM`; ensure each entry is a valid LLM configuration.

## Behavior Notes

- The primary model is attempted once; any thrown error triggers the fallback loop. Success short-circuits remaining fallbacks.
- Each fallback attempt creates its own model client via `CreateModelClientCommand` and is wrapped by `WrapWorkflowNodeExecutionCommand` so usage and workflow telemetry stay intact.
- If every fallback fails, the middleware rethrows the last encountered error to the caller.
- Environment hooks (e.g., `FORCE_MODEL_ERROR`) can be used during testing to simulate failures before the fallback sequence.

## Development & Testing

```bash
npm install
npx nx build @xpert-ai/plugin-model-fallback
npx nx test @xpert-ai/plugin-model-fallback
```

TypeScript output lands in `packages/model-fallback/dist`. Validate fallback behavior against a staging agent before publishing.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
