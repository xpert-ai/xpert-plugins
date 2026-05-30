import { applyTongyiExplicitCache } from './llm.js'

describe('applyTongyiExplicitCache', () => {
  it.each([
    'qwen3.6-plus',
    'qwen3-max-preview',
    'qwen3-coder-plus',
    'qwen3-vl-plus',
    'deepseek-v3.2',
    'glm-5.1'
  ])(
    'adds ephemeral cache control to %s system text content',
    (model) => {
      const request = {
        model,
        messages: [
          { role: 'system', content: 'Long stable system prompt' },
          { role: 'user', content: 'hi' }
        ]
      }

      const patched = applyTongyiExplicitCache(request, { model })

      expect(patched).not.toBe(request)
      expect(request.messages[0].content).toBe('Long stable system prompt')
      expect(patched.messages[0].content).toEqual([
        {
          type: 'text',
          text: 'Long stable system prompt',
          cache_control: { type: 'ephemeral' }
        }
      ])
    }
  )

  it('does not change other models', () => {
    const request = {
      model: 'qwen-turbo',
      messages: [{ role: 'system', content: 'Long stable system prompt' }]
    }

    expect(applyTongyiExplicitCache(request, { model: 'qwen-turbo' })).toBe(request)
  })

  it('does not add duplicate cache control', () => {
    const request = {
      model: 'qwen3.6-plus',
      messages: [
        {
          role: 'system',
          content: [
            {
              type: 'text',
              text: 'Long stable system prompt',
              cache_control: { type: 'ephemeral' }
            }
          ]
        }
      ]
    }

    expect(applyTongyiExplicitCache(request, { model: 'qwen3.6-plus' })).toBe(request)
  })
})
