# Xpert Plugin: MiniMax

## Overview

`@xpert-ai/plugin-minimax` connects [MiniMax AI](https://www.minimaxi.com/) models to the [XpertAI](https://github.com/xpert-ai/xpert) platform. The plugin integrates MiniMax's OpenAI-compatible API so XpertAI agents can leverage MiniMax's large language models, text embeddings, and text-to-speech capabilities.

## Core Features

- Ships `MiniMaxModule`, which registers the NestJS provider strategy, lifecycle hooks, and configuration schema required by the plugin runtime.
- Implements `MiniMaxLargeLanguageModel`, a LangChain-powered adapter built on `ChatOAICompatReasoningModel` that supports streaming chat completions, function calling, and token accounting callbacks for agent telemetry.
- Provides `MiniMaxTextEmbeddingModel`, a custom implementation that handles MiniMax's specific embedding API format with support for document and query embedding types.
- Exposes `MiniMaxTTSModel`, which supports streaming text-to-speech synthesis with multiple voice options and audio formats.
- Shares a console-ready `manifest.yaml` that drives the XpertAI UI forms (icons, help links, credential prompts) for quick operator onboarding.

## Installation

```bash
npm install @xpert-ai/plugin-minimax
```

> **Peer Dependencies**: Ensure your host service also provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/core`, `@langchain/openai`, `zod`, and `tslib`. Refer to `package.json` for exact versions.

## Enabling in XpertAI

1. Add the plugin to the service dependencies so Node.js can resolve `@xpert-ai/plugin-minimax`.
2. Declare the plugin before bootstrapping the XpertAI server:
   ```bash
   PLUGINS=@xpert-ai/plugin-minimax
   ```
3. In the XpertAI admin console (or config file), create a model provider pointing to `minimax`, then add individual models that map to the specific MiniMax model variants you want to use.

## Credentials & Model Configuration

The plugin schema backs the form fields you see in the console:

| Field | Description |
| --- | --- |
| `api_key` | Required. Your MiniMax API Key from [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key). |
| `group_id` | Required. Your MiniMax Group ID from [platform.minimaxi.com](https://platform.minimaxi.com/user-center/basic-information/interface-key). |
| `base_url` | Optional. Base URL for API requests (defaults to `https://api.minimaxi.com`). Useful for custom endpoints or proxy configurations. |

During validation, the plugin checks that both `api_key` and `group_id` are provided and validates the base URL format if specified.

## Supported Models

### Large Language Models (LLM)
- `MiniMax-M2.5` - Latest flagship model, excels at coding and agentic tasks (196K context)
- `MiniMax-M2.5-highspeed` - High-speed variant of M2.5 with 100 tokens/s throughput
- `MiniMax-M2.1` - Enhanced reasoning model with 230B parameters (196K context)
- `MiniMax-M2.1-highspeed` - High-speed variant of M2.1
- `MiniMax-M2` - MiniMax M2 model with agentic capabilities (196K context)
- `M2-her` - Specialized for role-playing and multi-turn conversations (65K context)
- `minimax-m1` - MiniMax M1 open-source model (1M context)

### Text Embedding Models
- `embo-01` - MiniMax embedding model

### Text-to-Speech Models
- `speech-2.8-hd` - Latest HD TTS with 40 languages and 7 emotional variants
- `speech-2.8-turbo` - Latest turbo TTS with 40 languages and 7 emotional variants
- `speech-2.6-hd` - HD voice generation supporting 40 languages
- `speech-2.6-turbo` - Low-latency voice generation supporting 40 languages
- `speech-02-hd` - HD Speech-02 model with 24 languages
- `speech-02-turbo` - Turbo Speech-02 model with 24 languages

## Model Capabilities

- **Conversational Models**: `MiniMaxLargeLanguageModel` merges provider credentials with per-model overrides, enables streaming, and registers token usage callbacks so agent telemetry stays accurate.
- **Embedding Models**: `MiniMaxTextEmbeddingModel` implements custom embedding logic to handle MiniMax's specific API format, supporting both document and query embedding types.
- **TTS Models**: `MiniMaxTTSModel` supports streaming text-to-speech synthesis with configurable voice settings, audio formats (mp3, wav, opus, aac, flac), and playback speed.

## Development & Debugging

From the repo root, run Nx commands for this package:

```bash
cd xpertai
npx nx build models/minimax
npx nx lint models/minimax
```

Artifacts land in `xpertai/models/minimax/dist`. Jest settings live in `jest.config.ts`.

## License

This plugin is distributed under the [MIT License](../../../LICENSE) located at the repository root.
