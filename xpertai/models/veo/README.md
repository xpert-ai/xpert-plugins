# Xpert Veo Plugin

This package provides Google Veo video generation as an Xpert built-in Toolset.
It implements Xpert video generation protocol v2 and stores completed videos in
Workspace Files.

## API decision

The plugin uses the Gemini Developer API rather than Vertex AI:

- submit: `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:predictLongRunning`
- query: `GET https://generativelanguage.googleapis.com/v1beta/{operationName}`
- authentication: `x-goog-api-key`
- completed video: download the returned Gemini video URI with the same API key,
  then immediately persist it to Workspace Files

This surface was selected because it has an official REST contract for text,
initial-image, first/final-frame, and asset-reference generation and uses one API
key credential. The package boundary remains Veo-specific so a future Vertex AI
adapter can be added without changing the Xpert video generation protocol.

Official documentation:

- https://ai.google.dev/gemini-api/docs/veo?hl=en
- https://ai.google.dev/gemini-api/docs/image-understanding?hl=en

## Supported models and modes

| Model | Text | Initial image | First + final frame | Asset reference images |
| --- | --- | --- | --- | --- |
| `veo-3.1-generate-preview` | Yes | Yes | Yes | 1-3 images |
| `veo-3.1-fast-generate-preview` | Yes | Yes | Yes | 1-3 images |

The plugin does not declare cancellation because the selected Gemini REST API
does not document a Veo cancellation operation. Video extension is also omitted:
the platform's `reference_to_video` mode represents independent reference media,
whereas Gemini extension accepts only a previously generated Veo video.

Provider constraints are checked before submission:

- duration is exactly 4, 6, or 8 seconds
- asset-reference generation requires 8 seconds
- 1080p and 4k require 8 seconds
- aspect ratio is 16:9 or 9:16
- audio is always generated and cannot be disabled
- inline request bodies are limited to 20 MB
- prompts are limited to 1,024 characters by this integration, conservatively
  below the provider's 1,024-token prompt limit for normal prose

## Development

```bash
pnpm build
pnpm typecheck
pnpm test
```
