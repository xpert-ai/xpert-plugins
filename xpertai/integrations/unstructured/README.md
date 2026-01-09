# Xpert Plugin: Unstructured

`@xpert-ai/plugin-unstructured` brings the [Unstructured](https://www.unstructured.io/) document partitioning API into the [Xpert AI](https://github.com/xpert-ai/xpert) platform. It lets ingestion workflows call Unstructured’s `/general/v0/general` endpoint, convert PDFs and mixed-format documents into markdown chunks, persist image/table assets to the Xpert file system, and return `Document<ChunkMetadata>` objects that are ready for downstream RAG pipelines.

## Installation

```bash
pnpm add @xpert-ai/plugin-unstructured
# or
npm install @xpert-ai/plugin-unstructured
```

> **Peer dependencies:** `@xpert-ai/plugin-sdk`, `@nestjs/common@^11`, `@nestjs/config@^4`, `@metad/contracts`, `@langchain/core@^0.3.72`, `chalk@4`, `lodash-es`, and `zod`. Install them in the host service if they are not already available.

## Quick Start

1. **Collect Unstructured credentials**  
   - Create an API key from the Unstructured dashboard.  
   - Default base URL: `https://api.unstructuredapp.io`.

2. **Configure the integration**  
   - **Via Xpert AI System:** Add an integration of type `unstructured` and fill in the fields below.  
   - **Via environment variables (fallback when no integration is stored):**

     ```sh
     export UNSTRUCTURED_API_BASE_URL=https://api.unstructuredapp.io
     export UNSTRUCTURED_API_TOKEN=your-unstructured-api-key
     ```

     Example integration JSON:

     ```json
     {
       "provider": "unstructured",
       "options": {
         "apiUrl": "https://api.unstructuredapp.io",
         "apiKey": "your-unstructured-api-key"
       }
     }
     ```

3. **Register the plugin with the Xpert runtime**

   ```sh .env
   PLUGINS=@xpert-ai/plugin-unstructured
   ```

   `register()` wires up the `UnstructuredPlugin` NestJS module globally and logs lifecycle events during `onStart`/`onStop`.

4. **Trigger a document transformation**  
   - When a knowledge ingestion job selects the “Unstructured” transformer, the plugin reads the source file via `XpFileSystem`, sends it to Unstructured, converts the response to markdown chunks, and writes referenced images/tables under the same folder.  
   - To smoke-test credentials you can call the built-in controller:

     ```bash
     curl -X POST http://localhost:3000/unstructured/test \
       -H 'Content-Type: application/json' \
       -d '{"options":{"apiUrl":"https://api.unstructuredapp.io","apiKey":"YOUR_KEY"}}'
     ```

     A `401` indicates malformed credentials (returned as `BadRequestException`), while `200` confirms partition access.

## Integration Options

| Field  | Type   | Description                              | Required | Default                         |
| ------ | ------ | ---------------------------------------- | -------- | ------------------------------- |
| `apiUrl` | string | Base URL of your Unstructured deployment | No       | `https://api.unstructuredapp.io` |
| `apiKey` | string | API key used for `apiKeyAuth` headers     | Yes      | —                               |

> Environment variables `UNSTRUCTURED_API_BASE_URL` and `UNSTRUCTURED_API_TOKEN` are used when no integration config is injected; explicit integration values take precedence.

## Transformer Parameters

`UnstructuredTransformerStrategy` forwards the following options to `partitionParameters`:

| Option                     | Type                | Default          | Notes |
| -------------------------- | ------------------- | ---------------- | ----- |
| `chunkingStrategy`         | `'basic' \| 'by_title' \| 'by_page' \| 'by_similarity'` | `undefined` | Matches Unstructured chunking presets. |
| `maxCharacters`            | number              | `1000`           | Hard cap per chunk when chunking is enabled. |
| `overlap`                  | number              | `0`              | Character tail appended to the next chunk for continuity. |
| `strategy`                 | `'auto' \| 'fast' \| 'hi_res' \| 'ocr_only' \| 'vlm'` | `'auto'` | Parsing pipeline selection. |
| `languages`                | string[]            | `['chi_sim','eng']` | Accepts any Tesseract language code (see Unstructured docs). |
| `splitPdfPage`             | boolean             | `false`          | Client-side page splitting hint; ignored by backend. |
| `splitPdfConcurrencyLevel` | number              | `2`              | Max concurrent requests when `splitPdfPage` is enabled. |

Every request automatically sets `extractImageBlockTypes` to `['Image','Table']` so that generated figures/tables can be written back as assets.

## Permissions

- **Integration:** Requires `integration:unstructured` permission to read API credentials during ingestion.
- **File System:** Needs `read/write/list` on `XpFileSystem` to fetch source binaries and persist derived image/table resources.

Ensure your policy grants both permissions to avoid runtime failures.

## Output Content

- **Markdown chunks:** Each Unstructured element is converted into markdown (headings, paragraphs, bullet lists), then merged into a `Document` instance.  
- **Asset manifest:** When `Image` or `Table` elements include `image_base64`, the plugin stores the decoded PNG under `<source-folder>/images/<element-id>.png`, returns the public URL, and exposes it as `metadata.assets`.  
- **Metadata:** Every chunk contains `{ parser: 'unstructured', source: <filePath> }`, enabling traceability and downstream splitting if desired.

## Development & Debugging

```bash
npm install
npx nx build @xpert-ai/plugin-unstructured
npx nx test @xpert-ai/plugin-unstructured
```

Build artifacts land in `packages/unstructured/dist`. Ensure the published package includes `package.json`, compiled JS, and type declarations.

## License

This plugin follows the repository’s [AGPL-3.0 License](../../../LICENSE).
