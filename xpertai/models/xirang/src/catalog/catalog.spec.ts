import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('generated Xirang catalog', () => {
  const source = readJson(join(root, 'source.snapshot.json'))
  const llmSpecs = readJson(join(root, 'llm-specs.json'))
  const normalized = readJson(join(root, 'normalized.snapshot.json'))
  const activeModels = normalized.active_models as Array<Record<string, unknown>>
  const policy = normalized.policy as Record<string, unknown>

  it('excludes every service marked as being retired', () => {
    const excluded = policy.excluded_deprecated as string[]
    expect(excluded.length).toBe(5)
    expect(policy.excluded_retired).toEqual(['Kimi-K2-Thinking', 'Kimi-K2-Instruct'])
    expect(activeModels.some((model) => String(model.name).includes('（即将下线）'))).toBe(false)
  })

  it('keeps the synchronized runtime counts and unsupported model audit list', () => {
    expect(normalized.counts).toEqual({
      llm: 109,
      'text-embedding': 4,
      rerank: 4,
      image: 17,
      video: 32,
      'speech-to-text': 3
    })
    expect(activeModels).toHaveLength(128)
    expect(normalized.unsupported_models).toHaveLength(41)
    expect((normalized.unsupported_video_models as unknown[]).length).toBe(32)
  })

  it('generates all four runtime model directories', () => {
    for (const directory of ['llm', 'text-embedding', 'rerank', 'image']) {
      expect(readdirSync(join(root, '..', directory)).filter((file) => file.endsWith('.yaml')).length).toBeGreaterThan(
        1
      )
    }
  })

  it('keeps the documented context limits for predefined rerank models', () => {
    const expected = {
      'BGE-Reranker-Large': 512,
      'BGE-Reranker-V2-m3': 8192,
      'qwen3-rerank': 120000,
      'gte-rerank-v2': 30000
    }
    for (const [model, contextSize] of Object.entries(expected)) {
      const file = readdirSync(join(root, '..', 'rerank')).find((candidate) => {
        if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
        return readJson(join(root, '..', 'rerank', candidate)).model === model
      })
      expect(file).toBeDefined()
      const schema = readJson(join(root, '..', 'rerank', file as string))
      expect((schema.model_properties as Record<string, unknown>).context_size).toBe(contextSize)
    }
  })

  it('generates explicit context and output limits for every runtime LLM', () => {
    const expected = new Map(
      activeModels.filter((model) => model.model_type === 'llm').map((model) => [String(model.name), model] as const)
    )
    const files = readdirSync(join(root, '..', 'llm')).filter((file) => file.endsWith('.yaml') && !file.startsWith('_'))

    expect(files).toHaveLength(109)
    for (const file of files) {
      const schema = readJson(join(root, '..', 'llm', file))
      const specification = expected.get(String(schema.model))
      const maxTokens = (schema.parameter_rules as Array<Record<string, unknown>>).find(
        (rule) => rule.name === 'max_tokens'
      )
      expect(specification).toBeDefined()
      expect((schema.model_properties as Record<string, unknown>).context_size).toBe(specification?.context_size)
      expect(maxTokens?.max).toBe(specification?.max_output_tokens)
      expect(Number(maxTokens?.default)).toBeGreaterThan(0)
      expect(Number(maxTokens?.default)).toBeLessThanOrEqual(Number(maxTokens?.max))
    }
  })

  it.each([
    ['qwen3.8-flash', 1000000, 131072],
    ['deepseek-v4-flash-vision-exp-0817', 1000000, 384000],
    ['glm-5.3-flash', 1000000, 131072],
    ['deepseek-v4-pro-0813', 1000000, 384000],
    ['qwen-long', 10000000, 8192]
  ])('keeps verified limits for %s', (model, contextSize, maxOutputTokens) => {
    expect(activeModels).toContainEqual(
      expect.objectContaining({
        name: model,
        context_size: contextSize,
        max_output_tokens: maxOutputTokens
      })
    )
  })

  it('keeps generated vision features aligned with the verified Xirang catalog', () => {
    const featureGroups = llmSpecs.feature_groups as Array<Record<string, unknown>>
    const expectedVisionModels = featureGroups
      .filter((group) => (group.features as string[]).includes('vision'))
      .flatMap((group) => group.models as string[])
      .sort()
    const actualVisionModels = readdirSync(join(root, '..', 'llm'))
      .filter((file) => file.endsWith('.yaml') && !file.startsWith('_'))
      .map((file) => readJson(join(root, '..', 'llm', file)))
      .filter((model) => ((model.features as string[] | undefined) ?? []).includes('vision'))
      .map((model) => String(model.model))
      .sort()

    expect(policy.llm_features_verified_at).toBe(llmSpecs.features_verified_at)
    expect(expectedVisionModels).toHaveLength(48)
    expect(new Set(expectedVisionModels).size).toBe(expectedVisionModels.length)
    expect(actualVisionModels).toEqual(expectedVisionModels)
    expect(actualVisionModels).toEqual(expect.arrayContaining(['qwen3.8-max', 'qwen3.8-flash', 'kimi-k3']))
    expect(actualVisionModels).not.toContain('qwen3.7-max')
  })

  it('keeps the public catalog free of commercial pricing metadata', () => {
    const sourceModels = source.models as Array<Record<string, unknown>>
    const forbiddenFields = [
      'input',
      'output',
      'cache_hit_input',
      'input_segments',
      'output_segments',
      'cache_hit_input_segments',
      'status'
    ]
    expect(Object.prototype.hasOwnProperty.call(policy, 'price_policy')).toBe(false)
    expect(
      sourceModels.every((model) =>
        forbiddenFields.every((field) => !Object.prototype.hasOwnProperty.call(model, field))
      )
    ).toBe(true)
    expect(
      activeModels.every(
        (model) =>
          forbiddenFields.every((field) => !Object.prototype.hasOwnProperty.call(model, field)) &&
          !Object.prototype.hasOwnProperty.call(model, 'priced')
      )
    ).toBe(true)

    let yamlPricingCount = 0
    for (const directory of ['llm', 'text-embedding', 'rerank', 'image']) {
      const files = readdirSync(join(root, '..', directory)).filter(
        (file) => file.endsWith('.yaml') && !file.startsWith('_')
      )
      for (const file of files) {
        if (Object.prototype.hasOwnProperty.call(readJson(join(root, '..', directory, file)), 'pricing'))
          yamlPricingCount += 1
      }
    }
    expect(yamlPricingCount).toBe(128)

    const glmFile = readdirSync(join(root, '..', 'llm')).find((file) => {
      if (!file.endsWith('.yaml') || file.startsWith('_')) return false
      return readJson(join(root, '..', 'llm', file)).model === 'glm-5.3'
    })
    expect(glmFile).toBeDefined()
    const glmPricing = readJson(join(root, '..', 'llm', glmFile as string)).pricing as Record<string, unknown>
    expect(glmPricing).toEqual(expect.objectContaining({ rules: expect.any(Array) }))

    const qwenFlashFile = readdirSync(join(root, '..', 'llm')).find((file) => {
      if (!file.endsWith('.yaml') || file.startsWith('_')) return false
      return readJson(join(root, '..', 'llm', file)).model === 'qwen3.8-flash'
    })
    const qwenFlashPricing = readJson(join(root, '..', 'llm', qwenFlashFile as string)).pricing as Record<
      string,
      unknown
    >
    expect(qwenFlashPricing).toMatchObject({ input: '0.8', output: '2.7', currency: 'CNY' })

    const seedreamFile = readdirSync(join(root, '..', 'image')).find((file) => {
      if (!file.endsWith('.yaml') || file.startsWith('_')) return false
      return readJson(join(root, '..', 'image', file)).model === 'doubao-seedream-5.0-pro'
    })
    const seedreamPricing = readJson(join(root, '..', 'image', seedreamFile as string)).pricing as Record<
      string,
      unknown
    >
    expect(seedreamPricing.source_url).toBe('https://ctxirang.ctyun.cn/maas/inlineService')
    expect(String(seedreamPricing.source_note)).toContain('2.61MP')
    expect(seedreamPricing.rules).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unit_price: 0.02,
          component: 'input',
          source_url: 'https://ctxirang.ctyun.cn/maas/inlineService'
        }),
        expect.objectContaining({
          unit_price: 0.3,
          component: 'output',
          dimensions: { resolution: 'le-2.61mp', mode: 'standard' },
          source_url: 'https://www.volcengine.com/docs/82379/1544106'
        }),
        expect.objectContaining({
          unit_price: 0.6,
          component: 'output',
          dimensions: { resolution: 'gt-2.61mp', mode: 'standard' },
          source_url: 'https://www.volcengine.com/docs/82379/1544106'
        })
      ])
    )
  })

  it('applies discounted DeepSeek prices outside the two standard-price windows', () => {
    for (const model of ['deepseek-v4-flash-vision-exp-0817', 'deepseek-v4-pro-0813']) {
      const file = readdirSync(join(root, '..', 'llm')).find((candidate) => {
        if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
        return readJson(join(root, '..', 'llm', candidate)).model === model
      })
      expect(file).toBeDefined()
      const schema = readJson(join(root, '..', 'llm', file as string))
      const pricing = schema.pricing as Record<string, unknown>
      const isPro = model.includes('pro-0813')
      const rules = pricing.rules as Array<Record<string, unknown>>
      const byWindow = (startTime?: string) =>
        rules.filter((rule) => {
          const window = rule.daily_time_window as Record<string, unknown> | undefined
          return window?.start_time === startTime || (!window && startTime === undefined)
        })

      expect(pricing.source_url).toBe('https://ctxirang.ctyun.cn/maas/inlineService')
      expect(byWindow(undefined)).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ component: 'input', unit_price: isPro ? 4.5 : 1.5 }),
          expect.objectContaining({ component: 'cache_read_input', unit_price: isPro ? 0.45 : 0.05 }),
          expect.objectContaining({ component: 'output', unit_price: isPro ? 13.5 : 4.5 })
        ])
      )
      for (const [startTime, endTime] of [
        ['09:00', '12:00'],
        ['14:00', '18:00']
      ]) {
        expect(byWindow(startTime)).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              component: 'input',
              unit_price: isPro ? 9 : 3,
              daily_time_window: { time_zone: 'Asia/Shanghai', start_time: startTime, end_time: endTime }
            }),
            expect.objectContaining({ component: 'cache_read_input', unit_price: isPro ? 0.9 : 0.1 }),
            expect.objectContaining({ component: 'output', unit_price: isPro ? 27 : 9 })
          ])
        )
      }
    }
  })

  it.each([
    ['qwen3-max-2026-01-23（国际）', '8.81', '44.03', [8.81, 17.61, 22.02, 44.03, 88.07, 110.09]],
    ['qwen3.5-flash（国际）', '0.73', '2.94', [0.73, 2.94]],
    ['qwen3.6-plus-2026-04-02（国际）', '3.75', '22.48', [3.75, 14.99, 22.48, 44.96]],
    ['qwen3.6-plus（国际）', '3.75', '22.48', [3.75, 14.99, 22.48, 44.96]],
    ['qwen3.6-flash（国际）', '1.87', '11.24', [1.87, 7.49, 11.24, 29.98]]
  ])('uses Tianyi Cloud displayed CNY precision for %s', (model, input, output, expectedUnitPrices) => {
    const file = readdirSync(join(root, '..', 'llm')).find((candidate) => {
      if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
      return readJson(join(root, '..', 'llm', candidate)).model === model
    })
    expect(file).toBeDefined()
    const pricing = readJson(join(root, '..', 'llm', file as string)).pricing as Record<string, unknown>
    expect(pricing).toMatchObject({
      input,
      output,
      source_url: 'https://ctxirang.ctyun.cn/maas/inlineService'
    })
    expect((pricing.rules as Array<Record<string, unknown>>).map((rule) => rule.unit_price)).toEqual(expectedUnitPrices)
  })
})
