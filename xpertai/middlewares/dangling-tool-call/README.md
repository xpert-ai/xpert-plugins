# Dangling Tool Call Middleware

`@xpert-ai/plugin-dangling-tool-call` repairs dangling tool calls in XpertAI agent message history before the next model invocation.

A dangling tool call means an `AIMessage` contains one or more `tool_calls`, but the history is missing the matching `ToolMessage` for at least one `tool_call.id`.

## What It Does

- scans `request.messages` inside `wrapModelCall`
- detects `tool_call.id` values that do not have a matching `ToolMessage.tool_call_id`
- inserts a synthetic error `ToolMessage` immediately after the source `AIMessage`
- passes the patched message list to the remaining model middleware chain

## What It Does Not Do

- retry tools
- re-run interrupted work
- delete original `tool_calls`
- modify existing `ToolMessage` entries
- persist patched messages back into thread history

## Why It Exists

Dangling tool calls typically appear when a tool run is interrupted:

- the user stops the session
- the request is cancelled or times out
- the tool execution path exits before writing its result

Without a repair step, later model calls may receive an invalid tool-call transcript and fail protocol validation or continue from a broken conversation state.

## Agent Behavior

When the middleware finds a missing tool result, it inserts:

```text
ToolMessage(
  tool_call_id="<original id>",
  name="<tool name or unknown>",
  status="error",
  content="[Tool call was interrupted and did not return a result.]"
)
```

This makes the failure explicit without pretending the tool succeeded.

## Recommended Order

Place `DanglingToolCallMiddleware` early in the agent's middleware list, before other `wrapModelCall` middlewares that depend on structurally valid message history.

In Xpert, `wrapModelCall` middlewares are composed with `reduceRight`, so items earlier in the workflow middleware list receive the request first.

## Example

Before:

```text
HumanMessage("Read the file")
AIMessage(tool_calls=[{ "name": "read_file", "id": "call_1" }])
HumanMessage("Continue")
```

After patching:

```text
HumanMessage("Read the file")
AIMessage(tool_calls=[{ "name": "read_file", "id": "call_1" }])
ToolMessage(
  tool_call_id="call_1",
  name="read_file",
  status="error",
  content="[Tool call was interrupted and did not return a result.]"
)
HumanMessage("Continue")
```

## Validation Commands

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec jest middlewares/dangling-tool-call/src/lib/dangling-tool-call.middleware.spec.ts --config middlewares/dangling-tool-call/jest.config.cjs --runInBand
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec tsc -b middlewares/dangling-tool-call/tsconfig.lib.json
```
