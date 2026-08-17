import { DeepSeekProviderStrategy } from '../provider.strategy.js'
import { DeepSeekLargeLanguageModel } from './llm.js'

describe('DeepSeek model catalog', () => {
  const provider = new DeepSeekProviderStrategy()
  const modelManager = new DeepSeekLargeLanguageModel(provider)
  const models = modelManager.predefinedModels()

  it('only exposes the current V4 models as active', () => {
    expect(models.map((model) => model.model)).toEqual(['deepseek-v4-flash', 'deepseek-v4-pro'])
  })

  it('validates provider credentials with V4 Flash', async () => {
    const credentials = { api_key: 'test-key', endpoint_url: '' }
    const validateCredentials = jest.spyOn(modelManager, 'validateCredentials').mockResolvedValueOnce()

    await provider.validateProviderCredentials(credentials)

    expect(validateCredentials).toHaveBeenCalledWith('deepseek-v4-flash', credentials)
    validateCredentials.mockRestore()
  })

  it.each([
    [
      'deepseek-v4-flash',
      { cacheRead: 0.05, input: 1.5, output: 4.5 },
      { cacheRead: 0.1, input: 3, output: 9 }
    ],
    [
      'deepseek-v4-pro',
      { cacheRead: 0.15, input: 4.5, output: 13.5 },
      { cacheRead: 0.3, input: 9, output: 27 }
    ]
  ])('contains current recurring prices for %s', (modelName, offPeak, peak) => {
    const model = models.find((candidate) => candidate.model === modelName)
    const rules = model?.pricing && 'rules' in model.pricing ? model.pricing.rules : []
    const byWindow = (startTime?: string) =>
      rules.filter((rule) => rule.daily_time_window?.start_time === startTime)

    expect(model?.pricing).toMatchObject({ currency: 'RMB', unit: '0.000001' })
    expect(byWindow(undefined)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ component: 'cache_read_input', unit_price: offPeak.cacheRead }),
        expect.objectContaining({ component: 'input', unit_price: offPeak.input }),
        expect.objectContaining({ component: 'output', unit_price: offPeak.output })
      ])
    )
    for (const [startTime, endTime] of [
      ['09:00', '12:00'],
      ['14:00', '18:00']
    ]) {
      expect(byWindow(startTime)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            component: 'cache_read_input',
            unit_price: peak.cacheRead,
            daily_time_window: { time_zone: 'Asia/Shanghai', start_time: startTime, end_time: endTime }
          }),
          expect.objectContaining({ component: 'input', unit_price: peak.input }),
          expect.objectContaining({ component: 'output', unit_price: peak.output })
        ])
      )
    }
  })

})
