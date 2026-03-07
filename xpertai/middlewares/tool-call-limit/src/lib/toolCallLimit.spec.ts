import { describe, expect, it } from '@jest/globals'
import { AIMessage } from '@langchain/core/messages'
import { ToolCallLimitMiddleware, ALL_TOOLS_KEY } from './toolCallLimit.js'

const calculatorToolCall = {
  id: 'call_allowed',
  name: 'calculator',
  args: { left: 2, right: 2 },
  type: 'tool_call' as const
}

const searchToolCall = {
  id: 'call_blocked',
  name: 'search',
  args: { query: 'DeepSeek reasoning_content' },
  type: 'tool_call' as const
}

describe('ToolCallLimitMiddleware', () => {
  it('preserves assistant metadata when blocking tool calls', async () => {
    const middleware = new ToolCallLimitMiddleware()
    const strategy = await middleware.createMiddleware(
      {
        threadLimit: 1,
        exitBehavior: 'continue'
      },
      {} as never
    )

    const assistantMessage = new AIMessage({
      content: '',
      tool_calls: [calculatorToolCall, searchToolCall],
      additional_kwargs: {
        reasoning_content: 'thought-1'
      },
      response_metadata: {
        model: 'deepseek-reasoner'
      },
      id: 'assistant-1',
      name: 'deepseek'
    })

    const result = await strategy.afterModel.hook({
      messages: [assistantMessage],
      threadToolCallCount: {
        [ALL_TOOLS_KEY]: 0
      },
      runToolCallCount: {
        [ALL_TOOLS_KEY]: 0
      }
    })

    const messages = result?.messages as AIMessage[]
    const modifiedAssistant = messages[0]

    expect(modifiedAssistant.tool_calls).toEqual([calculatorToolCall])
    expect(modifiedAssistant.additional_kwargs?.reasoning_content).toBe('thought-1')
    expect(modifiedAssistant.response_metadata).toEqual({
      model: 'deepseek-reasoner'
    })
    expect(modifiedAssistant.id).toBe('assistant-1')
    expect(modifiedAssistant.name).toBe('deepseek')
  })
})
