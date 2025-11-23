# Xpert Plugin: Gemini

## Overview

`@xpert-ai/plugin-gemini` connects [Google Gemini](https://ai.google.dev/) models to the [XpertAI](https://github.com/xpert-ai/xpert) platform. The plugin integrates Google's Generative AI SDK so XpertAI agents can call the latest Gemini models (e.g., Gemini 1.5 Pro, Gemini 1.5 Flash) with support for multimodal inputs and function calling.

## Core Features

- Ships `GeminiModule`, which registers the NestJS provider strategy, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `GeminiLargeLanguageModel`, a LangChain-powered adapter that supports streaming chat completions, function calling, and token accounting callbacks for agent telemetry.
- Shares a console-ready `gemini.yaml` that drives the XpertAI UI forms (icons, help links, credential prompts) for quick operator onboarding.

## Installation

```bash
npm install @xpert-ai/plugin-gemini
```

> **Peer Dependencies**: Ensure your host service also provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/google-genai`, `lodash-es`, `chalk`, `zod`, and `tslib`. Refer to `package.json` for exact versions.

## Enabling in XpertAI

1. Declare the plugin before bootstrapping the XpertAI server:
   ```bash
   PLUGINS=@xpert-ai/plugin-gemini
   ```
2. In the XpertAI admin console (or config file), create a model provider pointing to `gemini`, then add individual models that map to the specific Gemini versions you want to use.

## Credentials & Model Configuration

The `gemini.yaml` schema backs the form fields you see in the console:

| Field             | Description                                                                          |
| ----------------- | ------------------------------------------------------------------------------------ |
| `google_api_key`  | Required. Your Google AI Studio API Key.                                             |
| `google_base_url` | Optional. Base URL if you need to route requests through a proxy or custom endpoint. |
| `file_url`        | Optional. Local FILES URL prefix to optimize upload performance.                     |

During validation, the plugin instantiates the Google Generative AI client against the provided credentials to ensure connectivity and permissions.

## Model Capabilities

- **Conversational Models**: `GeminiLargeLanguageModel` merges provider credentials with per-model overrides, turns on streaming, and registers token usage callbacks so agent telemetry stays accurate. It supports the full range of Gemini models including `gemini-1.5-pro`, `gemini-1.5-flash`, and their experimental variants.

## Development & Debugging

From the repo root, run Nx commands for this package:

```bash
cd xpertai
npx nx build @xpert-ai/plugin-gemini
npx nx test @xpert-ai/plugin-gemini
```

Artifacts land in `xpertai/models/gemini/dist`. Jest settings live in `jest.config.ts`, and the asset copier runs via `npm run prepack` before publishing.

## License

This plugin is distributed under the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
