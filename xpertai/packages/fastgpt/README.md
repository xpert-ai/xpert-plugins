# Xpert Plugin: FastGPT

## Overview

`@xpert-ai/plugin-fastgpt` connects [FastGPT](https://doc.fastgpt.io/) to the Xpert plugin ecosystem. It registers a NestJS module that exposes a connection test endpoint and wires up both integration and knowledge strategies so FastGPT datasets can be searched from Xpert workflows.

## Features

- Provides the `IntegrationFastGPTPlugin` NestJS module, mounted under `/fastgpt`, with lifecycle logging on bootstrap and shutdown.
- Publishes a FastGPT integration strategy that advertises metadata (labels, help URL, config schema) to the Xpert integration catalogue and validates credentials via the service layer.
- Implements a knowledge strategy that calls FastGPT’s `/api/core/dataset/searchTest` endpoint and returns LangChain `Document` chunks with embedding scores.
- Exposes a `POST /fastgpt/test` endpoint that normalises the FastGPT base URL (trimming trailing `/` or `/api`) and issues a connectivity check against `/api/v1/chat/completions`.

## Installation

```bash
npm install @xpert-ai/plugin-fastgpt
```

> **Peer dependencies:** your host must provide `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@metad/contracts`, `@langchain/core`, `axios`, `chalk`, `lodash`, and `zod` (see `package.json` for exact versions).

In an Nx workspace place the package inside `packages/` (or update your workspace layout accordingly).

## Usage

Set the `PLUGINS` environment variable when starting the Xpert server so the package is loaded:

```bash
PLUGINS=@xpert-ai/plugin-fastgpt
```

After registration the plugin contributes:

- an integration provider named `fastgpt` with configurable `url` and `apiKey` fields (accessible through the Xpert UI or API); and
- a knowledge strategy keyed as `fastgpt` that can answer embedding search requests against a FastGPT dataset.

When configuring an integration:

| Field | Description |
| --- | --- |
| `url` | Base URL of your FastGPT instance. Trailing `/` or `/api` segments are automatically stripped. |
| `apiKey` | FastGPT API key with permission to access the dataset search and chat APIs. |

## Connection Test Endpoint

The plugin adds a controller under `/fastgpt`. Use it to verify credentials before saving an integration:

```bash
curl -X POST https://<your-host>/fastgpt/test \
  -H 'Content-Type: application/json' \
  -d '{
    "options": {
      "url": "https://fastgpt.your-company.com",
      "apiKey": "fastgpt_api_key"
    }
  }'
```

The service sanitises the URL and sends a `GET` request to `/api/v1/chat/completions`. If mandatory fields are missing or the call fails, a `400 Bad Request` is raised with the error details.

## Knowledge Retrieval Strategy

When the knowledge strategy runs it expects the payload to include:

| Field | Description |
| --- | --- |
| `query` | The user prompt to search with. |
| `k` | Maximum number of search results to return. |
| `options.knowledgebaseId` | Target FastGPT dataset identifier. |

The strategy performs a POST to `https://<base-url>/api/core/dataset/searchTest` using embedding search. Results are mapped into `[Document, score]` tuples where `Document.pageContent` contains the FastGPT question (`q`) and metadata preserves the remaining fields (`datasetId`, `sourceName`, etc.). Scores are pulled from the returned `embedding` distance.

## Development

From the monorepo root you can leverage the Nx helpers:

```bash
npx nx build @xpert-ai/plugin-fastgpt
npx nx test @xpert-ai/plugin-fastgpt
```

`nx build` emits the compiled artefacts into `dist/`, while `nx test` executes the Jest suite.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) located at the repository root.
