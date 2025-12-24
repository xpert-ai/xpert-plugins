# @xpert-ai/plugin-tongyi

通义千问 (Tongyi Qianwen) AI 模型插件，适用于 XpertAI 平台。

## 功能特性

- ✅ **LLM (大语言模型)** - 支持 Qwen 系列模型，包括 Qwen-Turbo、Qwen-Plus、Qwen-Max 等
- ✅ **Text Embedding** - 文本嵌入模型
- ✅ **TTS (文本转语音)** - 语音合成
- ✅ **Speech2Text (语音转文本)** - 语音识别
- ✅ **Rerank** - 重排序模型

## 支持的模型

### LLM 模型

| 模型名称 | 描述 |
|---------|------|
| qwen-turbo | 通用对话模型，性价比高 |
| qwen-plus | 增强版模型，能力更强 |
| qwen-max | 旗舰模型，效果最佳 |
| qwen-vl-* | 视觉语言模型系列 |
| qwen3-* | Qwen3 系列模型 |
| qwq-* | 推理增强模型 |

### Text Embedding 模型

| 模型名称 | 描述 |
|---------|------|
| text-embedding-v1 | 文本嵌入模型 v1 |
| text-embedding-v2 | 文本嵌入模型 v2 |
| text-embedding-v3 | 文本嵌入模型 v3 |

### Rerank 模型

| 模型名称 | 描述 |
|---------|------|
| gte-rerank | GTE 重排序模型 |
| gte-rerank-v2 | GTE 重排序模型 v2 |

## 安装

```bash
npm install @xpert-ai/plugin-tongyi
```

## 配置

在使用此插件前，您需要从阿里云百炼平台获取 API Key：

1. 访问 [阿里云百炼控制台](https://bailian.console.aliyun.com/?apiKey=1#/api-key)
2. 创建或获取您的 API Key
3. 在 XpertAI 平台配置 Provider 凭证

### 凭证配置

| 参数 | 类型 | 必填 | 描述 |
|------|-----|------|------|
| dashscope_api_key | string | ✅ | 阿里云百炼 API Key |

## 模型参数

### LLM 模型参数

| 参数 | 类型 | 默认值 | 描述 |
|------|-----|-------|------|
| streaming | boolean | true | 是否启用流式输出 |
| temperature | number | 0 | 生成温度 |
| top_p | number | - | Top-P 采样参数 |
| max_tokens | number | - | 最大输出 token 数 |
| frequency_penalty | number | - | 频率惩罚 |
| enable_thinking | boolean | - | 是否开启思考模式 (Qwen3) |
| thinking_budget | number | - | 思考过程最大长度 |
| enable_search | boolean | false | 是否启用互联网搜索 |

## 使用示例

```typescript
import plugin from '@xpert-ai/plugin-tongyi';

// 注册插件
const module = plugin.register(ctx);

// 插件会自动注册以下服务：
// - TongyiProviderStrategy
// - TongyiLargeLanguageModel
// - TongyiTextEmbeddingModel
// - TongyiTTSModel
// - TongyiSpeech2TextModel
// - TongyiRerankModel
```

## 开发

```bash
# 构建
nx build @xpert-ai/plugin-tongyi

# 测试
nx test @xpert-ai/plugin-tongyi

# Lint
nx lint @xpert-ai/plugin-tongyi
```

## 许可证

AGPL-3.0

## 相关链接

- [阿里云百炼官网](https://bailian.console.aliyun.com/)
- [通义千问 API 文档](https://help.aliyun.com/zh/dashscope/)
- [XpertAI 官网](https://xpertai.cn)

