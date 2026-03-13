# Xpert Plugin: Tool Retry Middleware

`@xpert-ai/plugin-tool-retry` retries failed tool executions for Xpert agents using JSON-serializable middleware configuration. It preserves the core LangChain retry behavior while fitting Xpert's UI-driven plugin model.

## Key Features

- Retries tool failures with configurable retry count, exponential backoff, bounded jitter, and declarative error matching.
- Can target all tools or only a configured set of tool names.
- Returns a `ToolMessage` with `status: "error"` in `continue` mode so the agent can react gracefully.
- Rethrows the last error in `error` mode after retries are exhausted.
- Registers as a global middleware plugin so the strategy is available platform-wide.

## Installation

```bash
pnpm add @xpert-ai/plugin-tool-retry
# or
npm install @xpert-ai/plugin-tool-retry
```

## Quick Start

1. Register the plugin:
   ```sh
   PLUGINS=@xpert-ai/plugin-tool-retry
   ```
2. Add a middleware entry using strategy `ToolRetryMiddleware`.
3. Configure retries:
   ```json
   {
     "type": "ToolRetryMiddleware",
     "options": {
       "toolNames": ["search_database", "query_sales_report"],
       "maxRetries": 2,
       "initialDelayMs": 1000,
       "backoffFactor": 2,
       "maxDelayMs": 60000,
       "jitter": true,
       "retryAllErrors": false,
       "retryableErrorNames": ["TimeoutError"],
       "retryableStatusCodes": [500, 503],
       "retryableMessageIncludes": ["temporarily unavailable"],
       "onFailure": "continue"
     }
   }
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `toolNames` | string[] | Tool names to retry. Empty means all tools. | `[]` |
| `maxRetries` | number | Number of retry attempts after the initial failure. `0` disables retries. | `2` |
| `initialDelayMs` | number | Delay before the first retry attempt, in milliseconds. | `1000` |
| `backoffFactor` | number | Exponential multiplier applied per retry attempt. `0` keeps a constant delay. | `2` |
| `maxDelayMs` | number | Upper bound for the computed retry delay. | `60000` |
| `jitter` | boolean | Adds a bounded random factor to each delay to reduce synchronized retries. | `true` |
| `retryAllErrors` | boolean | Retry every thrown error when `true`. | `true` |
| `retryableErrorNames` | string[] | Retry only matching `error.name` values when `retryAllErrors=false`. | `[]` |
| `retryableStatusCodes` | number[] | Retry matching HTTP-style status codes from `status`, `statusCode`, or `response.status`. | `[]` |
| `retryableMessageIncludes` | string[] | Retry when the error message contains any configured fragment. Matching is case-insensitive. | `[]` |
| `onFailure` | `"continue"` \| `"error"` | Return a `ToolMessage` or rethrow after retries are exhausted. | `"continue"` |

## LangChain Differences

- Function-based `retryOn`, function-based `onFailure`, and BaseTool instance filtering are not supported in v1.
- Tool selection is done with plain tool-name strings so middleware configuration stays serializable.
- Retry attempts directly re-invoke the tool handler; no extra workflow execution wrapper is added because the SDK does not expose a tool-attempt tracking primitive.

## Development & Testing

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-tool-retry
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-tool-retry
```

TypeScript output is emitted to `middlewares/tool-retry/dist`.
