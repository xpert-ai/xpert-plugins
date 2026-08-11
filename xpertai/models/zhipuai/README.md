# XpertAI Plugin: ZhipuAI Models

Zhipu AI model provider plugin for the XpertAI platform.

## Features

- Support for Zhipu conversational and completion models
- OpenAI-compatible API surface for easy integration
- Streaming responses for low-latency UI updates
- Tool-calling and instruction-following support
- CogVideoX text-to-video and image-to-video toolset with Workspace artifacts

## Installation

This plugin is included in the XpertAI plugins monorepo and will be loaded automatically by the platform when installed.

## Configuration

Provide credentials and optional endpoints via your environment or platform configuration.

Required Credentials

- `api_key`: Your Zhipu AI API key
- `base_url` (optional): Custom API endpoint, defaults to the official Zhipu API host

## Usage

The plugin exposes an OpenAI-compatible interface so existing callers can switch providers with minimal changes. It supports streaming responses and tool-calling where the model suggests structured tool invocations.

## CogVideoX Toolset

The `zhipu_cogvideo` builtin toolset adds two tools:

- `zhipu_cogvideo_submit`: submits a text-to-video or image-to-video task and returns its task ID.
- `zhipu_cogvideo_query`: checks the task, waits for a bounded period, and uploads completed MP4 files and cover images to the Xpert Workspace.

Configure the toolset with a ZhipuAI API key. The endpoint defaults to `https://open.bigmodel.cn/api/paas/v4`. Generated files are stored under `files/zhipuai/cogvideo/` in the current project or Xpert scope.

## Basic example (pseudo):

1. Initialize the client with `api_key` and optional `base_url`.
2. Send chat messages to the `zhipuai-chat` model.
3. Receive streaming partial responses or final completions.

## License

AGPL-3.0

For more details, see the XpertAI platform docs and the example usages in the `models/zhipuai` folder.
