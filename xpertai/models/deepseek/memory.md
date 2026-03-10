# DeepSeek Plugin Update Notes

## fix/deepseek-reasoning-content

### 修复内容

1. 修复了流式场景下 reasoning_content 丢失/被后续 chunk 覆盖的问题（尤其是多轮 tool-call 后续轮次）。
   对应实现：llm.ts:367, llm.ts:389
2. 修复了历史消息映射时 reasoning_content 可能被"truthy 判断"吞掉的问题（现在空字符串也会被保留并传递）。
   对应实现：llm.ts:318
3. 修复了工具调用限流中间件在裁剪 tool_calls 时丢失 AIMessage 元数据（含 reasoning_content）的问题，这会间接导致 DeepSeek 多轮上下文失真。
   对应实现：toolCallLimit.ts:180, toolCallLimit.ts:647
4. 修复了模型配置过期问题：移除官方已下线的 deepseek-coder，避免用户选到不可用模型。
   对应实现：_position.yaml:1, deepseek.yaml:5, deepseek-coder.yaml
5. 修复了 deepseek-reasoner 参数上限落后于新规格的问题（max_tokens 提升到 65536，默认 32768）。
   对应实现：deepseek-reasoner.yaml:15

### 验证结果

1. DeepSeek 回归单测通过：reasoning-content.unit.spec.ts（2/2 通过）。参考：reasoning-content.unit.spec.ts:57
2. Tool-call-limit 相关单测通过：toolCallLimit.spec.ts（1/1 通过）。参考：toolCallLimit.spec.ts:20
3. lifecycle 已通过（使用 plugin-dev-harness 针对 DeepSeek 包目录运行）。
