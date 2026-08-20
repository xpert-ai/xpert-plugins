import { readFileSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = dirname(fileURLToPath(import.meta.url))

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

  it('does not mistake unknown token prices for free', () => {
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
    const readModel = (modelType: string, modelName: string) => {
      const directory = join(root, '..', modelType)
      const file = readdirSync(directory).find((entry) => {
        if (!entry.endsWith('.yaml') || entry.startsWith('_')) return false
        const value = JSON.parse(readFileSync(join(directory, entry), 'utf8')) as { model?: string }
        return value.model === modelName
      })
      if (!file) throw new Error(`Missing generated model ${modelType}.${modelName}`)
      return JSON.parse(readFileSync(join(directory, file), 'utf8')) as {
        pricing: { input: string; output: string; rules: Array<Record<string, unknown>> }
      }
    }

    const exact = readModel('llm', 'DeepSeek-V4-Flash').pricing
    expect(exact.input).toBe('1')
    expect(exact.output).toBe('2')
    expect(exact.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 1, unit_size: 1_000_000 }),
      expect.objectContaining({ component: 'output', unit_price: 2, unit_size: 1_000_000 })
    ]))

    const tiered = readModel('llm', 'DeepSeek-V3.2（旗舰版）').pricing
    expect(tiered.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', unit_price: 2, daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '08:00', end_time: '24:00' } }),
      expect.objectContaining({ component: 'input', unit_price: 1, daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '00:00', end_time: '08:00' } })
    ]))

    const unknown = readModel('llm', 'GLM-5.1').pricing
    expect(unknown.rules).toEqual(expect.arrayContaining([
      expect.objectContaining({ component: 'input', mode: '__xirang_unpriced__' }),
      expect.objectContaining({ component: 'output', mode: '__xirang_unpriced__' })
    ]))
  })

  it('uses the confirmed per-image price only for Seedream 4.5', () => {
    const directory = join(root, '..', 'image')
    const file = readdirSync(directory).find((entry) => entry.includes('seedream-4.5'))
    expect(file).toBeDefined()
    const model = JSON.parse(readFileSync(join(directory, file as string), 'utf8')) as { pricing: { rules: Array<Record<string, unknown>> } }
    expect(model.pricing.rules[0]).toEqual(expect.objectContaining({ unit: 'generation', unit_price: 0.25, unit_size: 1 }))
  })
})
