# Xpert Plugin: MiniMax AI

`@xpert-ai/plugin-minimax` brings MiniMax AI capabilities to [Xpert AI](https://github.com/xpert-ai/xpert) platform using **OpenAI Compatible API**. This plugin provides access to MiniMax's suite of AI models including large language models, text embeddings, and text-to-speech services with full OpenAI compatibility.

## Key Features

- **🤖 Large Language Models**: Access MiniMax's latest models (MiniMax-M2, MiniMax-M2-Stable) with OpenAI compatible endpoints
- **🔤 Text Embeddings**: Generate high-quality text embeddings using OpenAI compatible API format
- **🗣️ Text-to-Speech**: Convert text to natural-sounding speech using MiniMax TTS models
- **🔄 OpenAI Compatible**: Full compatibility with OpenAI SDK and LangChain ecosystem
- **📦 Standard Integration**: Fully compatible with Xpert AI's plugin architecture

## What's New in v0.1.0

✅ **Migrated to OpenAI Compatible API**
- Updated endpoints to `https://api.minimaxi.com/v1` 
- Simplified credential structure (only `api_key` required)
- Model name mapping for backward compatibility
- Improved error handling and validation

## Installation

```bash
npm install @xpert-ai/plugin-minimax
# or
pnpm add @xpert-ai/plugin-minimax
```

> **Peer dependencies**: Ensure your host project already provides `@xpert-ai/plugin-sdk`, `@nestjs/common`, `@nestjs/config`, `@metad/contracts`, `@langchain/openai`, `chalk`, and `zod`. See `package.json` for exact version ranges.

## Quick Start

1. **Register** Plugin  
   Include the package in the `PLUGINS` environment variable when starting Xpert:

   ```sh
   PLUGINS=@xpert-ai/plugin-minimax
   ```

2. **Configure Credentials**  
   Add a new model provider with type `minimax` in your Xpert configuration:

   ```json
   {
     "type": "minimax",
     "credentials": {
       "api_key": "your-minimax-api-key",
       "base_url": "https://api.minimaxi.com/v1"
     }
   }
   ```

3. **Create Models**  
   Configure individual models using the provider:

   ```json
   {
     "name": "MiniMax Chat",
     "model": "MiniMax-M2",
     "modelProvider": {
       "type": "minimax",
       "credentials": {
         "api_key": "your-api-key"
       }
     },
     "temperature": 0.7,
     "maxTokens": 2048
   }
   ```

## Supported Models

### Large Language Models (LLM)
| Model Name | Description | OpenAI Compatible |
|------------|-------------|-------------------|
| `MiniMax-M2` | Latest high-performance chat model | ✅ |
| `MiniMax-M2-Stable` | Stable version of M2 model | ✅ |
| `abab6.5-chat` | Legacy model (auto-mapped to M2) | ✅ |
| `abab6.5s-chat` | Legacy streaming model (auto-mapped) | ✅ |

### Text Embedding Models
| Model Name | OpenAI Compatible |
|------------|-------------------|
| `text-embedding-ada-002` | ✅ |
| `embo-01` | Auto-mapped to `text-embedding-ada-002` |

### Text-to-Speech Models
| Model Name | OpenAI Compatible |
|------------|-------------------|
| `tts-1` | ✅ |
| `tts-1-hd` | ✅ |
| `speech-01` | Auto-mapped to `tts-1` |
| `speech-01-hd` | Auto-mapped to `tts-1-hd` |

## Configuration Options

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| `api_key` | string | Yes | - | MiniMax API key |
| `base_url` | string | No | `https://api.minimaxi.com/v1` | OpenAI compatible API endpoint |

## Migration from Native API

If you were using the previous version with native MiniMax API:

**Before (Native API):**
```json
{
  "api_key": "your-key",
  "base_url": "https://api.minimax.chat/v1", 
  "group_id": "your-group-id"
}
```

**After (OpenAI Compatible API):**
```json
{
  "api_key": "your-key",
  "base_url": "https://api.minimaxi.com/v1"
}
```

### Key Changes:
- ✅ Removed `group_id` requirement
- ✅ Updated endpoint to `api.minimaxi.com`
- ✅ All models now use OpenAI compatible names
- ✅ Automatic backward compatibility for legacy model names

## Development

```bash
# Install dependencies
npm install

# Build plugin
npm run build

# Run linting
npm run lint
```

## API Endpoints

The plugin uses MiniMax's OpenAI compatible API endpoints:

- **Base URL**: `https://api.minimaxi.com/v1`
- **Chat Completions**: `/chat/completions`
- **Embeddings**: `/embeddings` 
- **Audio Speech**: `/audio/speech`

## License

This package inherits the repository's [AGPL-3.0 License](../../../LICENSE).

## Development

```bash
# Install dependencies
npm install

# Build plugin
npm run build

# Run linting
npm run lint
```

## License

This package inherits the repository's [AGPL-3.0 License](../../../LICENSE).
