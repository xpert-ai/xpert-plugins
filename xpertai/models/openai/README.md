# OpenAI model provider

Provides OpenAI text generation, image input, structured output and Xpert function calling through the Responses API.

All five current models explicitly declare `openai_responses` for the existing native transport. Host policy and the SDK requirements in [NATIVE_PROTOCOL.md](./NATIVE_PROTOCOL.md) still apply.

## Current models

Verified against official API documentation on 2026-10-30. Prices below are USD per million tokens for Standard processing up to 272,000 input tokens.

| Model ID | Reasoning efforts | Input | Cached input | Output |
| --- | --- | ---: | ---: | ---: |
| `gpt-6-astra` | low, medium, high, xhigh, max | 10 | 1 | 50 |
| `gpt-6.1-sol` | low, medium, high, xhigh, max | 2 | 0.10 | 10 |
| `gpt-6.1-terra` | none, low, medium, high, xhigh, max | 1 | 0.05 | 5 |
| `gpt-6-luna` | none, low, medium, high, xhigh, max | 0.10 | 0.01 | 0.50 |
| `gpt-6-sol` | none, low, medium, high, xhigh, max | 2 | 0.20 | 10 |

All five use `medium` by default, a 1,050,000-token context window, a maximum 922,000-token input and a maximum 128,000-token output including reasoning. The plugin defaults the output budget to 32,768. Input and output must fit in the context window. GPT-6.1 Sol is the newer Sol entry; GPT-6 Sol remains selectable.

Sources: [Astra](https://developers.openai.com/api/docs/models/gpt-6-astra), [6.1 Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [6.1 Terra](https://developers.openai.com/api/docs/models/gpt-6.1-terra), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna), [6 Sol](https://developers.openai.com/api/docs/models/gpt-6-sol), [migration requirements](https://developers.openai.com/api/docs/guides/latest-model).

The current additions cover the GPT-6 LLM family. Audio, realtime, embeddings and standalone image/video generation use different APIs and are outside this LLM provider. A model supporting an OpenAI-hosted tool does not automatically register that tool in Xpert.

## Catalog cleanup

The preset catalog contains the five GPT-6 models above plus `gpt-5.2`, `gpt-5.2-pro` and `gpt-5.3-codex`.

- Remove `gpt-5.4`, `gpt-5.4-pro` and `gpt-5` from Xpert's presets as part of this catalog update. This selection does not imply that all three are shut down by OpenAI.
- Remove `gpt-5.2-codex` and the old `gpt-5.2-chat` entry. OpenAI has shut down GPT-5.2 Codex and GPT-5.2 Chat (`gpt-5.2-chat-latest` in the official API).
- Retain GPT-5.3 Codex while it remains available; OpenAI marks it deprecated with shutdown scheduled for 2027-04-01. See the [official deprecations](https://developers.openai.com/api/docs/deprecations).

Removed entries are excluded from model selection and native transport discovery. Packaging removes their stale YAML assets from earlier builds. Saved Assistant configurations are not rewritten; select a retained model when migrating an Assistant that uses a removed entry. Legacy request handling remains for saved or custom configurations and does not restore removed catalog entries.

## Configuration

1. Configure the OpenAI provider with an API key authorized for the intended models. Official credential validation reads `/v1/models`; restricted keys need model-list read permission. This validates authentication, not access to every model or billing availability.
2. Leave the endpoint empty for `https://api.openai.com/v1`, or supply a Responses-compatible base URL. Custom endpoints use generation-based validation, trying only models in the current preset catalog in catalog order until one succeeds or an error unrelated to model availability occurs.
3. Select the exact model ID in the Assistant and set reasoning effort and output budget. No existing Assistant is switched automatically.

For the current official models, `temperature` and `top_p` are sent only at `reasoning_effort: none`. Astra and 6.1 Sol never expose `none`. Saved `minimal` values normalize to `low`; saved `none` on Astra/6.1 Sol normalizes to `low`. The endpoint sampling override cannot force unsupported sampling on the official API; explicitly enabled sampling on a custom gateway remains supported.

The same sampling restrictions protect registered legacy reasoning models, including retained GPT-5.2 and saved GPT-5.4 configurations. These two models allow sampling with `none` (their API default); switching a call to higher reasoning removes sampling parameters from the serialized request. Registered GPT-5, Pro and Codex models without a `none` mode omit sampling even when explicitly enabled on the official endpoint. See [GPT-5.2 parameter compatibility](https://developers.openai.com/api/docs/guides/latest-model?model=gpt-5.2#gpt-52-parameter-compatibility).

The existing LangChain 0.6.9 dependency does not recognize GPT-6 reasoning. The plugin's Responses adapter forwards reasoning for explicitly registered model IDs, including `max`, without guessing capabilities from a name prefix. The outer ChatOpenAI and its custom Responses instance receive the same output, streaming and sampling settings.

## Pricing boundaries

- Above **272,000** input tokens, input and cache rates double and output rates increase by 1.5 for the **whole request**. Both detailed price rules and legacy input/output estimates encode this boundary.
- Cache writes use the documented Standard 30-minute rate: 1.25 times input pricing before long-context adjustments. Cached input and reasoning token details are retained in the standard LangChain usage fields for both streaming and non-streaming responses.
- Accurate cache billing requires a host SDK that consumes detailed `pricing.rules` and provider usage. Older hosts using only legacy input/output prices cannot calculate cache discounts correctly.
- Fast, Ultrafast, Batch/Flex, regional surcharges and 12-hour cache retention are not exposed by this plugin. These catalog rates must not be reused for those modes or a custom gateway with different pricing.
- Full 922K input-limit enforcement remains upstream: the current shared model profile exposes context size and output limits, not a separate maximum input field.

## Validation

From the `xpertai` workspace:

```sh
corepack pnpm exec nx run @xpert-ai/plugin-openai:test --runInBand
corepack pnpm exec nx run @xpert-ai/plugin-openai:build
corepack pnpm exec nx run @xpert-ai/plugin-openai:typecheck
node ../plugin-dev-harness/dist/index.js --workspace . --plugin @xpert-ai/plugin-openai
```

Follow the harness README's Node 20 recommendation if Node 22 fails to load the dependency graph. For an intentionally unchanged dependency installation, `pnpm_config_verify_deps_before_run=false` skips pnpm's automatic install check; `--skipSync` avoids applying unrelated Nx workspace reference updates.

The regression suite uses the real LangChain/OpenAI request serializers with an intercepted fetch and fake credentials. It checks the model catalog, reasoning, sampling, output budget, structured output, tool/image request payloads, a function-call/result round trip, streaming reasoning, token details, authentication and existing gateway behavior. It makes no paid API requests. Lifecycle checks use a disposable Nest application context with host infrastructure mocks; they do not install the plugin into a running Xpert server.

After installation, separately verify a real text/image request and a tool-call round trip with the account's actual model permissions. Local checks do not establish installed-runtime or business acceptance.
