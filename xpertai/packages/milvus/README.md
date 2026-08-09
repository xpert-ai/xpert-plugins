# Xpert Plugin: Milvus Vector Store

## Overview

This package exposes the Milvus vector store integration for the [XpertAI](https://github.com/xpert-ai/xpert) platform. It wraps the official `@zilliz/milvus2-sdk-node` client with an opinionated LangChain-compatible adapter that promotes frequently used metadata fields, handles hybrid-search ready schemas, and registers a server-side strategy via `@xpert-ai/plugin-sdk`.

## Key Features

- Registers a global `VectorStoreStrategy` named `milvus`, ready to be consumed by the XpertAI agent runtime.
- Provides an improved LangChain Milvus adapter that stores raw metadata safely while promoting filterable fields like `knowledgeId`, `documentId`, and `chunkId`.
- Supports sanitized collection names and automatic partition provisioning for each knowledge base.
- Enables configurable hybrid search, analyzer parameters, and credential management through environment variables.
- Ships with lifecycle hooks (`onStart`, `onStop`) and structured logging for observability.
- Implements Knowledge Filter V2 with native `filterAttributes` JSON, expression values, array JSON-path indexes, and vector-preserving partial updates.

## Installation

To use the plugin inside an XpertAI deployment:
add this plugin to the `PLUGINS` environment variable when starting the XpertAI system, and it will be loaded automatically:

```ts
PLUGINS=@xpert-ai/plugin-milvus
```

## Configuration

The plugin relies on NestJS `ConfigService` to resolve Milvus connection details. Set the following environment variables (or corresponding config entries) in your host application:

| Variable                      | Description                                                                  | Default                  |
| ----------------------------- | ---------------------------------------------------------------------------- | ------------------------ |
| `MILVUS_URI`                  | HTTP or gRPC endpoint of your Milvus instance, e.g. `http://localhost:19530` | `http://127.0.0.1:19530` |
| `MILVUS_USER`                 | Username for Milvus authentication (if required)                             | `null`                   |
| `MILVUS_PASSWORD`             | Password for Milvus authentication (if required)                             | `null`                   |
| `MILVUS_TOKEN`                | Token-based auth string for Milvus Cloud or managed deployments              | `null`                   |
| `MILVUS_DATABASE`             | Target database name                                                         | `default`                |
| `MILVUS_ENABLE_HYBRID_SEARCH` | Enables scalar + vector hybrid search features                               | `true`                   |
| `MILVUS_ANALYZER_PARAMS`      | JSON string describing analyzer params, e.g. `{"type":"chinese"}`            | `null`                   |

### Knowledge Filter V2

The adapter promotes stable identity fields and stores document attributes, document metadata, and chunk metadata in a native `filterAttributes` JSON field. It creates a JSON flat index plus schema-driven array path indexes. Metadata, file-name, and logical-folder changes use Milvus `partial_update` and do not recalculate embeddings.

At startup and during migration, the adapter probes server capabilities and rejects Knowledge Filter V2 when Milvus is older than 2.6.2. Existing collections must be upgraded with Xpert's `migrate:knowledge-filter-v2` command before filtered retrieval is enabled.

### Deletion Helpers

The wrapped vector store overrides `delete()` to accept either LangChain-style filters or direct chunk ID lists. Internally it builds Milvus filter expressions like `chunk_id in [...]`.

## Deployment

- In `xpertai/`, run `pnpm dlx @changesets/cli add` and include `@xpert-ai/plugin-milvus` in the changeset.
- Merge the PR into `main`; repository workflow `.github/workflows/release-plugin.yml` will create the release PR and publish via npm OIDC trusted publishing after merge.

## Requirements

- Node.js 20+
- Milvus 2.6.2+ for Knowledge Filter V2

## Additional Resources

- Milvus documentation: https://milvus.io/docs
- XpertAI platform: https://xpertai.cloud
