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

Credential verification requires a host that supports the provider's `credentialValidation` policy. Select a text model you can access, or enter its custom Endpoint ID, in the credential dialog. The host tests that exact target before saving, with a minimal prompt, thinking disabled, a five-token output limit, a ten-second timeout and no retries. No model is selected automatically. The target is used only for validation; it does not change the Assistant's model or get stored with the API key.

Ark's documented [ListFoundationModels](https://docs.volcengine.com/docs/ark/list-foundation-models-api?lang=zh) and [ListModelActivations](https://docs.volcengine.com/docs/ark/list-model-activations-api?lang=zh) APIs require Access Key authentication. As of 2026-10-19 there is no documented model-list API for ordinary Ark API keys, so this plugin does not advertise `discoverModels` or assume OpenAI's `/models` endpoint is available. The model picker shows reference metadata, not proof of key permissions. Listing support in other providers is handled by the host's existing `discoverModels` contract.

Deploy the host's credential-validation update before this plugin. Older hosts only run the plugin's local field checks and cannot perform the selected-model validation.

## Development & Debugging

In the repository root, enter `xpertai/` and use Nx commands to build and test:

```bash
npx nx build @xpert-ai/plugin-volcengine
npx nx test @xpert-ai/plugin-volcengine
```

Build artifacts are output to the `dist/` directory by default. Unit test configuration is in `jest.config.ts`; you can extend coverage as needed.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) in the repository root.
