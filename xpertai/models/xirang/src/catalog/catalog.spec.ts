import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { PriceConfig } from '@xpert-ai/contracts'

const root = dirname(fileURLToPath(import.meta.url))

function readModel(modelType: string, modelName: string) {
  const directory = join(root, '..', modelType)
  const file = readdirSync(directory).find((entry) => {
    if (!entry.endsWith('.yaml') || entry.startsWith('_')) return false
    const value = JSON.parse(readFileSync(join(directory, entry), 'utf8')) as { model?: string }
    return value.model === modelName
  })
  if (!file) throw new Error(`Missing generated model ${modelType}.${modelName}`)
  return JSON.parse(readFileSync(join(directory, file), 'utf8')) as {
    pricing: PriceConfig & { input: string; output: string }
  }
}

describe('generated Xirang catalog', () => {
  const normalized = JSON.parse(readFileSync(join(root, 'normalized.snapshot.json'), 'utf8')) as {
    counts: Record<string, number>
    active_models: Array<{ name: string; model_type: string; priced: boolean }>
    policy: { excluded_deprecated: string[] }
    unsupported_video_models: Array<{ name: string }>
  }

  it('excludes every service marked as being retired', () => {
    expect(normalized.policy.excluded_deprecated.length).toBe(5)
    expect(normalized.active_models.some((model) => model.name.includes('（即将下线）'))).toBe(false)
  })

  it('keeps the verified runtime model counts and video audit list', () => {
    expect(normalized.counts).toEqual({ llm: 97, 'text-embedding': 4, rerank: 4, image: 10, video: 29 })
    expect(normalized.unsupported_video_models.length).toBe(29)
  })

  it('does not mistake dash token prices for free', () => {
    const llmModels = normalized.active_models.filter((model) => model.model_type === 'llm')
    expect(llmModels.some((model) => !model.priced)).toBe(true)
    expect(llmModels.some((model) => model.name === 'DeepSeek-V4-Flash' && model.priced)).toBe(true)
  })

  it('generates all four runtime model directories', () => {
    for (const directory of ['llm', 'text-embedding', 'rerank', 'image']) {
      expect(readdirSync(join(root, '..', directory)).filter((file) => file.endsWith('.yaml')).length).toBeGreaterThan(1)
    }
  })

  it('preserves exact, tiered, and unknown token pricing distinctly', () => {
    const exact = readModel('llm', 'DeepSeek-V4-Flash').pricing
    expect(exact.input).toBe('1')
    expect(exact.output).toBe('2')
    expect(exact.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 1, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'output', unit_price: 2, unit_size: 1_000_000 })
    ]))

    const exactCurrent = readModel('llm', 'DeepSeek-V3.2（旗舰版）').pricing
    expect(exactCurrent.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 2, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'cache_read_input', unit_price: 0.2, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'output', unit_price: 3, unit_size: 1_000_000 })
    ]))

    const segmented = readModel('llm', 'GLM-5.1').pricing
    expect(segmented.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 6, max_input_tokens: 32_768 }),
      expect.objectContaining({ component: 'input', unit_price: 8, min_input_tokens: 32_769 }),
      expect.objectContaining({ component: 'output', unit_price: 24, max_input_tokens: 32_768 }),
      expect.objectContaining({ component: 'output', unit_price: 28, min_input_tokens: 32_769 })
    ]))
  })

  it('prices the two activated models including cache-hit input tokens', () => {
    const glm = readModel('llm', 'glm-5.3').pricing
    expect(glm.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 8, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'cache_read_input', unit_price: 2, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'output', unit_price: 28, unit_size: 1_000_000 })
    ]))
    expect(glm.input).toBe('8')
    expect(glm.output).toBe('28')

    const deepseek = readModel('llm', 'deepseek-v4-flash-0731-new').pricing
    expect(deepseek.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 3, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'cache_read_input', unit_price: 0.3, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'output', unit_price: 9, unit_size: 1_000_000 })
    ]))
    expect(deepseek.input).toBe('3')
    expect(deepseek.output).toBe('9')
  })

  it('uses the current per-image prices for every active image model', () => {
    const directory = join(root, '..', 'image')
    const expected = new Map([
      ['Doubao-seedream-4.5', 0.25],
      ['Doubao-Seedream-5.0-lite', 0.22],
      ['Doubao-seedream-4.0', 0.2],
      ['qwen-image-2.0-pro', 0.5],
      ['qwen-image-edit', 0.3],
      ['qwen-image-edit-plus', 0.2],
      ['qwen-image-edit-max', 0.5],
      ['wan2.7-image', 0.2],
      ['wan2.7-image-pro', 0.5],
      ['wan2.6-image', 0.2]
    ])
    for (const [modelName, unitPrice] of expected) {
      const file = readdirSync(directory).find((entry) => entry.endsWith('.yaml') && JSON.parse(readFileSync(join(directory, entry), 'utf8')).model === modelName)
      expect(file).toBeDefined()
      const model = JSON.parse(readFileSync(join(directory, file as string), 'utf8')) as { pricing: { rules: Array<Record<string, unknown>> } }
      expect(model.pricing.rules[0]).toEqual(expect.objectContaining({ unit: 'generation', unit_price: unitPrice, unit_size: 1 }))
    }
  })
})
