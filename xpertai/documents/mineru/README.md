# Xpert Plugin: MinerU

`@xpert-ai/plugin-mineru` connects Xpert knowledge-base document processing to MinerU. It reuses Xpert's Integration, Credential, workspace file, background task, splitter and indexing pipeline.

## Providers

- **Official API**: MinerU Precise Parsing API (`https://mineru.net/api/v4`) with Bearer access token.
- **Self-hosted**: current `mineru-api` or `mineru-router` service. The plugin uses the supported synchronous `/file_parse` endpoint because Xpert already executes document conversion in its background task pipeline.

The official Agent lightweight API is intentionally not used: it is limited to 10 MB / 20 pages and only returns Markdown, while the Precise Parsing API accepts up to 200 MB / 200 pages per task and returns the structured result archive.

## Official PDF workflow

`Source Mode = Auto` is recommended. When a knowledge document has workspace bytes, the plugin:

1. reads the source through Xpert's `XpFileSystem` permission;
2. calls `/file-urls/batch` for signed upload URLs;
3. uploads the file with `PUT` and polls `/extract-results/batch/{batch_id}`;
4. downloads each `full_zip_url`, archives raw output, and returns Markdown chunks to the existing splitter/index pipeline.

PDFs above the official 200-page or 200 MB per-file limits are split into ordered parts of at most 200 pages and approximately 190 MiB. Up to 50 parts are submitted in each official upload batch. Source page ranges and MinerU batch IDs are retained in chunk metadata.

Explicit `Public URL` mode remains available for externally reachable document URLs and uses `/extract/task` plus `/extract/task/{task_id}`.

## Integration options

| Field | Description | Default |
| --- | --- | --- |
| `serverType` | `official` or `self-hosted` | `official` |
| `apiUrl` | Official v4 base URL or self-hosted service URL | Official v4 URL |
| `apiKey` | Official access token; optional self-hosted gateway token | — |
| `uploadMode` | `auto`, `file`, or `url` for official API | `auto` |
| `pollIntervalSeconds` | Official task polling interval | `5` |
| `taskTimeoutSeconds` | Maximum extraction wait | `1800` |
| `requestTimeoutSeconds` | Per-request timeout (also bounds self-hosted synchronous parsing) | `1200` |

The access token is declared as an Integration secret and is never written to task logs or document metadata.

## Transformer options

| Field | Description | Default |
| --- | --- | --- |
| `isOcr` | Enable OCR | `true` |
| `enableFormula` | Enable formula recognition | `true` |
| `enableTable` | Enable table recognition | `true` |
| `language` | MinerU OCR language pack | `ch` |
| `modelVersion` | `vlm` or `pipeline` | `vlm` |
| `selfHostedBackend` | Current mineru-api backend (`pipeline`, `hybrid-engine`, `vlm-engine`, or HTTP client variants) | `pipeline` |
| `selfHostedServerUrl` | Model server URL for a self-hosted HTTP-client backend | — |
| `parseMethod` | Self-hosted `auto`, `txt`, or `ocr` method | `auto` |
| `preserveRawOutput` | Keep Markdown, JSON and image assets in the knowledge workspace | `true` |

## Output mapping

- Markdown is emitted as the source chunk for Xpert's configured splitter.
- `content_list.json`, stable `content_list_v2.json`, `middle.json`/`layout.json`, model output and images are archived as document assets when raw preservation is enabled.
- Image paths in Markdown and HTML image tags are rewritten to Xpert workspace URLs.
- Chunk metadata retains server type, model, batch ID/index/count and original source page range.
- ZIP entries are path-validated and extraction is bounded before workspace writes.

## Development

```bash
corepack pnpm exec nx build @xpert-ai/plugin-mineru --skipSync
corepack pnpm exec nx test @xpert-ai/plugin-mineru --skipSync
corepack pnpm exec nx lint @xpert-ai/plugin-mineru --skipSync
```

Official API documentation: <https://mineru.net/apiManage/docs>

Self-hosted API documentation: <https://opendatalab.github.io/MinerU/usage/quick_usage/>
