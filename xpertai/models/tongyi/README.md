# @xpert-ai/plugin-tongyi

Tongyi Qianwen AI model plugin for the XpertAI platform.

## Features

- ✅ **LLM (Large Language Model)** - Supports Qwen series models, including Qwen-Turbo, Qwen-Plus, Qwen-Max, etc.
- ✅ **Text Embedding** - Text embedding models
- ✅ **TTS (Text-to-Speech)** - Speech synthesis
- ✅ **Speech2Text** - Speech recognition
- ✅ **Rerank** - Reranking models

## Supported Models

### LLM Models

| Model Name | Description |
|-----------|-------------|
| qwen-turbo | General conversation model, cost-effective |
| qwen-plus | Enhanced model with stronger capabilities |
| qwen-max | Flagship model with best performance |
| qwen-vl-* | Vision-Language model series |
| qwen3-* | Qwen3 series models |
| qwq-* | Reasoning-enhanced models |

### Text Embedding Models

| Model Name | Description |
|-----------|-------------|
| text-embedding-v1 | Text embedding model v1 |
| text-embedding-v2 | Text embedding model v2 |
| text-embedding-v3 | Text embedding model v3 |

### Rerank Models

| Model Name | Description |
|-----------|-------------|
| gte-rerank | GTE reranking model |
| gte-rerank-v2 | GTE reranking model v2 |

## Installation

```bash
npm install @xpert-ai/plugin-tongyi
```

## Configuration

Before using this plugin, you need to obtain an API Key from Alibaba Cloud Bailian platform:

1. Visit [Alibaba Cloud Bailian Console](https://bailian.console.aliyun.com/?apiKey=1#/api-key)
2. Create or retrieve your API Key
3. Configure the Provider credentials in the XpertAI platform

### Credentials Configuration

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| dashscope_api_key | string | ✅ | Alibaba Cloud Bailian API Key |

## Model Parameters

### LLM Model Parameters

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| streaming | boolean | true | Enable streaming output |
| temperature | number | 0 | Generation temperature |
| top_p | number | - | Top-P sampling parameter |
| max_tokens | number | - | Maximum output tokens |
| frequency_penalty | number | - | Frequency penalty |
| enable_thinking | boolean | - | Enable thinking mode (Qwen3) |
| thinking_budget | number | - | Maximum length of thinking process |
| enable_search | boolean | false | Enable internet search |

## Usage Example

```typescript
import plugin from '@xpert-ai/plugin-tongyi';

// Register the plugin
const module = plugin.register(ctx);

// The plugin automatically registers the following services:
// - TongyiProviderStrategy
// - TongyiLargeLanguageModel
// - TongyiTextEmbeddingModel
// - TongyiTTSModel
// - TongyiSpeech2TextModel
// - TongyiRerankModel
```

## Development

```bash
# Build
nx build @xpert-ai/plugin-tongyi

# Test
nx test @xpert-ai/plugin-tongyi

# Lint
nx lint @xpert-ai/plugin-tongyi
```

## License

AGPL-3.0

## Related Links

- [Alibaba Cloud Bailian Official Website](https://bailian.console.aliyun.com/)
- [Tongyi Qianwen API Documentation](https://help.aliyun.com/zh/dashscope/)
- [XpertAI Official Website](https://xpertai.cn)

