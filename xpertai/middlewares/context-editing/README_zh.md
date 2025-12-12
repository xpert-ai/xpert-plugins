# Xpert 插件：上下文编辑中间件

`@xpert-ai/plugin-context-editing` 为 [Xpert AI](https://github.com/xpert-ai/xpert) 智能体添加自动上下文修剪功能。该中间件包装 LangChain 聊天请求并模仿 Anthropic 风格的上下文编辑:一旦对话超过阈值,旧的工具输出将被清除或折叠,以便模型保持在其输入窗口内。

## 主要特性

- 一旦满足令牌/消息/分数触发条件,清除旧的 `ToolMessage` 结果(默认:100,000 个令牌)。
- 通过计数、令牌预算或模型上下文分数保留最新的工具输出(默认:最近 3 个结果)。
- 可选的工具调用输入清理以及每个工具名称的排除列表;为清除的结果插入占位符。
- 自动删除孤立的工具消息,并使用 `response_metadata.context_editing` 标注清除的条目。
- 支持快速近似令牌计数或在可用时基于模型的精确计数(例如 OpenAI 的 `getNumTokensFromMessages`)。
- 作为全局 NestJS 模块提供,直接插入 Xpert 代理中间件管道。

## 安装

```bash
pnpm add @xpert-ai/plugin-context-editing
# 或
npm install @xpert-ai/plugin-context-editing
```

> **注意**: 确保主机服务已提供 `@xpert-ai/plugin-sdk`、`@nestjs/common@^11`、`@langchain/core@^0.3`、`zod` 和 `chalk`。这些被视为对等/运行时依赖项。

## 快速开始

1. **注册插件**  
   在插件列表中使用该包启动 Xpert:
   ```sh
   PLUGINS=@xpert-ai/plugin-context-editing
   ```
   该插件注册全局 `ContextEditingPlugin` 模块。
2. **在代理上启用中间件**  
   在 Xpert 控制台(或代理定义)中,添加策略为 `ContextEditingMiddleware` 的中间件条目,并根据需要提供选项。
3. **配置触发器和保留**  
   示例中间件配置:
   ```json
   {
     "type": "ContextEditingMiddleware",
     "options": {
       "trigger": { "tokens": 100000 },
       "keep": { "messages": 3 },
       "excludeTools": ["healthcheck"],
       "placeholder": "[已清除]",
       "clearToolInputs": false,
       "tokenCountMethod": "approx"
     }
   }
   ```
   根据需要将 `trigger` 或 `keep` 替换为使用 `fraction`(模型上下文的分数)或 `tokens`。

## 配置

| 字段 | 类型 | 描述 | 默认值 |
| ----- | ---- | ----------- | ------- |
| `trigger` | 对象 | 何时开始清除。仅提供以下之一:<br/>- `tokens`: 对话中的令牌数。<br/>- `messages`: 消息总数。<br/>- `fraction`: 模型最大输入令牌的分数。 | `{ "tokens": 100000 }` |
| `keep` | 对象 | 触发后保留多少内容。仅提供以下之一:<br/>- `messages`: 保留最近的 N 个工具结果。<br/>- `tokens`: 保留工具结果直到达到此令牌预算(从最新的开始计数)。<br/>- `fraction`: 保留工具结果直到模型上下文的此分数。 | `{ "messages": 3 }` |
| `excludeTools` | 字符串数组 | 永远不应被清除的工具名称。 | `[]` |
| `placeholder` | 字符串 | 插入到清除的 `ToolMessage` 内容中的文本。 | `"[cleared]"` |
| `clearToolInputs` | 布尔值 | 同时清除 AI 消息上的原始工具调用参数。 | `false` |
| `tokenCountMethod` | `"approx"` \| `"model"` | 令牌计数模式:`approx` 是基于字符的快速计数;`model` 在可用时调用模型的 `getNumTokensFromMessages`。 | `"approx"` |

> 提示  
> - 对于公开 `profile.maxInputTokens` 的模型使用 `trigger.fraction`,以保持修剪与模型限制对齐。  
> - 将 `excludeTools` 与 `keep.tokens` 结合使用,以保护关键工具输出(例如身份验证检查),同时修剪大型工件。

## 编辑行为

- 在评估阈值之前,孤立的工具消息(没有匹配的 AI 工具调用)将被删除。
- 触发时,早期的工具结果将被占位符替换,并标记为 `context_editing.strategy = "clear_tool_uses"`。
- 如果 `clearToolInputs` 为 true,相应 AI 消息上的工具调用参数将被清除,并在 `context_editing.cleared_tool_inputs` 中注明。
- 系统消息包含在令牌计数中;近似模式假设每个令牌约 4 个字符。

## 开发与测试

```bash
npm install
npx nx build @xpert-ai/plugin-context-editing
npx nx test @xpert-ai/plugin-context-editing
```

TypeScript 构建产物输出到 `packages/context-editing/dist`。在发布之前,针对暂存代理运行验证中间件行为。

## 许可证

本项目遵循位于仓库根目录的 [AGPL-3.0 许可证](../../../LICENSE)。
