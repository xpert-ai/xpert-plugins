# Xpert Plugin: RAGFlow

## Overview

`@xpert-ai/plugin-ragflow` integrates [RAGFlow](https://ragflow.io/) into the Xpert plugin system, registering a global NestJS module with the host and exposing validation and retrieval capabilities to help you reuse RAGFlow datasets and knowledge bases in your workflows.

## Features

- Provides `IntegrationRAGFlowPlugin`, which logs messages on plugin startup and teardown, and mounts the internal `IntegrationRAGFlowModule`.
- Offers a RAGFlow integration strategy, publishing name, description, icon, and configuration schema (supports `url` and `apiKey` fields) to the Xpert integration directory.
- Built-in RAGFlow knowledge strategy, calling the `/api/v1/retrieval` endpoint to retrieve specified datasets and returning fragments as LangChain `Document` + similarity.
- Exposes a `POST /ragflow/test` validation endpoint for quickly verifying connection info before saving the integration.

## Installation

```bash
npm install @xpert-ai/plugin-ragflow
# or
pnpm add @xpert-ai/plugin-ragflow
```

> **Peer dependencies:** The host project must pre-install dependencies such as `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@metad/contracts`, `@langchain/core`, `axios`, `chalk`, `lodash-es`, and `zod`. Refer to the repository `package.json` for specific versions.

## Usage

1. Declare the plugin via environment variables when starting the XpertAI service:

    ```bash
    PLUGINS=@xpert-ai/plugin-ragflow
    ```

2. When saving the integration, fill in the following configuration fields:

    | Field     | Description                                                                                 |
    | --------- | ------------------------------------------------------------------------------------------- |
    | `url`     | RAGFlow service base URL, e.g., `https://ragflow.your-company.com`. The plugin will automatically remove trailing `/`, `/v1`, or `/api`. |
    | `apiKey`  | API Key for the RAGFlow application, used for request authentication.                       |

3. When calling the knowledge strategy, the payload should include:

    | Field                     | Description                |
    | ------------------------- | -------------------------- |
    | `query`                   | User query text.           |
    | `k`                       | Number of fragments to return. |
    | `options.knowledgebaseId` | RAGFlow dataset ID.        |

The plugin returns an array in the form `[Document, similarity]`, which can be directly consumed by downstream LangChain components.

## Connection Test Endpoint

Before configuring the integration, you can call the test endpoint to verify if the address and credentials are valid:

```bash
curl -X POST https://<your-host>/ragflow/test \
  -H 'Content-Type: application/json' \
  -d '{
     "options": {
        "url": "https://ragflow.your-company.com",
        "apiKey": "ragflow_api_key"
     }
  }'
```

The service will request the RAGFlow `/v1` root path and return the raw response. If parameters are missing or the connection fails, a `400 Bad Request` is thrown.

## Development & Debugging

Run Nx commands in the monorepo root directory to build and test:

```bash
npx nx build @xpert-ai/plugin-ragflow
npx nx test @xpert-ai/plugin-ragflow
```

`nx build` compiles TypeScript source code to `dist/`, and `nx test` runs unit tests with Jest.

## License

This project follows the [AGPL-3.0 License](../../../LICENSE) in the repository root.
