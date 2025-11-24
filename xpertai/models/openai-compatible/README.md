# Xpert Plugin: OpenAI-Compatible

## Overview

`@xpert-ai/plugin-openai-compatible` bridges the [XpertAI](https://github.com/xpert-ai/xpert) agent platform with any model provider that exposes an OpenAI-compatible REST API. It centralises authentication, base URL management, and capability declarations so you can wire popular services (OpenAI, Together, LM Studio, local proxies, etc.) into XpertAI without writing bespoke adapters.

## Core Features

- Ships the `OpenAICompatiblePlugin` NestJS module, which automatically registers lifecycle hooks, logging, and configuration schema validation for the provider.
- Exposes `OAIAPICompatLargeLanguageModel`, wrapping `ChatOAICompatReasoningModel` to invoke chat/completion style models with streaming, function-calling, and usage tracking support.
- Provides `OAIAPICompatTextEmbeddingModel`, delegating embedding generation to LangChain's `OpenAIEmbeddings` so vectors work seamlessly with Retrieval-Augmented Generation pipelines.
- Includes `OpenAICompatibleRerankModel` and `OpenAICompatibleSpeech2TextModel` to reuse OpenAI-compatible rerank and speech-to-text endpoints inside agent workflows.
- Uses `OpenAICompatibleProviderStrategy` to normalise credentials (API key, custom base URL, model overrides) so all model types share a single configuration surface.

## Installation

```bash
npm install @xpert-ai/plugin-openai-compatible
```

> **Peer dependencies**: Ensure your host project already provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/openai`, `chalk`, and `zod`. See `package.json` for exact version ranges.

## Enabling in XpertAI

1. Add the package to the runtime that launches the XpertAI server.
2. Declare the plugin in your environment (if you rely on env-driven loading):
   ```bash
   PLUGINS=@xpert-ai/plugin-openai-compatible
   ```
3. Restart the XpertAI service and configure a new model provider with type `openai-compatible`.

## Credentials & Model Configuration

The provider form defined in `src/openai-compatible.yaml` captures the most common OpenAI-style options:

| Field | Description |
| --- | --- |
| `api_key` | API key or bearer token used in the `Authorization` header. Leave blank if your proxy does not require auth. |
| `endpoint_url` | Base URL of the OpenAI-compatible REST API (e.g. `https://api.openai.com/v1`, `https://my-proxy/v1`). |
| `endpoint_model_name` | Override for the actual model name deployed on the endpoint if it differs from the logical name stored in XpertAI. |
| `mode` | Choose `chat` or `completion` when configuring LLM providers to match the endpoint behaviour. |
| `context_size`, `max_tokens_to_sample` | Let the UI communicate default limits for prompts and generations. |
| `streaming`, `stream_mode_delimiter`, `stream_mode_auth` | Fine-tune how streaming responses are requested and parsed. |
| `function_calling_type`, `stream_function_calling` | Advertise whether the target model supports synchronous or streaming function/tool calls. |
| `vision_support`, `structured_output_support` | Flag multimodal or JSON-mode capabilities so agent builders know which inputs are accepted. |
| `language`, `initial_prompt`, `voices` | Additional options surfaced when configuring speech-to-text or (future) TTS models. |

After you save a model configuration, the plugin runs `validateCredentials` for the relevant model class. It issues a lightweight call (`Hi` for chat, `ping` for embeddings, empty rerank requests, etc.) so credential errors surface immediately in the admin console.

## Model Capabilities

- **Large Language Models**: `OAIAPICompatLargeLanguageModel` creates a `ChatOAICompatReasoningModel`, automatically forwarding streaming callbacks and token usage metrics to the host copilot.
- **Text Embeddings**: Reuses LangChain's `OpenAIEmbeddings`, allowing both semantic search and knowledge base ingestion to target custom OpenAI-style providers.
- **Reranking**: Wraps `OpenAICompatibleReranker` to improve retrieval ordering via `/rerank` compatible APIs.
- **Speech to Text**: Instantiates `Speech2TextChatModel` for OpenAI Whisper-compatible endpoints, with language and initial prompt controls exposed through the configuration schema.

## Development & Debugging

From the repository root run the Nx targets:

```bash
npx nx build @xpert-ai/plugin-openai-compatible
npx nx test @xpert-ai/plugin-openai-compatible
```

Compiled assets live in `dist/`. Test configuration is governed by `jest.config.ts`; asset copying before publish is handled by `scripts/copy-assets.mjs`.

## License

This package inherits the repository's [AGPL-3.0 License](../../../LICENSE).
