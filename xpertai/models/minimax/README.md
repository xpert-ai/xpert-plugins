# MiniMax (OpenAI Compatible)

`@xpert-ai/plugin-minimax` 提供 MiniMax 的 LLM、Embedding、TTS，使用官方 OpenAI 兼容 API（`https://api.minimaxi.com/v1`）。

## 安装
```
npm install @xpert-ai/plugin-minimax
```

> 需要宿主提供 peer deps：`@xpert-ai/plugin-sdk`、`@nestjs/common`、`@nestjs/config`、`@metad/contracts`、`@langchain/openai`、`zod` 等。

## 配置
在模型提供方中添加：
```json
{
  "type": "minimax",
  "credentials": {
    "api_key": "your-api-key",
    "base_url": "https://api.minimaxi.com/v1"
  }
}
```

## 支持模型
- LLM: `MiniMax-M2`, `MiniMax-M2-Stable`, `abab7-chat-preview`, `abab6.5-chat`, `abab6.5s-chat`, `abab6.5t-chat`, `abab6-chat`, `abab5.5-chat`, `abab5.5s-chat`, `abab5-chat`, `minimax-text-01`, `minimax-m1`
- Embedding: `embo-01`, `text-embedding-ada-002`
- TTS: `speech-01`, `speech-01-hd`, `speech-01-turbo`, `speech-02`, `speech-02-hd`, `speech-02-turbo`, `tts-1`, `tts-1-hd`

## 运行
```
nx build minimax
nx lint minimax
```
