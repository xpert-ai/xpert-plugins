# Clarification Middleware

`@xpert-ai/plugin-clarification` adds an explicit `ask_clarification` tool to an agent and turns that tool call into a controlled clarification point.

## What It Does

- injects the `ask_clarification` dynamic tool
- appends a short system rule telling the model to clarify before acting when the request is underspecified or risky
- rewrites mixed tool batches after the model call so only `ask_clarification` reaches the tool node
- intercepts `ask_clarification` in `wrapToolCall`
- writes a readable `ToolMessage`
- ends the current run whenever `ask_clarification` is called

## What It Does Not Do

- move the session into an `interrupted` state
- render a dedicated clarification UI card
- parse the user's follow-up answer
- auto-resume the previous run

## Tool Input

```ts
{
  question: string
  clarificationType?: 'missing_info' | 'ambiguous_requirement' | 'approach_choice' | 'risk_confirmation' | 'suggestion'
  context?: string
  options?: string[]
  allowFreeText?: boolean
  required?: boolean
}
```

Default values:

- `clarificationType = 'missing_info'`
- `options = []`
- `allowFreeText = true`
- `required = true`

Behavior:

- `required: true` writes the clarification tool message and returns `Command({ goto: 'end' })`
- `required: false` is accepted for compatibility, but the middleware still treats clarification as blocking and ends the current run
- invalid input returns an error `ToolMessage` with a stable hint telling the model to provide a valid `question`, so the model can repair the tool call in the same run

## Message Protocol

The middleware writes a normal tool message with:

- `name = "ask_clarification"`
- readable `content`
- `metadata.clarification` for future UI upgrades

The content is intentionally standalone so current tool-message UIs can render it directly.
The user should answer in the next turn to continue execution.

## Known Limitation

This plugin only controls turns where the model explicitly emits `ask_clarification`.
If the model should have clarified but does not call the tool, the middleware will not invent a clarification step on its own.

## Recommended Order

Place `ClarificationMiddleware` near the end of the middleware chain. It is a control middleware that can end the current run for blocking clarifications and should usually run after ordinary prompt-injection and auditing middlewares.

## Validation Commands

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-clarification
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-clarification
```
