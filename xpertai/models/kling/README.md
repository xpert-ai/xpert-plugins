# Kling AI video generation

`@xpert-ai/plugin-kling` provides asynchronous Kling AI video generation tools for Xpert and
implements the platform `videoGeneration` protocol v2.

## Authentication

The runtime uses the current Kling API 2.0 API Key flow:

```text
Authorization: Bearer <api-key>
```

The plugin never writes the API key, provider result URLs, or complete provider responses to logs
or Workspace metadata. Access Key / Secret Key JWT credentials are intentionally not accepted by
the runtime because Kling's current documentation limits that credential format to legacy API
designs and states that new models require an API Key.

## Capability matrix

| Model | Text to video | Image to video | First + last frame | Raw reference images |
| --- | --- | --- | --- | --- |
| `kling-v3` | Yes | Yes | Yes | No |
| `kling-v3-omni` | Yes | Yes | Yes | Up to 7 |
| `kling-3.0-turbo` | Yes | Yes | No | No |

The plugin does not declare raw reference video or audio support. The current Omni API accepts a
reference video by URL, while Xpert supplies private Workspace file references; no official upload
transport was verified that would make those files safely reachable by Kling. Kling Elements are
also not treated as raw reference images: the provider requires a separately created `element_id`.

No cancellation tool is exposed because the current official task API documents creation and
query but does not document cancellation.

## Official documentation decisions

Checked on 2026-08-07:

- [Open Platform overview](https://kling.ai/document-api/guides/get-started/overview)
- [Authentication](https://kling.ai/document-api/api/get-started/authentication)
- [Video capability map](https://kling.ai/document-api/guides/capability-map/video)
- [Kling 3.0 text to video](https://kling.ai/document-api/api/video/3-0-omni/text-to-video)
- [Kling 3.0 image to video](https://kling.ai/document-api/api/video/3-0-omni/image-to-video)
- [Kling 3.0 Omni video](https://kling.ai/document-api/api/video/3-0-omni/video-omni)
- [Kling 3.0 Turbo text to video](https://kling.ai/document-api/api/video/3-0-turbo/text-to-video)
- [Kling 3.0 Turbo image to video](https://kling.ai/document-api/api/video/3-0-turbo/image-to-video)

The implementation uses `https://api-singapore.klingai.com`, `/tasks?task_ids=...`, and the
official task statuses `submitted`, `processing`, `succeeded`, and `failed`. Completed MP4 output is
downloaded immediately and persisted through Workspace Files because provider result URLs expire.

## Development

```bash
corepack pnpm build
corepack pnpm test
```
