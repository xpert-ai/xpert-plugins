# Xpert Plugin: OpenRouter

## Overview

`@xpert-ai/plugin-openrouter` connects [OpenRouter](https://openrouter.ai/) endpoints to the [XpertAI](https://github.com/xpert-ai/xpert) platform. OpenRouter provides a unified interface to access various LLMs (Large Language Models) from different providers.

## Core Features

- Ships `OpenRouterModule`, which registers the NestJS provider strategy, model managers, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `OpenRouterLargeLanguageModel`, including OpenRouter reasoning streams, provider routing, verbosity, structured output, runtime sampling controls, and provider-reported pricing.
- Supports OpenRouter text embedding and text rerank endpoints in addition to chat models.
- Synchronizes the predefined LLM, embedding, and rerank catalogs from Dify's official OpenRouter plugin.
- Supports configuring API key, endpoint URL, model capabilities, and runtime parameters via the XpertAI console.

## Installation

```bash
npm install @xpert-ai/plugin-openrouter
```

## Configuration

To use this plugin, you need to configure the following credentials in the XpertAI console:

- **API Key**: Your OpenRouter API key.

## Model Capabilities

- **Large Language Models**: Ships the current OpenRouter predefined catalog and supports customizable models with explicit capability metadata.
- **Text Embeddings**: Supports OpenRouter's OpenAI-compatible embedding endpoint.
- **Text Rerank**: Supports OpenRouter's `/rerank` endpoint for the predefined rerank catalog.

## Development & Debugging

From the repo root, run Nx commands for this package:

```bash
cd xpertai
npx nx build @xpert-ai/plugin-openrouter
npx nx test @xpert-ai/plugin-openrouter
```
