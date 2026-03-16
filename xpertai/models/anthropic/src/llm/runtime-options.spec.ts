import { AIMessage, HumanMessage, SystemMessage, ToolMessage } from '@langchain/core/messages'
import {
  applyPromptCachingToTools,
  buildAnthropicBetaHeader,
  buildAnthropicThinkingConfig,
  prepareAnthropicMessages
} from './runtime-options.js'

describe('Anthropic runtime options', () => {
  it('should clamp thinking budget to Anthropic minimum', () => {
    expect(buildAnthropicThinkingConfig(true, 64)).toEqual({
      type: 'enabled',
      budget_tokens: 1024
    })
  })

  it('should disable thinking when requested', () => {
    expect(buildAnthropicThinkingConfig(false, 4096)).toEqual({
      type: 'disabled'
    })
  })

  it('should compose beta headers for prompt caching and 1M context', () => {
    expect(
      buildAnthropicBetaHeader({
        context1m: true,
        promptCaching: {
          messageFlowThreshold: 0,
          cacheSystemMessage: false,
          cacheImages: false,
          cacheDocuments: false,
          cacheToolDefinitions: true,
          cacheToolResults: false
        }
      })
    ).toBe('context-1m-2025-08-07,prompt-caching-2024-07-31')
  })

  it('should cache tagged system message segments', () => {
    const [message] = prepareAnthropicMessages(
      [new SystemMessage('Before <cache>Stable</cache> After')],
      {
        messageFlowThreshold: 0,
        cacheSystemMessage: true,
        cacheImages: false,
        cacheDocuments: false,
        cacheToolDefinitions: false,
        cacheToolResults: false
      }
    )

    expect(message.content).toEqual([
      { type: 'text', text: 'Before ' },
      { type: 'text', text: 'Stable', cache_control: { type: 'ephemeral' } },
      { type: 'text', text: ' After' }
    ])
  })

  it('should cache large human messages and tool results', () => {
    const [humanMessage, toolMessage] = prepareAnthropicMessages(
      [
        new HumanMessage('one two three four'),
        new ToolMessage({ content: 'tool output', tool_call_id: 'tool-1' })
      ],
      {
        messageFlowThreshold: 4,
        cacheSystemMessage: false,
        cacheImages: false,
        cacheDocuments: false,
        cacheToolDefinitions: false,
        cacheToolResults: true
      }
    )

    expect(humanMessage.content).toEqual([
      { type: 'text', text: 'one two three four', cache_control: { type: 'ephemeral' } }
    ])
    expect(toolMessage.content).toEqual([
      { type: 'text', text: 'tool output', cache_control: { type: 'ephemeral' } }
    ])
  })

  it('should cache image blocks when enabled', () => {
    const [message] = prepareAnthropicMessages(
      [
        new AIMessage({
          content: [{ type: 'image_url', image_url: 'https://example.com/cat.png' }]
        })
      ],
      {
        messageFlowThreshold: 0,
        cacheSystemMessage: false,
        cacheImages: true,
        cacheDocuments: false,
        cacheToolDefinitions: false,
        cacheToolResults: false
      }
    )

    expect(message.content).toEqual([
      {
        type: 'image_url',
        image_url: 'https://example.com/cat.png',
        cache_control: { type: 'ephemeral' }
      }
    ])
  })

  it('should cache tool definitions when enabled', () => {
    expect(
      applyPromptCachingToTools(
        [
          {
            name: 'lookup',
            description: 'Lookup a record',
            input_schema: { type: 'object', properties: {} }
          }
        ],
        true
      )
    ).toEqual([
      {
        name: 'lookup',
        description: 'Lookup a record',
        input_schema: { type: 'object', properties: {} },
        cache_control: { type: 'ephemeral' }
      }
    ])
  })
})
