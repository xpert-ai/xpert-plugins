import { AiModelTypeEnum } from '@xpert-ai/contracts'
import { calculateModelUsageCharge, resolveModelUsagePricingSnapshot } from '@xpert-ai/plugin-sdk'
import { StepfunProviderStrategy } from './provider.strategy.js'
import { StepfunLargeLanguageModel } from './llm/llm.js'
import { StepfunTTSModel } from './tts/tts.js'
import { StepfunSpeech2TextModel } from './speech2text/speech2text.js'

describe('StepFun November catalog', () => {
  it('loads both audio catalogs and keeps the Step 5 output limit within the official 64k', () => {
    const provider = new StepfunProviderStrategy()
    expect(new StepfunTTSModel(provider).predefinedModels().map(m => m.model)).toContain('stepaudio-3-tts')
    expect(new StepfunSpeech2TextModel(provider).predefinedModels().map(m => m.model)).toContain('stepaudio-3-asr-max')
    const llm = new StepfunLargeLanguageModel(provider)
    const model = llm.predefinedModels().find(m => m.model === 'step-5-preview')
    expect(model?.model_properties.context_size).toBe(1000000)
    expect(model?.parameter_rules.find(rule => rule.name === 'max_tokens')?.max).toBe(64000)
  })
  it('switches from the dated launch promotion to duration pricing on November 9', () => {
    const model = new StepfunSpeech2TextModel(new StepfunProviderStrategy()).predefinedModels().find(m => m.model === 'stepaudio-3-asr-max')
    const context = { model: 'stepaudio-3-asr-max', operation: AiModelTypeEnum.SPEECH2TEXT, modality: 'audio' as const }
    const before = resolveModelUsagePricingSnapshot(model?.pricing, { ...context, startedAt: '2026-11-08T23:59:59+08:00' })
    const after = resolveModelUsagePricingSnapshot(model?.pricing, { ...context, startedAt: '2026-11-09T00:00:00+08:00' })
    const seconds = { unit: 'second' as const, component: 'input' as const, quantity: 3600, authority: 'provider' as const }
    expect(calculateModelUsageCharge(before, seconds)).toMatchObject({ pricingStatus: 'free', amount: 0 })
    expect(calculateModelUsageCharge(after, seconds)).toMatchObject({ pricingStatus: 'priced', amount: 7.5 })
    expect(calculateModelUsageCharge(after, { unit: 'token', promptTokens: 3600, authority: 'provider' })).toMatchObject({ pricingStatus: 'unpriced' })
  })
})
