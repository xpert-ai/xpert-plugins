# Xpert Plugin: Volcengine

## Introduction

`@xpert-ai/plugin-volcengine` is a standard adapter for the [XpertAI](https://github.com/xpert-ai/xpert) platform to access Volcengine (Doubao, etc.) large model services. The plugin connects to Volc Ark's OpenAI-compatible API, providing a unified entry point for agents to access capabilities such as conversation and function calling within a workflow.

## Core Features

- Integrates Volcengine Ark platform's LLM/OpenAI-compatible interface, supporting key authentication, region selection, and multi-tenant configuration.
- Registers the `VolcenginePlugin` NestJS module, automatically wiring up model providers, lifecycle logging, and configuration validation logic for easy enablement in XpertAI applications.
- Provides `VolcengineLargeLanguageModel`, encapsulating Doubao-like conversational models with support for function calling, streaming output, token counting, and chain-of-thought exposure.

## Supported Model Types

- **Conversational Models**: Function calling, tool calling, streaming output, and chain-of-thought reasoning.

## Installation

```bash
npm install @xpert-ai/plugin-volcengine
```

> **Peer Dependencies**: The host project must also provide libraries such as `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@xpert-ai/contracts`, `@langchain/openai`, `lodash-es`, `chalk`, and `zod`. Please refer to `package.json` for specific versions.

## Enabling in XpertAI

1. Install the plugin in the project where the XpertAI service runs, and ensure Node.js can resolve the package.
2. Before starting the service, declare the plugin via environment variables:
    ```bash
    PLUGINS=@xpert-ai/plugin-volcengine
    ```
3. In the XpertAI console or configuration file, add a new model provider, select `volcengine`, and fill in the corresponding Ark/Doubao model configuration.

## Configuration

The configuration form is defined by `volcengine.yaml`, covering common Ark model deployment scenarios:

| Field | Description |
| --- | --- |
| `ark_api_key` | Required. API key from the Volcengine Ark console. |
| `api_endpoint_host` | Optional. API base URL, defaulting to `https://ark.cn-beijing.volces.com/api/v3`. |

Before creating or updating credentials, the plugin calls `doubao-seed-2-0-mini-260215` with a minimal prompt, thinking disabled, and a five-token output limit. The key must have access to this model. Authentication errors, unavailable models, and requests exceeding the ten-second timeout prevent saving; failed requests are not retried.

## Development & Debugging

In the repository root, enter `xpertai/` and use Nx commands to build and test:

```bash
npx nx build @xpert-ai/plugin-volcengine
npx nx test @xpert-ai/plugin-volcengine
```

Build artifacts are output to the `dist/` directory by default. Unit test configuration is in `jest.config.ts`; you can extend coverage as needed.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) in the repository root.
