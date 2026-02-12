# XpertAI Plugin: ZhipuAI Models

Zhipu AI model provider plugin for the XpertAI platform.

## Features

- Support for Zhipu conversational and completion models
- OpenAI-compatible API surface for easy integration
- Streaming responses for low-latency UI updates
- Tool-calling and instruction-following support

## Installation

This plugin is included in the XpertAI plugins monorepo and will be loaded automatically by the platform when installed.

## Configuration

Provide credentials and optional endpoints via your environment or platform configuration.

Required Credentials

- `api_key`: Your Zhipu AI API key
- `base_url` (optional): Custom API endpoint, defaults to the official Zhipu API host

## Usage

The plugin exposes an OpenAI-compatible interface so existing callers can switch providers with minimal changes. It supports streaming responses and tool-calling where the model suggests structured tool invocations.

## Basic example (pseudo):

1. Initialize the client with `api_key` and optional `base_url`.
2. Send chat messages to the `zhipuai-chat` model.
3. Receive streaming partial responses or final completions.

## License

AGPL-3.0

For more details, see the XpertAI platform docs and the example usages in the `models/zhipuai` folder.
