# Xpert Plugin: Loop Guard Middleware

`@xpert-ai/plugin-loop-guard` implements a pure-plugin tool-call loop detector for Xpert agents. It does not rely on `xpert-pro` consuming `jumpTo: "model"`.

## What It Does

- hashes the last `AIMessage.tool_calls` as one normalized batch
- keeps a sliding window in middleware state
- schedules a warning for the next `beforeModel` turn after repeated batches cross `warnThreshold`
- hard-stops the current turn after repeated batches cross `hardLimit` when `onLoop` is `end`
- throws `LoopGuardTriggeredError` after repeated batches cross `hardLimit` when `onLoop` is `error`

This middleware stores its detection window in agent state, so the signal survives across invocations on the same thread.

## Lifecycle Strategy

- `beforeAgent`: initializes or prunes loop-detection state without resetting the thread window
- `beforeModel`: injects a `HumanMessage` if a warning was scheduled on the previous turn
- `afterModel`: hashes the latest tool-call batch, updates the sliding window, and decides whether to warn, stop, or throw

## Quick Start

1. Register the plugin:
   ```sh
   PLUGINS=@xpert-ai/plugin-loop-guard
   ```
2. Add a middleware entry using strategy `LoopGuardMiddleware`.
3. Start with the default configuration:
   ```json
   {
     "type": "LoopGuardMiddleware",
     "options": {
       "warnThreshold": 3,
       "hardLimit": 5,
       "windowSize": 20,
       "onLoop": "end"
     }
   }
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `warnThreshold` | `number` | Repeated-batch count that schedules a warning for the next model turn. | `3` |
| `hardLimit` | `number` | Repeated-batch count that triggers hard-stop or error handling. | `5` |
| `windowSize` | `number` | Number of recent tracked batches kept in state. Must be at least `hardLimit`. | `20` |
| `onLoop` | `"continue"` \| `"end"` \| `"error"` | Hard-limit behavior. | `"end"` |
| `warningMessage` | `string` | Optional override for the next-turn warning. | built-in |
| `hardStopMessage` | `string` | Optional override for the final stop message. | built-in |

Built-in ignored arg keys are always applied:

- `id`
- `requestId`
- `traceId`
- `timestamp`
- `time`
- `nonce`

## Behaviors

- `continue`
  - keeps warning-only semantics even after the hard limit is reached
  - never depends on `jumpTo: "model"`
- `end`
  - warns on the next turn at `warnThreshold`
  - clears the current `tool_calls` and appends a final `AIMessage` at `hardLimit`
- `error`
  - warns on the next turn at `warnThreshold`
  - throws `LoopGuardTriggeredError` at `hardLimit`

## Notes

- Detection is based on normalized tool batches, not individual `tool_call_id` values.
- Multi-tool batches are sorted before hashing, so reordered but otherwise identical batches are treated as the same pattern.
- This middleware no longer uses result-based loop heuristics such as "same result window".

## Development

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec jest middlewares/loop-guard/src/lib/loopGuard.spec.ts --config middlewares/loop-guard/jest.config.cjs --runInBand
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec tsc -b middlewares/loop-guard/tsconfig.lib.json
```
