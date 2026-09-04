import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

function readJson(path: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
}

describe('generated Xirang catalog', () => {
  const source = readJson(join(root, 'source.snapshot.json'))
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
      'text-embedding': 3,
      'multimodal-embedding': 1,
      rerank: 4,
      image: 17,
      video: 32,
      speech2text: 3
    })
    expect(activeModels).toHaveLength(124)
    expect(normalized.unsupported_models).toHaveLength(45)
    expect((normalized.unsupported_video_models as unknown[]).length).toBe(32)
  })

  it('generates all four runtime model directories', () => {
    const expected = { llm: 109, 'text-embedding': 3, rerank: 4, image: 8 }
    for (const [directory, count] of Object.entries(expected)) {
      expect(
        readdirSync(join(root, '..', directory)).filter((file) => file.endsWith('.yaml') && !file.startsWith('_'))
      ).toHaveLength(count)
    }
  })

  it('keeps unsupported multimodal embedding and image-edit contracts out of runtime YAML', () => {
    const unsupported = normalized.unsupported_models as Array<Record<string, unknown>>
    expect(unsupported).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'qwen3-vl-embedding',
          model_type: 'multimodal-embedding',
          reason: 'multimodal-embedding-api-contract-not-implemented'
        }),
        ...['qwen-image-edit', 'qwen-image-edit-plus', 'qwen-image-edit-max'].map((name) =>
          expect.objectContaining({ name, reason: 'image-edit-api-contract-not-verified' })
        )
      ])
    )

    for (const directory of ['text-embedding', 'image']) {
      const models = readdirSync(join(root, '..', directory))
        .filter((file) => file.endsWith('.yaml') && !file.startsWith('_'))
        .map((file) => readJson(join(root, '..', directory, file)).model)
      expect(models).not.toContain('qwen3-vl-embedding')
      expect(models).not.toContain('qwen-image-edit')
      expect(models).not.toContain('qwen-image-edit-plus')
      expect(models).not.toContain('qwen-image-edit-max')
    }
  })

  it('uses explicit model types instead of inferring them from names', () => {
    const metadata = readJson(join(root, 'model-metadata.json'))
    const llmSpecifications = readJson(join(root, 'llm-specs.json'))
    const llmModels = new Set(
      (llmSpecifications.groups as Array<{ models: string[] }>).flatMap((group) => group.models)
    )
    const typeEntries = Object.entries(metadata.model_types as Record<string, string[]>).flatMap(([type, models]) =>
      models.map((model) => [model, type] as const)
    )
    const explicitTypes = new Map(typeEntries)
    const sourceModels = source.models as Array<Record<string, unknown>>
    const activeSourceModels = sourceModels.filter(
      (model) => !String(model.name).includes('（即将下线）') && model.availability !== 'retired'
    )

    for (const model of activeSourceModels) {
      if (llmModels.has(String(model.name))) continue
      expect(explicitTypes.has(String(model.name))).toBe(true)
    }
    expect(explicitTypes.get('qwen-audio-3.0-asr-flash')).toBe('speech2text')
    expect(explicitTypes.get('qwen3-vl-embedding')).toBe('multimodal-embedding')
  })

  it('assigns every active catalog model to exactly one explicit model type', () => {
    const metadata = readJson(join(root, 'model-metadata.json'))
    const llmSpecifications = readJson(join(root, 'llm-specs.json'))
    const assignments = [
      ...(llmSpecifications.groups as Array<{ models: string[] }>).flatMap((group) =>
        group.models.map((model) => [model, 'llm'] as const)
      ),
      ...Object.entries(metadata.model_types as Record<string, string[]>).flatMap(([type, models]) =>
        models.map((model) => [model, type] as const)
      )
    ]
    const activeSourceNames = (source.models as Array<Record<string, unknown>>)
      .filter((model) => !String(model.name).includes('（即将下线）') && model.availability !== 'retired')
      .map((model) => String(model.name))

    expect(new Set(assignments.map(([model]) => model)).size).toBe(assignments.length)
    expect(new Set(assignments.map(([model]) => model))).toEqual(new Set(activeSourceNames))
  })

  it('declares an explicit feature profile for every runtime LLM', () => {
    const metadata = readJson(join(root, 'model-metadata.json'))
    const llmSpecifications = readJson(join(root, 'llm-specs.json'))
    const llmModels = (llmSpecifications.groups as Array<{ models: string[] }>).flatMap((group) => group.models)
    const profiledModels = (
      metadata.llm_feature_profiles as Array<{ models: string[]; features: string[]; source: string }>
    ).flatMap((profile) => profile.models)

    expect(new Set(profiledModels).size).toBe(profiledModels.length)
    expect(new Set(profiledModels)).toEqual(new Set(llmModels))
  })

  it.each([
    ['kimi-k3', ['vision', 'video']],
    ['kimi-k2.6', ['vision', 'video']],
    ['Kimi-K2.5', ['vision']],
    ['Doubao-Seed-2.0-Pro', ['vision', 'video']],
    ['Doubao-Seed-1.8', ['vision', 'video']],
    ['GLM4.6V', ['vision', 'video']],
    ['glm-5.3-flash', ['vision', 'video']],
    ['deepseek-v4-flash-vision-exp-0817', ['vision']],
    ['Qwen3-14B', ['agent-thought']],
    ['Qwen3-Omni-Flash', ['vision', 'video', 'agent-thought']],
    ['qwen-long', ['document', 'agent-thought']],
    ['glm-4.7', ['agent-thought']]
  ])('publishes the verified capabilities for %s', (model, features) => {
    const file = readdirSync(join(root, '..', 'llm')).find((candidate) => {
      if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
      return readJson(join(root, '..', 'llm', candidate)).model === model
    })
    expect(file).toBeDefined()
    const schema = readJson(join(root, '..', 'llm', file as string))
    expect(schema.features).toEqual(expect.arrayContaining(features))
  })

  it('publishes exact multimodal features and limits for Qwen3.8 without leaking them to Qwen3.7 Max', () => {
    for (const model of ['qwen3.8-max', 'qwen3.8-flash']) {
      const file = readdirSync(join(root, '..', 'llm')).find((candidate) => {
        if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
        return readJson(join(root, '..', 'llm', candidate)).model === model
      })
      const schema = readJson(join(root, '..', 'llm', file as string))
      expect(schema.features).toEqual([
        'tool-call',
        'multi-tool-call',
        'stream-tool-call',
        'structured-output',
        'agent-thought',
        'vision',
        'video'
      ])
    }

    const qwen37File = readdirSync(join(root, '..', 'llm')).find((candidate) => {
      if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
      return readJson(join(root, '..', 'llm', candidate)).model === 'qwen3.7-max'
    })
    const qwen37 = readJson(join(root, '..', 'llm', qwen37File as string))
    expect(qwen37.features).not.toEqual(expect.arrayContaining(['vision', 'video']))
    expect(
      (qwen37.parameter_rules as Array<Record<string, unknown>>).find((rule) => rule.name === 'max_tokens')?.max
    ).toBe(131072)
  })

  it('uses captured endpoint IDs without changing logical model names', () => {
    const captured = (source.models as Array<Record<string, unknown>>).filter((model) => model.model_id)
    const capturedIds = captured.map((model) => String(model.model_id))
    expect(new Set(capturedIds).size).toBe(capturedIds.length)

    for (const sourceModel of captured) {
      const runtimeModel = activeModels.find((model) => model.name === sourceModel.name)
      if (!runtimeModel) continue
      const directory = String(runtimeModel.model_type)
      const file = readdirSync(join(root, '..', directory)).find((candidate) => {
        if (!candidate.endsWith('.yaml') || candidate.startsWith('_')) return false
        return readJson(join(root, '..', directory, candidate)).model === sourceModel.name
      })
      const schema = readJson(join(root, '..', directory, file as string))
      expect(schema.model).toBe(sourceModel.name)
      expect(schema.modelConfig).toEqual({ endpoint_model_name: sourceModel.model_id })
    }
  })

  it('uses image model properties rather than a token context window', () => {
    for (const file of readdirSync(join(root, '..', 'image')).filter(
      (candidate) => candidate.endsWith('.yaml') && !candidate.startsWith('_')
    )) {
      expect(readJson(join(root, '..', 'image', file)).model_properties).toEqual({ mode: 'image' })
    }
  })

  it('only declares parameters and pricing operations covered by the verified text-to-image contract', () => {
    for (const file of readdirSync(join(root, '..', 'image')).filter(
      (candidate) => candidate.endsWith('.yaml') && !candidate.startsWith('_')
    )) {
      const schema = readJson(join(root, '..', 'image', file))
      const parameterNames = (schema.parameter_rules as Array<Record<string, unknown>>).map((rule) => rule.name)
      expect(parameterNames).not.toContain('watermark')
      for (const rule of ((schema.pricing as Record<string, unknown>).rules ?? []) as Array<Record<string, unknown>>) {
        if (rule.operations) expect(rule.operations).toEqual(['text_to_image'])
      }
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
    ['qwen3.7-max', 1000000, 131072],
    ['Qwen3.5-122B-A10B', 32768, 8192],
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
    expect(yamlPricingCount).toBe(124)

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
