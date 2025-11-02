# Xpert Plugin: Milvus Vector Store

## Overview

This package exposes the Milvus vector store integration for the [XpertAI](https://github.com/xpert-ai/xpert) platform. It wraps the official `@zilliz/milvus2-sdk-node` client with an opinionated LangChain-compatible adapter that promotes frequently used metadata fields, handles hybrid-search ready schemas, and registers a server-side strategy via `@xpert-ai/plugin-sdk`.

## Key Features

- Registers a global `VectorStoreStrategy` named `milvus`, ready to be consumed by the XpertAI agent runtime.
- Provides an improved LangChain Milvus adapter that stores raw metadata safely while promoting filterable fields like `knowledgeId`, `documentId`, and `chunkId`.
- Supports sanitized collection names and automatic partition provisioning for each knowledge base.
- Enables configurable hybrid search, analyzer parameters, and credential management through environment variables.
- Ships with lifecycle hooks (`onStart`, `onStop`) and structured logging for observability.

## Installation

To use the plugin inside an XpertAI deployment:
add this plugin to the `PLUGINS` environment variable when starting the XpertAI system, and it will be loaded automatically:

```ts
PLUGINS=@xpert-ai/plugin-dify
```

## Configuration

The plugin relies on NestJS `ConfigService` to resolve Milvus connection details. Set the following environment variables (or corresponding config entries) in your host application:

| Variable | Description | Default |
| -------- | ----------- | ------- |
| `MILVUS_URI` | HTTP or gRPC endpoint of your Milvus instance, e.g. `http://localhost:19530` | `http://127.0.0.1:19530` |
| `MILVUS_USER` | Username for Milvus authentication (if required) | `null` |
| `MILVUS_PASSWORD` | Password for Milvus authentication (if required) | `null` |
| `MILVUS_TOKEN` | Token-based auth string for Milvus Cloud or managed deployments | `null` |
| `MILVUS_DATABASE` | Target database name | `default` |
| `MILVUS_ENABLE_HYBRID_SEARCH` | Enables scalar + vector hybrid search features | `true` |
| `MILVUS_ANALYZER_PARAMS` | JSON string describing analyzer params, e.g. `{"type":"chinese"}` | `null` |

### Metadata Filtering

The adapter promotes several metadata fields (`enabled`, `knowledgeId`, `documentId`, `chunkId`, `parentChunkId`, `model`) for efficient filtering. Additional metadata is serialized into a JSON column, so arbitrary attributes remain queryable via hybrid search.

### Deletion Helpers

The wrapped vector store overrides `delete()` to accept either LangChain-style filters or direct chunk ID lists. Internally it builds Milvus filter expressions like `chunk_id in [...]`.

## Deployment

- `npx nx release -p @xpert-ai/plugin-milvus` runs package tests.
- `npx nx run @xpert-ai/plugin-milvus:nx-release-publish --access public --otp=<one-time-password-if-needed>` publishes to npm.

## Requirements

- Node.js 20+
- Milvus 2.4+ (2.5+ recommended to leverage hybrid search)

## Additional Resources

- Milvus documentation: https://milvus.io/docs
- XpertAI platform: https://xpertai.cloud
