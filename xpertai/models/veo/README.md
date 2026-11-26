# Xpert Google Video Plugin

This package runs Google video generation through the Xpert video toolset and saves completed videos to Workspace Files. Configure a Gemini Developer API key.

## Generating with Gemini Omni

New jobs use `gemini-omni-1.2-flash`. The tool enqueues the job, submits a background request to `POST /v1beta/interactions`, and polls the interaction and its output file before downloading the video. The tool names and job handles remain compatible with existing workflows. Workflows that explicitly selected a retired Veo 3.1 model must select Gemini Omni for new jobs. Existing Veo operation names can still be queried.

The tool accepts text, an initial image, a first and last frame, or up to six reference images. Choose an integer duration of 3–15 seconds. First/last-frame interpolation supports up to 10 seconds. Supported resolutions are 360p, 720p, 1080p, and 4K in landscape or portrait. Audio is generated with the video.

Omni usage comes from the interaction. Input, video output, and text or thinking output have separate token rates. See the [Gemini Omni API guide](https://ai.google.dev/gemini-api/docs/omni) and [Google pricing](https://ai.google.dev/gemini-api/docs/pricing#gemini-omni-1.2-flash).

## Development

```bash
pnpm build
pnpm typecheck
pnpm test
```
