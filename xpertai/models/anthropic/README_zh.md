# Xpert 插件：Anthropic

## 概述

`@xpert-ai/plugin-anthropic` 提供了一个模型适配器，用于将 Anthropic 的 Claude 模型连接到 [XpertAI](https://github.com/xpert-ai/xpert) 平台。该插件使智能体能够在统一的 XpertAI 智能体工作流中调用 Claude 系列模型，支持流式输出、工具调用和视觉能力。

## 核心功能

- 提供 `AnthropicPlugin` NestJS 模块，自动注册模型提供商、生命周期日志记录和配置验证逻辑。
- 通过 `AnthropicLargeLanguageModel` 将 Anthropic 的 Claude 模型包装为 XpertAI 的 `LargeLanguageModel`，支持函数调用（工具使用）、流式输出和智能体令牌统计。
- 支持具备视觉能力的 Claude 模型的视觉功能。
- 与 XpertAI 的智能体工作流系统无缝集成。

## 安装

```bash
npm install @xpert-ai/plugin-anthropic
```

> ** peer 依赖项**：主项目还必须提供以下库：`@xpert-ai/plugin-sdk`、`@nestjs/common`、`@nestjs/config`、`@metad/contracts`、`@langchain/anthropic`、`chalk` 和 `zod`。请参考 `package.json` 了解版本要求。

## 在 XpertAI 中启用

1. 将插件包添加到系统依赖项中，并确保 Node.js 可以解析它。
2. 在启动服务之前，在环境变量中声明插件：
   ```bash
   PLUGINS=@xpert-ai/plugin-anthropic
   ```
3. 在 XpertAI 管理界面或配置文件中添加新的模型提供商，并选择 `anthropic`。

## 凭证和模型配置

`anthropic.yaml` 中定义的表单字段涵盖了常见的 Anthropic 部署场景：

- **API Key**：您的 Anthropic API 密钥（必需）
- **Model Name**：Claude 模型标识符（例如：`claude-3-5-sonnet-20241022`、`claude-3-opus-20240229`）
- **Context Size**：最大上下文窗口大小（默认：200000）
- **Max Tokens**：生成的最大令牌数（默认：4096）
- **Function Calling**：启用/禁用工具调用支持
- **Vision Support**：启用/禁用视觉能力
- **Streaming**：启用/禁用流式输出

## 支持的模型类型

- **大语言模型 (LLM)**：Claude 系列模型，支持：
  - 对话交互
  - 工具调用（函数调用）
  - 流式输出
  - 视觉能力（适用于支持视觉的模型）

## 模型示例

常见的 Claude 模型标识符：
- `claude-3-5-sonnet-20241022` - 最新的 Claude 3.5 Sonnet
- `claude-3-opus-20240229` - Claude 3 Opus
- `claude-3-sonnet-20240229` - Claude 3 Sonnet
- `claude-3-haiku-20240307` - Claude 3 Haiku

该插件支持 Anthropic 提供的所有可用 Claude 模型。您可以使用 Anthropic API 中的任何有效模型标识符。有关最新模型列表，请参阅 [Anthropic 文档](https://docs.anthropic.com/claude/docs/models-overview)。

## 配置示例

在 XpertAI 中配置模型提供商时：

1. 选择提供商类型：`anthropic`
2. 输入您的 Anthropic API 密钥
3. 指定模型名称（例如：`claude-3-5-sonnet-20241022`）
4. 设置上下文大小（默认：200000）
5. 配置最大令牌数（默认：4096）
6. 根据需要启用/禁用功能：
   - 函数调用：`tool_call`
   - 视觉支持：`support`
   - 流式输出：`supported`

## 开发

该插件使用以下技术构建：
- TypeScript
- NestJS
- LangChain Anthropic SDK
- XpertAI Plugin SDK

## 许可证

请参阅主仓库的 LICENSE 文件。

