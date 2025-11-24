# Xpert Plugin: OpenRouter

## Overview

`@xpert-ai/plugin-openrouter` connects [OpenRouter](https://openrouter.ai/) endpoints to the [XpertAI](https://github.com/xpert-ai/xpert) platform. OpenRouter provides a unified interface to access various LLMs (Large Language Models) from different providers.

## Core Features

- Ships `OpenRouterModule`, which registers the NestJS provider strategy, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `OpenRouterLargeLanguageModel`, which extends `LargeLanguageModel` to support OpenRouter's OpenAI-compatible API.
- Supports configuring API key and other parameters via the XpertAI console.

## Installation

```bash
npm install @xpert-ai/plugin-openrouter
```

## Configuration

To use this plugin, you need to configure the following credentials in the XpertAI console:

- **API Key**: Your OpenRouter API key.

## Model Capabilities

- **Large Language Models**: Supports a wide range of models available on OpenRouter (e.g., `google/gemma-2-9b-it`, `meta-llama/llama-3.1-8b-instruct`, etc.).

## Development & Debugging

From the repo root, run Nx commands for this package:

```bash
cd xpertai
npx nx build @xpert-ai/plugin-openrouter
npx nx test @xpert-ai/plugin-openrouter
```
