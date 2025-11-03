# Xpert Plugin: vLLM

## Overview

`@xpert-ai/plugin-vllm` provides a model adapter for connecting vLLM inference services to the [XpertAI](https://github.com/xpert-ai/xpert) platform. The plugin communicates with vLLM clusters via an OpenAI-compatible API, enabling agents to invoke conversational models, embedding models, vision-enhanced models, and reranking models within a unified XpertAI agentic workflow.

## Core Features

- Provides the `VLLMPlugin` NestJS module, which automatically registers model providers, lifecycle logging, and configuration validation logic.
- Wraps vLLM's conversational/inference capabilities as XpertAI's `LargeLanguageModel` via `VLLMLargeLanguageModel`, supporting function calling, streaming output, and agent token statistics.
- Exposes `VLLMTextEmbeddingModel`, reusing LangChain's `OpenAIEmbeddings` to generate vector representations for knowledge base retrieval.
- Integrates `VLLMRerankModel`, leveraging the OpenAI-compatible rerank API to improve retrieval result ranking.
- Supports declaring capabilities such as vision, function calling, and streaming mode in plugin metadata, allowing flexible configuration of different vLLM deployments in the console.

## Installation

```bash
npm install @xpert-ai/plugin-vllm
```

> **Peer Dependencies**: The host project must also provide libraries such as `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@metad/contracts`, `@langchain/openai`, `lodash-es`, `chalk`, and `zod`. Please refer to `package.json` for version requirements.

## Enabling in XpertAI

1. Add the plugin package to your system dependencies and ensure it is resolvable by Node.js.
2. Before starting the service, declare the plugin in your environment variables:
   ```bash
   PLUGINS=@xpert-ai/plugin-vllm
   ```
3. Add a new model provider in the XpertAI admin interface or configuration file, and select `vllm`.

## Credentials & Model Configuration

The form fields defined in `vllm.yaml` cover common deployment scenarios:

| Field | Description |
| --- | --- |
| `api_key` | vLLM service access token (leave blank if the service does not require authentication). |
| `endpoint_url` | Required. The base URL of the vLLM OpenAI-compatible API, e.g., `https://vllm.example.com/v1`. |
| `endpoint_model_name` | Specify explicitly if the model name on the server differs from the logical model name in XpertAI. |
| `mode` | Choose between `chat` or `completion` inference modes. |
| `context_size` / `max_tokens_to_sample` | Control the context window and generation length. |
| `agent_though_support`, `function_calling_type`, `stream_function_calling`, `vision_support` | Indicate whether the model supports agent thought exposure, function/tool calling, streaming function calling, and multimodal input, to inform UI capability hints. |
| `stream_mode_delimiter` | Customize the paragraph delimiter for streaming output. |

After saving the configuration, the plugin will call the `validateCredentials` method in the background, making a minimal request to the vLLM service to ensure the credentials are valid.

## Model Capabilities

- **Conversational Models**: Uses `ChatOAICompatReasoningModel` to proxy the vLLM OpenAI API, supporting message history, function calling, and streaming output.
- **Embedding Models**: Relies on LangChain's `OpenAIEmbeddings` for knowledge base vectorization and retrieval-augmented generation.
- **Reranking Models**: Wraps `OpenAICompatibleReranker` to semantically rerank recall results.
- **Vision Models**: If the vLLM inference service supports multimodal (text+image) input, enable `vision_support` in the configuration to declare multimodal capabilities to the frontend.

## Development & Debugging

From the repository root, enter the `xpertai/` directory and use Nx commands to build and test:

```bash
npx nx build @xpert-ai/plugin-vllm
npx nx test @xpert-ai/plugin-vllm
```

Build artifacts are output to `dist/` by default. Jest configuration is in `jest.config.ts` for writing and running unit tests.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) found at the root of the repository.
