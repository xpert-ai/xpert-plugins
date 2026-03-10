# Xpert Plugin: Model Retry Middleware

`@xpert-ai/plugin-model-retry` adds retry logic around Xpert agent model calls. It keeps LangChain-style retry semantics while exposing only JSON-serializable configuration that can be edited in the Xpert middleware UI.

## Key Features

- Retries failed model calls with configurable retry count, exponential backoff, max delay, and optional jitter.
- Supports platform-safe retry matching by error name, HTTP status code, and message substring.
- Returns an `AIMessage` when retries are exhausted in `continue` mode, or rethrows the last error in `error` mode.
- Wraps retry attempts with `WrapWorkflowNodeExecutionCommand` so middleware-level execution tracking remains visible in Xpert.
- Registers as a global middleware plugin so the strategy is available across the platform.
- Treats `AIMessage.response_metadata.finish_reason === "network_error"` as a retryable model failure, even when the provider returns a message instead of throwing.

## Installation

```bash
pnpm add @xpert-ai/plugin-model-retry
# or
npm install @xpert-ai/plugin-model-retry
```

## Quick Start

1. Register the plugin:
   ```sh
   PLUGINS=@xpert-ai/plugin-model-retry
   ```
2. Add a middleware entry using strategy `ModelRetryMiddleware`.
3. Configure retries:
   ```json
   {
     "type": "ModelRetryMiddleware",
     "options": {
       "maxRetries": 2,
       "initialDelayMs": 1000,
       "backoffFactor": 2,
       "maxDelayMs": 60000,
       "jitter": true,
       "retryAllErrors": false,
       "retryableErrorNames": ["RateLimitError"],
       "retryableStatusCodes": [429, 503],
       "retryableMessageIncludes": ["timeout", "temporarily unavailable"],
       "onFailure": "continue"
     }
   }
   ```

## Configuration

| Field | Type | Description | Default |
| ----- | ---- | ----------- | ------- |
| `maxRetries` | number | Number of retry attempts after the initial failure. `0` disables retries. | `2` |
| `initialDelayMs` | number | Delay before the first retry attempt, in milliseconds. | `1000` |
| `backoffFactor` | number | Exponential multiplier applied per retry attempt. `0` keeps a constant delay. | `2` |
| `maxDelayMs` | number | Upper bound for the computed retry delay. | `60000` |
| `jitter` | boolean | Adds a bounded random factor to each delay to reduce synchronized retries. | `true` |
| `retryAllErrors` | boolean | Retry every thrown error when `true`. | `true` |
| `retryableErrorNames` | string[] | Retry only matching `error.name` values when `retryAllErrors=false`. | `[]` |
| `retryableStatusCodes` | number[] | Retry matching HTTP-style status codes from `status`, `statusCode`, or `response.status`. | `[]` |
| `retryableMessageIncludes` | string[] | Retry when the error message contains any configured fragment. Matching is case-insensitive. | `[]` |
| `onFailure` | `"continue"` \| `"error"` | Return an `AIMessage` or rethrow after retries are exhausted. | `"continue"` |

## LangChain Differences

- Function-based `retryOn` and `onFailure` are intentionally not supported because Xpert middleware configuration must remain serializable.
- Retry matching uses declarative JSON fields instead of runtime classes or callback functions.
- Retry attempts are execution-tracked with Xpert workflow commands, but no model client is recreated during retries.
- Provider responses that finish with `network_error` are normalized into an internal `ModelNetworkError` and routed through the same retry policy.

## Development & Testing

```bash
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx build @xpert-ai/plugin-model-retry
NX_DAEMON=false pnpm -C /path/to/xpert-plugins/xpertai exec nx test @xpert-ai/plugin-model-retry
```

TypeScript output is emitted to `middlewares/model-retry/dist`.
