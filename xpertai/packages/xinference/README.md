# Xpert Plugin: Xinference

## Overview

`@xpert-ai/plugin-xinference` connects [Xorbits Inference](https://github.com/xorbitsai/inference) endpoints to the [XpertAI](https://github.com/xpert-ai/xpert) platform. The plugin speaks the OpenAI-compatible interface exposed by Xinference so XpertAI agents can call large language models, embedding models, and rerankers that you deploy on your own infrastructure.

## Core Features

- Ships `XinferenceModule`, which registers the NestJS provider strategy, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `XinferenceLargeLanguageModel`, a LangChain-powered adapter that supports streaming chat completions, function calling, and token accounting callbacks for agent telemetry.
- Provides `XinferenceTextEmbeddingModel`, which reuses LangChain's `OpenAIEmbeddings` but overrides batching/encoding logic so Xinference's float embeddings return without base64 decoding issues.
- Exposes `XinferenceRerankModel`, wrapping `OpenAICompatibleReranker` for better retrieval ordering when your Xinference deployment offers rerank-capable endpoints.
- Shares a console-ready `xinference.yaml` that drives the XpertAI UI forms (icons, help links, credential prompts) for quick operator onboarding.

## Installation

```bash
npm install @xpert-ai/plugin-xinference
```

> **Peer Dependencies**: Ensure your host service also provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/openai`, `i18next`, `chalk`, `zod`, and `tslib`. Refer to `package.json` for exact versions.

## Enabling in XpertAI

1. Add the plugin to the service dependencies so Node.js can resolve `@xpert-ai/plugin-xinference`.
2. Declare the plugin before bootstrapping the XpertAI server:
   ```bash
   PLUGINS=@xpert-ai/plugin-xinference
   ```
3. In the XpertAI admin console (or config file), create a model provider pointing to `xinference`, then add individual models that map to your Xinference deployments.

## Credentials & Model Configuration

The `xinference.yaml` schema backs the form fields you see in the console:

| Field | Description |
| --- | --- |
| `server_url` | Required. Base URL of the Xinference REST endpoint (e.g., `http://192.168.1.100:9997/v1`). |
| `model_uid` | Required. The concrete model identifier registered in Xinference; used when it differs from the logical XpertAI model name. |
| `api_key` | Optional API token. Use `no-key-required` for unsecured endpoints. |
| `invoke_timeout` | Request timeout in seconds; defaults to `60`. |
| `max_retries` | Client retry attempts for transient failures; defaults to `3`. |

During validation, the plugin instantiates lightweight LangChain clients (`ChatOpenAI`, `OpenAIEmbeddings`, `OpenAICompatibleReranker`) against the provided credentials to ensure connectivity and permissions.

## Model Capabilities

- **Conversational Models**: `XinferenceLargeLanguageModel` merges provider credentials with per-model overrides, turns on streaming, and registers token usage callbacks so agent telemetry stays accurate.
- **Embedding Models**: `XinferenceTextEmbeddingModel` batches documents, sets `encoding_format: 'float'`, and supports optional dimension overrides, making it suitable for large corpus ingestion.
- **Reranking Models**: `XinferenceRerankModel` proxies the OpenAI-compatible rerank API to refine retrieval results before answer synthesis.
- **Console Metadata**: The plugin metadata declares support for speech-to-text and TTS in advance, enabling you to extend the implementation without changing the admin UI contract.

## Development & Debugging

From the repo root, run Nx commands for this package:

```bash
cd xpertai
npx nx build @xpert-ai/plugin-xinference
npx nx test @xpert-ai/plugin-xinference
```

Artifacts land in `xpertai/packages/xinference/dist`. Jest settings live in `jest.config.ts`, and the asset copier runs via `npm run prepack` before publishing.

## License

This plugin is distributed under the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
