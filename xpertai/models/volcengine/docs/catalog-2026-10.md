# Ark catalog update — 2026-10-27

Verified against the [model list](https://docs.volcengine.com/docs/ark/model-list?lang=zh), [reasoning API](https://docs.volcengine.com/docs/ark/deep-thinking?lang=zh), [DeepSeek guide](https://docs.volcengine.com/docs/ark/deepseek-v4-1-flash?lang=zh) and [pricing](https://docs.volcengine.com/docs/ark/model-pricing?lang=zh). Prices below are CNY per million tokens, excluding discounts; image prices are per successful generated image.

| Added model | Context / maximum output | Input / output / cache hit |
| --- | --- | --- |
| `doubao-seed-evolving` | 1,048,576 / 262,144 | 6 / 30 / 1.2 |
| `doubao-seed-2-1-pro-260915` | 1,048,576 / 262,144 | 6 / 30 / 1.2 |
| `doubao-seed-2-1-lite-260915` | 1,048,576 / 262,144 | 0.8 / 2.7 / 0.16 (non-audio input) |
| `deepseek-v4-1-flash-261017` | 1,048,576 / 393,216 | off-peak 1 / 4 / 0.02; peak 2 / 8 / 0.04 |
| `deepseek-v4-1-flash-economy-261017` | 1,048,576 / 393,216 | off-peak 0.8 / 3.2 / 0.016; peak 1.6 / 6.4 / 0.032 |
| `deepseek-v4-flash-ga-260731` | 1,048,576 / 393,216 | 3 / 9 / 0.1 |
| `kimi-k3-1-pro-261024` | 1,048,576 / 131,072 | 13 / 68 / 1.3 |
| `doubao-seedream-5-0-flash-260915` | image | 0.12/image; input images free |

The LLM rows include the separately reported cache storage tariff of 0.017 CNY per million token-hours. No storage amount is invented when usage does not report it. The catalog exposes text/image/video LLM input; Seed Lite's separate audio tariff is not represented by the token-only LLM usage contract.

Peak pricing applies Monday–Friday, 09:00–12:00 and 14:00–18:00, Asia/Shanghai, at response completion. `pricing.ts` supplies explicit `ark_peak`/`ark_off_peak` modes to the SDK price rules; weekends are always off-peak. Repricing known usage accepts its explicit timestamp. The existing `deepseek-v4-1-flash-260910` is corrected to the same schedule, supported reasoning levels and 128K default output budget. `deepseek-v4-pro-ga-260813` gains its cache tariffs and documented output limit. DeepSeek V4.1's `none` disables thinking; `minimal` means low thinking and is no longer described as disabled.

The Economy variant retains the generic 4K default output budget: the guide's explicit 128K exception names only the standard 260910/261017 IDs. Its maximum configurable output remains 393,216.

The historical `doubao-seed-evolving-latest-version` entry remains addressable but deprecated. New selections use the official `doubao-seed-evolving` ID. No persisted model reference is rewritten.

Reasoning and Ark `encrypted_content` are retained in streaming and non-streaming assistant histories, including tool continuations. Invocation-local state prevents concurrent requests from mixing histories.

[Seedream 5.0 Pro/Flash](https://docs.volcengine.com/docs/ark/seedream-5-0-pro?lang=zh) tools expose Flash, allow up to 10 reference images and PNG/JPEG output, and omit unsupported stream/sequential-generation fields. Flash shares the Pro 1K/2K size presets, not the Lite 3K/4K presets. Its single-image tariff is separate from Pro's resolution/input-image tariffs.

Validation uses mocked HTTP and the local plugin lifecycle harness. It does not establish availability for a particular Ark account or deployment.
