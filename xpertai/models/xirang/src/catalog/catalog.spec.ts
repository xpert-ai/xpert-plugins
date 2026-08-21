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
    expect(activeModels.some((model) => String(model.name).includes('（即将下线）'))).toBe(false)
  })

  it('keeps the verified runtime model counts and video audit list', () => {
    expect(normalized.counts).toEqual({ llm: 97, 'text-embedding': 4, rerank: 4, image: 10, video: 29 })
    expect((normalized.unsupported_video_models as unknown[]).length).toBe(29)
  })

  it('generates all four runtime model directories', () => {
    for (const directory of ['llm', 'text-embedding', 'rerank', 'image']) {
      expect(readdirSync(join(root, '..', directory)).filter((file) => file.endsWith('.yaml')).length).toBeGreaterThan(1)
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
    expect(sourceModels.every((model) => forbiddenFields.every((field) => !Object.prototype.hasOwnProperty.call(model, field)))).toBe(true)
    expect(activeModels.every((model) => forbiddenFields.every((field) => !Object.prototype.hasOwnProperty.call(model, field)) && !Object.prototype.hasOwnProperty.call(model, 'priced'))).toBe(true)

    let yamlPricingCount = 0
    for (const directory of ['llm', 'text-embedding', 'rerank', 'image']) {
      const files = readdirSync(join(root, '..', directory)).filter((file) => file.endsWith('.yaml') && !file.startsWith('_'))
      for (const file of files) {
        if (Object.prototype.hasOwnProperty.call(readJson(join(root, '..', directory, file)), 'pricing')) yamlPricingCount += 1
      }
    }
    expect(yamlPricingCount).toBe(115)

    const glmFile = readdirSync(join(root, '..', 'llm')).find((file) => {
      if (!file.endsWith('.yaml') || file.startsWith('_')) return false
      return readJson(join(root, '..', 'llm', file)).model === 'glm-5.3'
    })
    expect(glmFile).toBeDefined()
    const glmPricing = readJson(join(root, '..', 'llm', glmFile as string)).pricing as Record<string, unknown>
    expect(glmPricing).toEqual(expect.objectContaining({ rules: expect.any(Array) }))
  })
})
