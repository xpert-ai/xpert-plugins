import { readdirSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const SOURCE_DIRECTORY = join(dirname(fileURLToPath(import.meta.url)), '..')
const RETIRED_MODEL_IDS = [
  'Moonshot-Kimi-K2-Instruct',
  'deepseek-r1',
  'deepseek-r1-distill-qwen-14b',
  'deepseek-r1-distill-qwen-32b',
  'deepseek-v3',
  'deepseek-v3.1',
  'deepseek-v3.2',
  'deepseek-v3.2-exp',
  'deepseek-v4-flash',
  'farui-plus',
  'glm-4.7',
  'kimi-k2-thinking',
  'paraformer-realtime-v1',
  'qvq-max',
  'qwen-coder-turbo',
  'qwen-math-plus',
  'qwen-math-turbo',
  'qwen-mt-turbo',
  'qwen-turbo',
  'qwen-vl-max',
  'qwen-vl-plus',
  'qwen3-14b',
  'qwen3-235b-a22b',
  'qwen3-30b-a3b',
  'qwen3-32b',
  'qwen3-8b',
  'qwen3-coder-30b-a3b-instruct',
  'qwen3-coder-480b-a35b-instruct',
  'qwen3-coder-plus',
  'qwen3-max',
  'qwen3-max-preview',
  'qwen3-next-80b-a3b-instruct',
  'qwen3-next-80b-a3b-thinking',
  'qwen3-vl-235b-a22b-instruct',
  'qwen3-vl-235b-a22b-thinking',
  'qwen3-vl-30b-a3b-instruct',
  'qwen3-vl-30b-a3b-thinking',
  'qwen3-vl-flash',
  'qwq-plus'
] as const

interface CatalogModel {
  model: string
  deprecated: boolean
  text: string
}

function readCatalog(): CatalogModel[] {
  const models: CatalogModel[] = []
  const directories = ['llm', 'speech2text', 'text-embedding', 'rerank', 'tts', 'realtime']
  for (const directory of directories) {
    const directoryPath = join(SOURCE_DIRECTORY, directory)
    for (const fileName of readdirSync(directoryPath)) {
      if (!fileName.endsWith('.yaml') || fileName.startsWith('_')) {
        continue
      }
      const text = readFileSync(join(directoryPath, fileName), 'utf8')
      const modelMatch = text.match(/^model:\s*["']?(.+?)["']?\s*$/m)
      if (!modelMatch?.[1]) {
        throw new Error(`Missing model id in ${directory}/${fileName}`)
      }
      models.push({
        model: modelMatch[1],
        deprecated: /^deprecated:\s*true\s*$/m.test(text),
        text
      })
    }
  }
  return models
}

describe('Tongyi model catalog', () => {
  const catalog = readCatalog()
  const retiredIds = new Set<string>(RETIRED_MODEL_IDS)

  it('marks every retired model deprecated and leaves current models selectable', () => {
    const deprecatedIds = catalog.filter((model) => model.deprecated).map((model) => model.model).sort()
    expect(deprecatedIds).toEqual([...RETIRED_MODEL_IDS].sort())
    for (const modelId of [
      'qwen3.8-flash',
      'qwen-mt-flash',
      'qwen3.8-27b',
      'qwen3.6-35b-a3b',
      'kimi-k3',
      'ZHIPU/GLM-5.3',
      'ZHIPU/GLM-5.3-Flash'
    ]) {
      expect(catalog.find((model) => model.model === modelId)?.deprecated).toBe(false)
    }
    expect(retiredIds.has('qwen3.8-flash')).toBe(false)
  })

  it('adds qwen-mt-flash with the verified Beijing translation limits', () => {
    const model = catalog.find((entry) => entry.model === 'qwen-mt-flash')
    expect(model?.text).toContain('context_size: 16384')
    expect(model?.text).toContain("input: '0.0007'")
    expect(model?.text).toContain("output: '0.00195'")
    expect(model?.text).toContain("unit: '0.001'")
    expect(model?.text).toContain('currency: RMB')
    const position = readFileSync(join(SOURCE_DIRECTORY, 'llm/_position.yaml'), 'utf8')
    const positioned = position.split('\n').map((line) => line.trim()).filter((line) => line.startsWith('- ')).map((line) => line.slice(2))
    const llmIds = new Set(catalog.filter((model) => model.text.includes('model_type: llm')).map((model) => model.model))
    expect(positioned).toContain('qwen-mt-flash')
    expect(new Set(positioned).size).toBe(positioned.length)
    expect(positioned.every((modelId) => llmIds.has(modelId))).toBe(true)
  })
})
