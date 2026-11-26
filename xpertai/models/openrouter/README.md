# Xpert Plugin: OpenRouter

## Overview

`@xpert-ai/plugin-openrouter` connects [OpenRouter](https://openrouter.ai/) endpoints to the [XpertAI](https://github.com/xpert-ai/xpert) platform. OpenRouter provides a unified interface to access various LLMs (Large Language Models) from different providers.

## Core Features

- Ships `OpenRouterModule`, which registers the NestJS provider strategy, model managers, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `OpenRouterLargeLanguageModel`, including OpenRouter reasoning streams, provider routing, verbosity, structured output, runtime sampling controls, and provider-reported pricing.
- Supports text embedding, reranking, MP3 speech synthesis, and audio transcription.
- Uses Dify and OpenRouter as catalog sources. The packaged chat catalog includes aliases with an active provider route.
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

## Verify the packaged catalog

After building the plugin, run the following commands from this directory. The check reads the packaged model definitions and the public OpenRouter catalog. It resolves missing chat aliases through their provider endpoints and verifies that each default speech voice supports MP3.

```sh
node scripts/copy-assets.mjs
node scripts/check-model-catalog.mjs
```
