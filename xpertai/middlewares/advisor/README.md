# Advisor Middleware

`@xpert-ai/plugin-advisor` adds a generic `advisor` tool to the agent runtime.

The tool lets the executor consult a separately configured model for:

- hard debugging
- architecture tradeoffs
- risky decisions
- second opinions on a plan

The plugin is provider-agnostic. It only depends on the configured Xpert model selection and does not assume Anthropic or any other vendor-specific protocol.

## Key Behavior

- injects an `advisor` tool into the runtime
- appends a short executor prompt explaining when to use it
- enforces per-run and optional per-session usage limits
- forwards a curated slice of conversation history to the advisor model
- returns the advisor result as a normal `ToolMessage`

## Configuration

- `advisorModel`: model selected with `ai-model-select`
- `maxUsesPerRun`: per-run quota, default `3`
- `maxUsesPerSession`: optional session quota
- `appendSystemPrompt`: whether to guide the executor on advisor usage
- `maxTokens` / `temperature`: internal advisor call settings
- `context.*`: controls how much prior conversation is forwarded

## Validation

Run:

```bash
npx nx build @xpert-ai/plugin-advisor
npx nx test @xpert-ai/plugin-advisor
fnm exec --using=20 -- node ../plugin-dev-harness/dist/index.js --workspace . --plugin ./middlewares/advisor/dist/index.js
```
