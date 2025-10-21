# Xpert Plugin: Dify

## Overview

`@xpert-ai/plugin-dify` brings [Dify](https://dify.ai/) into the Xpert plugin ecosystem. It registers a NestJS module that exposes connection helpers and ships both integration and knowledge strategies so that Dify datasets can be queried from Xpert workflows.

## Features

- Provides the `IntegrationDifyPlugin` NestJS module, mounted under `/dify`, with lifecycle logging on bootstrap and shutdown.
- Implements a Dify integration strategy that publishes metadata (labels, docs, config schema) for the Xpert integration catalogue.
- Implements a knowledge strategy that calls the Dify `/v1/datasets/{knowledgebaseId}/retrieve` endpoint and returns LangChain `Document` chunks with similarity scores.
- Exposes a `POST /dify/test` controller action that validates connection details against the target Dify server.

## Installation

```bash
npm install @xpert-ai/plugin-dify
```

> **Peer dependencies:** the host project must already provide `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@metad/contracts`, `@langchain/core`, `chalk`, `lodash-es`, and `zod` (see `package.json` for exact versions).

When using an Nx workspace, ensure the package lives inside the workspace `packages` folder or add it to your preferred structure.

## Usage

Register the plugin with the Xpert plugin host. The example below demonstrates how to add the plugin to a typical server bootstrap that consumes `XpertPlugin` objects.

```ts
PLUGINS=@xpert-ai/plugin-dify
```

Once registered, the plugin contributes:

- a `Dify` integration provider with configurable `url` and `apiKey` fields; and
- a knowledge strategy keyed as `dify` for retrieving dataset chunks.

## Connection Test Endpoint

The plugin adds a controller under `/dify`. To confirm credentials before saving an integration, call the test endpoint:

```bash
curl -X POST https://<your-host>/dify/test \
  -H 'Content-Type: application/json' \
  -d '{
    "options": {
      "url": "https://dify.your-company.com",
      "apiKey": "dify_api_key"
    }
  }'
```

The service normalises the URL (removing trailing `/` or `/v1`) and performs a `GET` request against the Dify `/v1` root. A `400 Bad Request` is thrown if mandatory properties are missing or the call fails.

## Knowledge Retrieval Strategy

When the knowledge strategy runs, it expects the payload to include:

| Field | Description |
| --- | --- |
| `query` | User query text. |
| `k` | Number of documents to retrieve. |
| `options.knowledgebaseId` | The target Dify dataset identifier. |

The strategy posts to Dify using semantic search and returns an array of `[Document, score]` tuples that downstream LangChain components can consume.

## Development

From the monorepo root (`xpertai/`), you can use Nx helpers:

```bash
npx nx build @xpert-ai/plugin-dify
npx nx test @xpert-ai/plugin-dify
```

`nx build` compiles the library to `dist/`, and `nx test` executes the Jest suite (configured with SWC for TypeScript).

## License

MIT – see the repository root `LICENSE` file.
