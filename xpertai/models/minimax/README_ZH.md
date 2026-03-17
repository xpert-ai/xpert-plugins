# MiniMax (OpenAI Compatible)

`@xpert-ai/plugin-minimax` 提供 MiniMax 的 LLM、Embedding、TTS，使用官方 OpenAI 兼容 API（`https://api.minimaxi.com/v1`）。

## 安装

```bash
npm install @xpert-ai/plugin-minimax
```

> 需要宿主提供 peer deps：`@xpert-ai/plugin-sdk`、`@nestjs/common`、`@nestjs/config`、`@metad/contracts`、`@langchain/core`、`@langchain/openai`、`zod`、`tslib` 等。

## 配置

在模型提供方中添加：

```json
{
  "type": "minimax",
  "credentials": {
    "api_key": "your-api-key",
    "group_id": "your-group-id",
    "base_url": "https://api.minimaxi.com"
  }
}
```

> **注意**：`group_id` 是必需的，可以从 [MiniMax 平台](https://platform.minimaxi.com/user-center/basic-information/interface-key) 获取。

## 支持模型

- **LLM**: `MiniMax-M2.5`, `MiniMax-M2.5-highspeed`, `MiniMax-M2.1`, `MiniMax-M2.1-highspeed`, `MiniMax-M2`, `M2-her`, `minimax-m1`
- **Embedding**: `embo-01`
- **TTS**: `speech-2.8-hd`, `speech-2.8-turbo`, `speech-2.6-hd`, `speech-2.6-turbo`, `speech-02-hd`, `speech-02-turbo`

## 运行

```bash
cd xpertai
nx build models/minimax
nx lint models/minimax
```

## 核心功能

- **LLM 支持**: 通过 `ChatOAICompatReasoningModel` 实现流式对话、函数调用等功能
- **Embedding 支持**: 自定义实现 MiniMax Embedding API，支持文档和查询两种类型
- **TTS 支持**: 支持流式语音合成，多种音色和格式选项

## License

MIT License

