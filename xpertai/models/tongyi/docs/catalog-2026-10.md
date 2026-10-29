# DashScope catalog update — 2026-10-27

Verified against the official [pricing table](https://help.aliyun.com/zh/model-studio/model-pricing) and the linked model/API documents. Token prices are CNY per million tokens, excluding discounts. `cn` means Beijing; `international` means Singapore. Unknown custom-endpoint regions do not receive a fabricated LLM rate.

| Added model | Context / maximum output | Beijing input / output / cache hit |
| --- | --- | --- |
| `deepseek-v4.1-flash-1017` | 1,000,000 / 393,216 | off-peak 1 / 4 / 0.1; peak 2 / 8 / 0.2 |
| `MiniMax/MiniMax-M3.1-Flash` | 1,000,000 / provider default | 1 / 4 / 0.1 |
| `xiaomi/mimo-v2.6-pro-ultraspeed` | 1,048,576 / 131,072 | 30 / 60 / 0.25 |
| `stepfun/step-5-preview` | 1,048,576 / 1,048,576 | 7 / 20 / 0.35 |
| `ZHIPU/GLM-5.3-FlashX` | 1,048,576 / 131,072 | 2 / 7 / 0.57 |
| `qwen3.8-omni-flash` | 1,000,000 / 131,072 | 0.8 / 2.7 / 0.1 |
| `qwen3.7-text-embedding` | 128,000 API input limit | 0.5 input |
| `qwen3.7-text-embedding-flash` | 128,000 API input limit | 0.125 input |
| `qwen3.7-text-rerank` | 30,000 per document | 0.5 input |

[DeepSeek](https://help.aliyun.com/zh/model-studio/deepseek-api) now exposes `low/high/max`, default `high`. The old numeric 1–100 catalog control is removed; saved numeric values fail locally with a message asking for a supported level. Both V4.1 Flash IDs use daily Beijing 08:00–22:00 peak and 22:00–08:00 off-peak tariffs, including weekends. Singapore rates are 2.188/8.75/0.219 peak and 1.094/4.375/0.109 off-peak. The SDK selects DashScope time windows using its invocation timestamp. JSON Object is supported; JSON Schema is rejected locally.

[MiniMax M3.1](https://help.aliyun.com/zh/model-studio/minimax-api-by-minimax) always thinks and exposes low/medium/high/xhigh/max (default max). MiniMax and [MiMo](https://help.aliyun.com/zh/model-studio/mimo) use fixed sampling defaults, so the plugin omits overrides. MiniMax accepts only auto tool choice, does not honor stop sequences or forced serial tool calls. [Step](https://help.aliyun.com/zh/model-studio/stepfun) rejects tool choice and unsupported thinking budgets/search controls. [GLM FlashX](https://help.aliyun.com/zh/model-studio/glm-zhipu) always thinks. These restrictions apply to explicitly listed model IDs; custom model behavior is retained.

For MiniMax M3.1 Flash, MiMo V2.6 Pro Ultraspeed and Step 5 Preview, `withStructuredOutput` uses automatic tool selection when its method is omitted or `functionCalling`. It requests the named result tool in the prompt and validates the complete response against the supplied schema. Missing, unexpected or invalid tool calls raise a parsing error (`includeRaw: true` retains the response with `parsed: null`); parsed streaming results are emitted only after validation. Direct forced tool calls remain unsupported, and this path does not claim provider-enforced strict decoding. Step 5 thinking defaults to off; callers can explicitly enable it.

[Omni](https://help.aliyun.com/zh/model-studio/qwen-omni) is the non-realtime text-output model. Its reasoning effort defaults to xhigh; none turns thinking off. The plugin avoids sending thinking_budget together with effort. Singapore input/output/cache prices are 1.094/3.427/0.117. This does not replace the existing realtime model or introduce an audio-output API.

The [embedding API](https://help.aliyun.com/zh/model-studio/embedding-interfaces-compatible-with-openai/) has a stricter 128,000 input limit than the 131,072 model context advertised in the overview. Both new embeddings use at most 20 inputs per request and default to 1024 dimensions. The full model supports 256/512/768/1024/1536/2048/2560, Flash supports the first four. Configured dimensions reach OpenAIEmbeddings; invalid dimensions are rejected. Singapore full-model input pricing is 0.525; the legacy embedding price API uses Beijing as its default and requires explicit international endpoint selection for Singapore. [Rerank](https://help.aliyun.com/zh/model-studio/embedding-rerank-model) uses the existing text rerank API and its documented per-document limit.

All new models retain assistant reasoning through streamed and non-streamed tool continuations. Validation uses mocked requests and local lifecycle loading, not paid inference or account-specific model access checks.
