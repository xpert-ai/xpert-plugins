# Xpert Plugin: Moonshot AI

## Overview

`@xpert-ai/plugin-moonshot` connects [Moonshot AI (Kimi)](https://platform.moonshot.cn/) models to the [XpertAI](https://github.com/xpert-ai/xpert) platform. The plugin integrates Moonshot's OpenAI-compatible API so XpertAI agents can leverage Kimi's powerful long-context language models with context windows up to 128K tokens, including the latest K2 series with advanced reasoning capabilities.

## Core Features

- Ships `MoonshotModule`, which registers the NestJS provider strategy, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `MoonshotLargeLanguageModel`, a LangChain-powered adapter built on `ChatOpenAI` that supports streaming chat completions, function calling, and token accounting callbacks for agent telemetry.
- Shares a console-ready `moonshot.yaml` that drives the XpertAI UI forms (icons, help links, credential prompts) for quick operator onboarding.
- Supports multiple Moonshot model variants including:
  - **Moonshot V1 Series**: `moonshot-v1-8k`, `moonshot-v1-32k`, `moonshot-v1-128k` for various context length requirements
  - **Kimi K2 Series**: `kimi-k2-0711-preview`, `kimi-k2-0905-preview`, `kimi-k2-turbo-preview` for enhanced performance
  - **Kimi K2 Thinking Series**: `kimi-k2-thinking`, `kimi-k2-thinking-turbo` for advanced reasoning tasks

## Installation

```bash
npm install @xpert-ai/plugin-moonshot
```

> **Peer Dependencies**: Ensure your host service also provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/openai`, `chalk`, and `zod`. Refer to `package.json` for exact versions.

## Enabling in XpertAI

1. Declare the plugin before bootstrapping the XpertAI server:
   ```bash
   PLUGINS=@xpert-ai/plugin-moonshot
   ```
2. In the XpertAI admin console (or config file), create a model provider pointing to `moonshot`, then add individual models that map to the specific Moonshot/Kimi versions you want to use.

## Credentials & Model Configuration

The `moonshot.yaml` schema backs the form fields you see in the console:

| Field      | Description                                                                                                    |
| ---------- | -------------------------------------------------------------------------------------------------------------- |
| `api_key`  | Required. Your Moonshot API Key from [platform.moonshot.cn/console/api-keys](https://platform.moonshot.cn/console/api-keys). |
| `base_url` | Optional. Base URL for API requests (defaults to `https://api.moonshot.cn/v1`). Useful for proxy configurations. |

During validation, the plugin instantiates a ChatOpenAI client with your credentials and sends a test message ("你好") to ensure connectivity and permissions.

## Model Capabilities

- **Long Context Support**: All Moonshot models excel at handling long-context scenarios, with the V1-128K variant supporting up to 128,000 tokens of context.
- **Conversational Models**: `MoonshotLargeLanguageModel` merges provider credentials with per-model overrides, enables streaming, and registers token usage callbacks so agent telemetry stays accurate.
- **Advanced Reasoning**: The K2 Thinking series models provide enhanced reasoning capabilities for complex problem-solving tasks.
- **OpenAI Compatibility**: Built on LangChain's `ChatOpenAI`, ensuring seamless integration with existing OpenAI-compatible workflows.

## Development & Debugging

From the repo root, run Nx commands for this package:

```bash
cd xpertai
npx nx build @xpert-ai/plugin-moonshot
npx nx test @xpert-ai/plugin-moonshot
```

Artifacts land in `xpertai/models/moonshot/dist`. Jest settings live in `jest.config.ts`, and the asset copier runs via `npm run prepack` before publishing.

## License

This plugin is distributed under the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
