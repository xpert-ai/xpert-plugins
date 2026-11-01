import { AiProviderRole } from '@xpert-ai/contracts'
import { VolcengineProviderStrategy } from '../provider.strategy.js'
import { VolcengineLargeLanguageModel } from './llm.js'
import { getArkPriceMode } from './pricing.js'

describe('Ark weekday pricing', () => {
  const manager = new VolcengineLargeLanguageModel(new VolcengineProviderStrategy())
  const usage = { promptTokens: 1500000, completionTokens: 1000000, totalTokens: 2500000, cacheReadInputTokens: 500000 }

  it.each([
    ['2026-10-26T08:59:59+08:00', 5.01],
    ['2026-10-26T09:00:00+08:00', 10.02],
    ['2026-10-26T12:00:00+08:00', 5.01],
    ['2026-10-26T14:00:00+08:00', 10.02],
    ['2026-10-26T18:00:00+08:00', 5.01],
    ['2026-10-24T10:00:00+08:00', 5.01],
    ['2026-10-25T15:00:00+08:00', 5.01]
  ])('prices uncached, cached and output tokens at %s', (pricingTime, expected) => {
    for (const model of ['deepseek-v4-1-flash-260910', 'deepseek-v4-1-flash-261017']) {
      const price = manager.priceActualTokenUsage(model, usage, { pricingTime })
      expect(price.pricingStatus).toBe('priced')
      expect(price.totalPrice).toBeCloseTo(expected, 8)
    }
    expect(manager.priceActualTokenUsage('deepseek-v4-1-flash-economy-261017', usage, { pricingTime }).totalPrice)
      .toBeCloseTo(expected * 0.8, 8)
  })

  it('selects the completion tariff when a request crosses the 09:00 boundary', async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-10-26T08:59:00+08:00'))
    try {
      const handleUsage = jest.fn()
      const callbacks = manager.createHandleUsageCallbacks({ role: AiProviderRole.Primary },
        'deepseek-v4-1-flash-261017', {}, handleUsage, { resolveContext: () => ({ mode: getArkPriceMode() }) })
      const callback = callbacks[0]
      await callback.handleLLMStart?.({ lc: 1, type: 'not_implemented', id: ['test'] }, ['hello'], 'run')
      jest.setSystemTime(new Date('2026-10-26T09:01:00+08:00'))
      await callback.handleLLMEnd?.({ generations: [[{ text: 'answer' }]],
        llmOutput: { tokenUsage: { promptTokens: 1000000, completionTokens: 1000000, totalTokens: 2000000 } } }, 'run')
      expect(handleUsage).toHaveBeenCalledWith(expect.objectContaining({ usage: expect.objectContaining({ totalPrice: 10 }) }))
    } finally { jest.useRealTimers() }
  })
})
