# Xpert Plugin: Anthropic

## Overview

`@xpert-ai/plugin-anthropic` provides a model adapter for connecting Anthropic's Claude models to the [XpertAI](https://github.com/xpert-ai/xpert) platform. The plugin enables agents to invoke Claude series models with support for streaming, tool calling, and vision capabilities within a unified XpertAI agentic workflow.

## Core Features

- Provides the `AnthropicPlugin` NestJS module, which automatically registers model providers, lifecycle logging, and configuration validation logic.
- Wraps Anthropic's Claude models as XpertAI's `LargeLanguageModel` via `AnthropicLargeLanguageModel`, supporting function calling (tool use), streaming output, and agent token statistics.
- Supports vision capabilities for vision-enabled Claude models.
- Integrates seamlessly with XpertAI's agent workflow system.

## Installation

```bash
npm install @xpert-ai/plugin-anthropic
```

> **Peer Dependencies**: The host project must also provide libraries such as `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/anthropic`, `chalk`, and `zod`. Please refer to `package.json` for version requirements.

## Enabling in XpertAI

1. Add the plugin package to your system dependencies and ensure it is resolvable by Node.js.
2. Before starting the service, declare the plugin in your environment variables:
   ```bash
   PLUGINS=@xpert-ai/plugin-anthropic
   ```
3. Add a new model provider in the XpertAI admin interface or configuration file, and select `anthropic`.

## Credentials & Model Configuration

The form fields defined in `anthropic.yaml` cover common Anthropic deployment scenarios:

- **API Key**: Your Anthropic API key (required)
- **Model Name**: The Claude model identifier (e.g., `claude-3-5-sonnet-20241022`, `claude-3-opus-20240229`)
- **Context Size**: Maximum context window size (default: 200000)
- **Max Tokens**: Maximum tokens to generate (default: 4096)
- **Function Calling**: Enable/disable tool calling support
- **Vision Support**: Enable/disable vision capabilities
- **Streaming**: Enable/disable streaming output

## Supported Model Types

- **Large Language Models (LLM)**: Claude series models with support for:
  - Conversational interactions
  - Tool calling (function calling)
  - Streaming output
  - Vision capabilities (for vision-enabled models)

## Model Examples

Common Claude model identifiers:
- `claude-3-5-sonnet-20241022` - Latest Claude 3.5 Sonnet
- `claude-3-opus-20240229` - Claude 3 Opus
- `claude-3-sonnet-20240229` - Claude 3 Sonnet
- `claude-3-haiku-20240307` - Claude 3 Haiku

The plugin supports all available Claude models from Anthropic. You can use any valid model identifier from the Anthropic API. For the latest model list, refer to [Anthropic's documentation](https://docs.anthropic.com/claude/docs/models-overview).

## Configuration Example

When configuring a model provider in XpertAI:

1. Select provider type: `anthropic`
2. Enter your Anthropic API key
3. Specify the model name (e.g., `claude-3-5-sonnet-20241022`)
4. Set context size (default: 200000)
5. Configure max tokens (default: 4096)
6. Enable/disable features as needed:
   - Function calling: `tool_call`
   - Vision support: `support`
   - Streaming: `supported`

## Development

This plugin is built using:
- TypeScript
- NestJS
- LangChain Anthropic SDK
- XpertAI Plugin SDK

## License

See the main repository LICENSE file.
