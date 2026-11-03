# November 2026 provider catalog refresh

Verified 2026-11-03 (Asia/Shanghai) against Dify upstream `3189f896` and the provider sources below. This change adds 30 model entries in six existing plugins. It does not install plugins or change configured Copilots.

## Catalog

| Provider | Added model IDs |
| --- | --- |
| minimax | `MiniMax-M3.1-Flash` |
| moonshot | `kimi-k3.1-pro`, `kimi-k3.1-pro-highspeed` |
| siliconflow | `deepseek-ai/DeepSeek-V4.1-Flash`, `zai-org/GLM-5.3-Flash`, `XingChenAGI/Xing4.0-29B`, `zai-org/GLM-5.3`, `Qwen/Qwen3-VL-Embedding-8B`, `Qwen/Qwen3-VL-Reranker-8B`, `Qwen/Qwen3-ASR-1.7B` |
| tongyi | `qwen3-vl-embedding`, `qwen3-vl-rerank` |
| stepfun | `step-5-preview`, `stepaudio-3-tts`, `stepaudio-3-asr-max` |
| openrouter | `google/gemini-3.8-flash`, `moonshotai/kimi-k3.1-pro`, `openai/gpt-6-astra`, `openai/gpt-6-astra-pro`, `openai/gpt-6-luna`, `openai/gpt-6-luna-pro`, `openai/gpt-6-sol`, `openai/gpt-6-sol-pro`, `openai/gpt-6.1-sol`, `openai/gpt-6.1-sol-pro`, `anthropic/claude-opus-5.5`, `anthropic/claude-sonnet-5.5`, `anthropic/claude-haiku-5.5`, `anthropic/claude-fable-5`, `anthropic/claude-fable-5.1` |

SiliconFlow retains these eight schemas with `deprecated: true`: `deepseek-ai/DeepSeek-R1-Distill-Qwen-7B`, `deepseek-ai/DeepSeek-R1-Distill-Qwen-14B`, `deepseek-ai/DeepSeek-R1-Distill-Qwen-32B`, `MiniMaxAI/MiniMax-M2`, `Qwen/Qwen2.5-Coder-32B-Instruct`, `Qwen/Qwen2.5-VL-32B-Instruct`, `Qwen/Qwen2.5-VL-72B-Instruct`, and `Qwen/Qwen3-30B-A3B`. Existing configuration IDs remain readable. Removal from Dify's sort order alone is not treated as retirement.

## Runtime behavior

- MiniMax M3.1 Flash sends `reasoning_effort` through the OpenAI-compatible endpoint, always keeps reasoning split enabled, and omits the unsupported `service_tier`. Its fixed temperature is 1.
- Kimi K3.1 forwards `max_completion_tokens`, reasoning effort and structured output. The default cache TTL is five minutes; the adapter does not expose the one-hour override.
- SiliconFlow forwards supported reasoning effort for GLM 5.3 and DeepSeek V4.1. VL embeddings use one text input per request with explicit float encoding. Speech recognition now makes a multipart transcription request instead of using the SDK placeholder.
- Tongyi Qwen3 VL embeddings use the native multimodal endpoint with text inputs, selectable dimensions and validated ordered vectors. The host embedding/rerank interfaces accept text, so image/video input is not advertised. Beijing-only models reject the international endpoint switch; an explicitly configured API host retains precedence. Native text embedding usage reports provider input tokens once per successful batch.
- Step 5 uses the existing reasoning and structured-output adapter. Its maximum output is **64,000 tokens**, corrected from Dify's 1,000,000; the context window remains 1,000,000.
- StepAudio ASR uses native SSE and requires a final transcript. TTS produces MP3 with voice/speed selection and a 1,000-character input limit. Unsupported or oversized inputs fail before the API request.
- Both new ASR adapters accept inline audio and the host speech service's `{url}` input. Uploaded URLs must be public HTTPS on port 443, return a supported audio MIME type, and fit within 25 MiB. DNS is resolved and pinned at connection time to public IPv4; redirects and private/reserved addresses are rejected. Private storage URLs and IPv6-only storage require a host-owned file-resolution contract and are not silently fetched. StepAudio supports WAV/MP3/OGG/M4A; SiliconFlow also accepts FLAC/WebM/MP4.

## Price evidence and boundaries

Prices are in RMB per million tokens unless stated otherwise. These are catalog prices, not a paid API acceptance result.

| Provider/model | Input / output / cache read | Source |
| --- | --- | --- |
| MiniMax M3.1 Flash | 1 / 4 / 0.1 | [MiniMax pricing](https://platform.minimax.cn/docs/pricing/overview) |
| Kimi K3.1 Pro | 13 / 68 / 1.3; five-minute cache write 13 | [Kimi pricing](https://platform.kimi.com/docs/pricing/chat) |
| Kimi K3.1 Pro Highspeed | 26 / 136 / 1.3; five-minute cache write 26 | [Kimi pricing](https://platform.kimi.com/docs/pricing/chat) |
| SiliconFlow DeepSeek V4.1 Flash | 2 / 8 / 0.04, conservative peak-rate fallback | [SiliconFlow pricing](https://cloud-rd.siliconflow.cn/pricing) |
| SiliconFlow GLM 5.3 / Flash | 8 / 28 / 2; Flash 0.8 / 2.8 / 0.23 | [SiliconFlow pricing](https://cloud-rd.siliconflow.cn/pricing) |
| SiliconFlow Xing4.0 | Free | [SiliconFlow pricing](https://cloud-rd.siliconflow.cn/pricing) |
| SiliconFlow Qwen3 VL embedding / reranker | 0.7 input each | [SiliconFlow pricing](https://cloud-rd.siliconflow.cn/pricing) |
| Tongyi Qwen3 VL embedding / reranker | 0.7 text input / 0.5 input | [Embedding](https://help.aliyun.com/zh/model-studio/qwen3-vl-embedding), [rerank](https://help.aliyun.com/zh/model-studio/qwen3-vl-rerank) |
| Step 5 Preview | 7 / 20 / 0.70; conservative new-account cache rate | [StepFun pricing](https://platform.stepfun.com/docs/zh/guides/pricing/details) |
| OpenRouter additions | USD display rates from the models API; billing uses `usage.cost` | [OpenRouter models API](https://openrouter.ai/api/v1/models) |

SiliconFlow DeepSeek V4.1's 02:00–08:00 Beijing discount is not applied to the flat fallback; actual prices can be lower. Native RMB prices describe the domestic provider endpoints. Custom/international endpoints can have different prices. OpenRouter long-context, cache writes and routing adjustments are authoritative only when the response reports cost; the existing fail-closed reported-cost policy remains in effect.

Audio uses `pricing.type: usage` with distinct units, never token prices:

- SiliconFlow Qwen3 ASR: RMB 0.00022 per input audio second.
- StepAudio 3 ASR: free through 2026-11-08 23:59:59 Asia/Shanghai; RMB 7.50 per input audio hour from November 9.
- StepAudio 3 TTS: the same free period, then RMB 95 per million **weighted billing characters**. The provider weights Han characters at 3, Japanese characters at 2.5 and other characters at 1. This is not a generic string-length charge.

The ASR contracts do not supply authoritative audio duration, and the binary TTS response does not supply weighted billing character usage. These adapters therefore do **not** emit an inferred audio charge or fabricate zero token usage. The price rules record the provider schedule; automatic audio settlement remains pending authoritative measurement through the shared host/SDK contract. StepAudio ASR preserves provider token usage as response metadata for inspection, without converting tokens to seconds.

API references: [MiniMax OpenAI compatibility](https://platform.minimax.cn/docs/api-reference/text-openai-api), [Kimi K3.1](https://platform.kimi.com/docs/guide/kimi-k3-1-pro-quickstart), [Tongyi native embedding](https://help.aliyun.com/zh/model-studio/multimodal-embedding-api-reference), [Step 5 limits](https://platform.stepfun.com/docs/zh/guides/models/step-5-preview), [Step ASR SSE](https://platform.stepfun.com/docs/zh/api-reference/audio/asr-sse), [Step TTS](https://platform.stepfun.com/cookbook/stepaudio-3-tts).

## Review and acceptance

Focused tests cover request serialization, vector dimensions/batching, SSE completion/error handling, audio response validation and bounded uploaded-file downloads. Build and lifecycle checks run against the six distributable plugins. No paid provider request, installation, environment change or browser acceptance is included. Before rollout, exercise the target account's model entitlement, a real uploaded recording and a real speech synthesis request; check the ledger separately from the generated output.
