# Xpert 插件：长期记忆中间件

`@xpert-ai/plugin-long-term-memory` 从向量存储中检索相关的长期记忆并将其注入到 [Xpert AI](https://github.com/xpert-ai/xpert) 智能体的系统提示词中。该中间件搜索用户画像记忆(用户偏好、事实)和问答记忆(历史问题和答案),以提供具有上下文感知的响应。

## 主要特性

- 使用 LangGraph 的 BaseStore 通过语义搜索检索相关长期记忆。
- 支持两种记忆类型:**用户画像**(用户属性、偏好)和**问答**(问答对)。
- 可配置每种记忆类型的相关性阈值和结果限制。
- 可选的相似度分数显示,用于调试和透明度。
- 内置安全性:添加指令提示以防止通过存储的记忆进行提示注入。
- 字符截断以控制提示大小。
- 类 XML 格式的清晰记忆注入。
- 搜索结果的去重和基于分数的排序。
- 可选的调试日志,用于监控记忆检索统计信息。

## 安装

```bash
pnpm add @xpert-ai/plugin-long-term-memory
# 或
npm install @xpert-ai/plugin-long-term-memory
```

> **注意**: 确保主机服务已提供 `@xpert-ai/plugin-sdk`、`@nestjs/common@^11`、`@nestjs/cqrs@^11`、`@langchain/core@^0.3`、`@langchain/langgraph@^0.4`、`@metad/contracts`、`zod` 和 `chalk`。这些被视为对等/运行时依赖项。

## 快速开始

1. **注册插件**  
   在插件列表中使用该包启动 Xpert:
   ```sh
   PLUGINS=@xpert-ai/plugin-long-term-memory
   ```
   该插件注册 `LongTermMemoryPlugin` 模块(非全局)。
2. **在代理上启用中间件**  
   在 Xpert 控制台(或代理定义)中,添加策略为 `LongTermMemoryMiddleware` 的中间件条目,并根据需要提供选项。
3. **配置记忆类型**  
   示例中间件配置:
   ```json
   {
     "type": "LongTermMemoryMiddleware",
     "options": {
       "profile": {
         "enabled": true,
         "limit": 5,
         "scoreThreshold": 0.7
       },
       "qa": {
         "enabled": true,
         "limit": 3,
         "scoreThreshold": 0.6
       },
       "wrapperTag": "long_term_memories",
       "includeScore": false,
       "maxChars": 5000,
       "instructionHint": true,
       "enableLogging": false
     }
   }
   ```

## 配置

| 字段 | 类型 | 描述 | 默认值 |
| ----- | ---- | ----------- | ------- |
| `profile` | 对象 | 用户画像记忆检索配置。 | `{ "enabled": true, "limit": 5, "scoreThreshold": 0 }` |
| `profile.enabled` | 布尔值 | 是否检索用户画像记忆。 | `true` |
| `profile.limit` | 数字 | 要检索的用户画像记忆的最大数量(1-50)。 | `5` |
| `profile.scoreThreshold` | 数字 | 用户画像记忆的最小相似度分数(0-1)。 | `0` |
| `qa` | 对象 | 问答记忆检索配置。 | `{ "enabled": false, "limit": 3, "scoreThreshold": 0 }` |
| `qa.enabled` | 布尔值 | 是否检索问答记忆。 | `false` |
| `qa.limit` | 数字 | 要检索的问答记忆的最大数量(1-50)。 | `3` |
| `qa.scoreThreshold` | 数字 | 问答记忆的最小相似度分数(0-1)。 | `0` |
| `wrapperTag` | 字符串 | 用于包裹注入记忆的类 XML 标签名(1-64 字符)。 | `"long_term_memories"` |
| `includeScore` | 布尔值 | 在注入的记忆块中包含相似度分数。 | `false` |
| `maxChars` | 数字 | 将总注入记忆文本截断到此字符数。0 表示不截断。 | `0` |
| `instructionHint` | 布尔值 | 添加提示说明记忆是数据而非指令。有助于防止提示注入攻击。 | `true` |
| `customHint` | 字符串 | 自定义提示文本,而不是使用默认文本(最多 500 字符)。留空则使用默认。 | `""` |
| `enableLogging` | 布尔值 | 记录记忆检索统计信息,用于调试和监控。 | `false` |

> 提示  
> - 使用 `scoreThreshold` 过滤低相关性记忆并减少噪音。  
> - 在开发期间启用 `includeScore` 以了解检索质量。  
> - 设置 `maxChars` 以在处理大型记忆集合时控制提示大小。  
> - 在生产环境中保持 `instructionHint` 启用以降低提示注入风险。

## 记忆格式

### 用户画像记忆
用户画像记忆表示用户属性、偏好和事实:
```xml
<memory>
  <memoryId>user-123-pref-1</memoryId>
  <profile>用户偏好深色模式和技术语言。</profile>
</memory>
```

### 问答记忆
问答记忆捕获历史问答对:
```xml
<memory>
  <memoryId>qa-456</memoryId>
  <question>公司的退货政策是什么?</question>
  <answer>商品可在 30 天内凭收据退货。</answer>
</memory>
```

## 中间件行为

- **记忆检索**: 中间件使用用户的输入查询搜索 LangGraph 存储。记忆从基于 `xpertId`(或使用 `projectId` 作为后备)的命名空间中检索。
- **去重**: 结果按记忆键去重以避免冗余信息。
- **排序**: 去重后,记忆按相似度分数排序(最高分在前)。
- **注入**: 检索到的记忆被格式化并在模型调用前注入到系统提示词中。
- **安全性**: 默认添加指令提示以明确记忆是只读数据,而不是可执行指令。

## 存储要求

此中间件需要在运行时提供 LangGraph 的 `BaseStore`。存储可以通过以下方式访问:
- `runtime.store`(直接属性)
- `runtime.configurable.store`(通过 configurable)

记忆命名空间遵循以下结构:
- 用户画像记忆: `[xpertId, "profile"]`
- 问答记忆: `[xpertId, "qa"]`

## 使用示例

### 基本配置
仅启用用户画像记忆:
```json
{
  "type": "LongTermMemoryMiddleware",
  "options": {
    "profile": { "enabled": true, "limit": 5 }
  }
}
```

### 高级配置
使用两种记忆类型并进行质量过滤:
```json
{
  "type": "LongTermMemoryMiddleware",
  "options": {
    "profile": {
      "enabled": true,
      "limit": 10,
      "scoreThreshold": 0.75
    },
    "qa": {
      "enabled": true,
      "limit": 5,
      "scoreThreshold": 0.7
    },
    "includeScore": true,
    "maxChars": 8000,
    "enableLogging": true
  }
}
```

## 开发与测试

```bash
npm install
npx nx build @xpert-ai/plugin-long-term-memory
npx nx test @xpert-ai/plugin-long-term-memory
```

TypeScript 构建产物输出到 `middlewares/long-term-memory/dist`。在发布之前,针对暂存代理运行验证中间件行为。

## 许可证

本项目遵循位于仓库根目录的 [AGPL-3.0 许可证](../../../LICENSE)。
