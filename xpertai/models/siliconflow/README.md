# Xpert Plugin: SiliconFlow

SiliconFlow model provider plugin for the XpertAI platform. It provides SiliconFlow language, embedding, rerank, speech, text-to-speech, and Wan2.2 video capabilities.

## Installation

This plugin is included in the XpertAI plugins monorepo and can be loaded as `@xpert-ai/plugin-siliconflow`.

## Video Toolset

The `siliconflow_video` builtin toolset exposes:

- `siliconflow_video_submit`: submits Wan2.2 text-to-video or image-to-video requests.
- `siliconflow_video_query`: polls a request and downloads completed MP4 files into the Xpert Workspace.

Configure the toolset with a SiliconFlow API key. The default endpoint is `https://api.siliconflow.cn/v1`.

Supported video models:

- `Wan-AI/Wan2.2-T2V-A14B` for text-to-video.
- `Wan-AI/Wan2.2-I2V-A14B` for image-to-video.

Generated MP4 files are saved under `files/siliconflow/videos` in the active project or Xpert scope. SiliconFlow video URLs are temporary, so the query tool downloads them immediately after a successful status response.

## Credentials

The existing model provider uses `api_key` and the optional endpoint selection. The video toolset has its own credential form so it can be configured per Workspace toolset.

## Development

```bash
corepack pnpm -C xpertai exec nx build @xpert-ai/plugin-siliconflow --skip-nx-cache
corepack pnpm -C xpertai exec nx test @xpert-ai/plugin-siliconflow --skip-nx-cache
```

The plugin retains the existing SiliconFlow LLM, embedding, rerank, speech-to-text, and TTS providers.

## License

AGPL-3.0
