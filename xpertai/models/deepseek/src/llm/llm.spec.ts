import { buildDeepSeekThinkingParameter } from './llm.js'

describe('DeepSeek model parameters', () => {
  it('keeps enabled and disabled thinking values explicit', () => {
    expect(buildDeepSeekThinkingParameter(true)).toEqual({
      thinking: { type: 'enabled' }
    })
    expect(buildDeepSeekThinkingParameter(false)).toEqual({
      thinking: { type: 'disabled' }
    })
  })

  it('does not add thinking for models without a thinking rule', () => {
    expect(buildDeepSeekThinkingParameter(undefined)).toEqual({})
  })
})
