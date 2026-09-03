import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const srcRoot = join(packageRoot, 'src')
const sourcePath = join(srcRoot, 'catalog', 'source.snapshot.json')
const llmSpecsPath = join(srcRoot, 'catalog', 'llm-specs.json')
const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
const llmSpecsSource = JSON.parse(readFileSync(llmSpecsPath, 'utf8'))
const capturedAt = source.captured_at || new Date().toISOString()

// JSON is a valid YAML 1.2 document and keeps this catalog generator
// dependency-free when the plugin repository is checked out standalone.
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`

const imagePattern = /(seedream|qwen-image|wan2\.[67]-image)/i
const videoPattern = /(t2v|i2v|r2v|kf2v|video|seedance|animate-mix|^minimax-h3$)/i
const speechPattern = /(asr|speech-to-text)/i
const embeddingPattern = /(embedding|bge-m3)/i
const rerankPattern = /(rerank|reranker|gte-rerank)/i
const runtimeModelTypes = new Set(['llm', 'text-embedding', 'rerank', 'image'])
const rerankContextSizes = {
  'BGE-Reranker-Large': 512,
  'BGE-Reranker-V2-m3': 8192,
  'qwen3-rerank': 120000,
  'gte-rerank-v2': 30000
}

const llmSpecs = new Map()
for (const group of llmSpecsSource.groups) {
  for (const model of group.models) {
    if (llmSpecs.has(model)) throw new Error(`Duplicate LLM specification: ${model}`)
    llmSpecs.set(model, {
      context_size: group.context_size,
      max_output_tokens: group.max_output_tokens,
      default_max_tokens: group.default_max_tokens,
      source: group.source
    })
  }
}

function classify(row) {
  if (row.model_type) return row.model_type
  const name = row.name
  if (imagePattern.test(name)) return 'image'
  if (videoPattern.test(name)) return 'video'
  if (speechPattern.test(name)) return 'speech-to-text'
  if (embeddingPattern.test(name)) return 'text-embedding'
  if (rerankPattern.test(name)) return 'rerank'
  return 'llm'
}

function slug(name, index) {
  const value = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${String(index).padStart(3, '0')}-${value || 'model'}`
}

function llmFeatures(name) {
  const normalized = name.toLowerCase()
  const features = ['tool-call', 'multi-tool-call', 'stream-tool-call', 'structured-output']
  if (/(deepseek|reason|thinking|kimi-k[23]|glm-5|glm4\.6v|minimax-m[23]|qwen3\.[5-8])/i.test(normalized))
    features.push('agent-thought')
  if (/(vl|vision|omni|seed-1\.6-vision|glm4\.6v|glm-5\.3-flash|qwen3\.[5-8])/i.test(normalized))
    features.push('vision')
  return [...new Set(features)]
}

function parameterRules(modelType, llmSpec) {
  if (modelType === 'llm') {
    return [
      {
        name: 'temperature',
        use_template: 'temperature',
        label: { zh_Hans: '温度', en_US: 'Temperature' },
        default: 0.2,
        min: 0,
        max: 2
      },
      { name: 'top_p', use_template: 'top_p', label: { zh_Hans: 'Top P', en_US: 'Top P' }, default: 1, min: 0, max: 1 },
      {
        name: 'max_tokens',
        use_template: 'max_tokens',
        label: { zh_Hans: '最大输出 Token', en_US: 'Max output tokens' },
        default: llmSpec.default_max_tokens,
        min: 1,
        max: llmSpec.max_output_tokens
      },
      {
        name: 'response_format',
        type: 'string',
        label: { zh_Hans: '回复格式', en_US: 'Response format' },
        required: false,
        options: ['text', 'json_object']
      },
      {
        name: 'enable_thinking',
        type: 'boolean',
        label: { zh_Hans: '思考模式', en_US: 'Thinking mode' },
        required: false,
        default: false
      }
    ]
  }
  if (modelType === 'image') {
    return [
      { name: 'prompt', type: 'text', label: { zh_Hans: '提示词', en_US: 'Prompt' }, required: true },
      { name: 'size', type: 'string', label: { zh_Hans: '尺寸', en_US: 'Size' }, required: false, default: '2K' },
      {
        name: 'response_format',
        type: 'string',
        label: { zh_Hans: '响应格式', en_US: 'Response format' },
        required: false,
        default: 'url',
        options: ['url', 'b64_json']
      },
      {
        name: 'watermark',
        type: 'boolean',
        label: { zh_Hans: '水印', en_US: 'Watermark' },
        required: false,
        default: true
      }
    ]
  }
  return []
}

const preservedModels = new Map()
for (const modelType of ['llm', 'text-embedding', 'rerank', 'image']) {
  const folder = join(srcRoot, modelType)
  for (const file of readdirSync(folder)) {
    if (!file.endsWith('.yaml') || file === '_position.yaml') continue
    const model = JSON.parse(readFileSync(join(folder, file), 'utf8'))
    if (typeof model.model !== 'string') continue
    preservedModels.set(model.model, {
      file,
      model_type: modelType,
      model_properties: model.model_properties,
      pricing: model.pricing
    })
  }
}

function modelSchema(row, modelType) {
  const name = row.name
  const llmSpec = modelType === 'llm' ? llmSpecs.get(name) : undefined
  if (modelType === 'llm' && !llmSpec) throw new Error(`Missing LLM specification: ${name}`)
  const base = {
    model: name,
    label: { en_US: name, zh_Hans: name },
    model_type: modelType,
    model_properties:
      modelType === 'llm'
        ? { mode: 'chat', context_size: llmSpec.context_size }
        : { context_size: modelType === 'rerank' ? rerankContextSizes[name] || 8192 : 8192 },
    parameter_rules: parameterRules(modelType, llmSpec)
  }
  const generated = modelType === 'llm' ? { ...base, features: llmFeatures(name) } : base
  const preserved = preservedModels.get(name)
  return {
    ...generated,
    ...(preserved?.model_properties
      ? {
          model_properties: { ...preserved.model_properties, ...generated.model_properties }
        }
      : {}),
    ...(preserved?.pricing !== undefined ? { pricing: preserved.pricing } : {})
  }
}

const activeRows = source.models.filter((row) => !row.name.includes('（即将下线）') && row.availability !== 'retired')
const unsupported = activeRows.filter((row) => !runtimeModelTypes.has(classify(row)) || row.runtime_supported === false)
const runtimeRows = activeRows.filter((row) => runtimeModelTypes.has(classify(row)) && row.runtime_supported !== false)
const counts = { llm: 0, 'text-embedding': 0, rerank: 0, image: 0, video: 0, 'speech-to-text': 0 }
const generated = []

for (const row of activeRows) {
  const modelType = classify(row)
  if (Object.prototype.hasOwnProperty.call(counts, modelType)) counts[modelType] += 1
}

for (const modelType of ['llm', 'text-embedding', 'rerank', 'image']) {
  const folder = join(srcRoot, modelType)
  mkdirSync(folder, { recursive: true })
  for (const file of readdirSync(folder)) {
    if (file.endsWith('.yaml') && file !== '_position.yaml') rmSync(join(folder, file))
  }
}

for (const [index, row] of runtimeRows.entries()) {
  const modelType = classify(row)
  const folder = join(srcRoot, modelType)
  mkdirSync(folder, { recursive: true })
  const preserved = preservedModels.get(row.name)
  const file = preserved?.model_type === modelType ? preserved.file : `${slug(row.name, index)}.yaml`
  writeFileSync(join(folder, file), stringify(modelSchema(row, modelType), { lineWidth: 0 }))
  generated.push({
    name: row.name,
    ...(row.model_id ? { model_id: row.model_id } : {}),
    model_type: modelType,
    ...(modelType === 'llm'
      ? {
          context_size: llmSpecs.get(row.name).context_size,
          max_output_tokens: llmSpecs.get(row.name).max_output_tokens,
          spec_source: llmSpecs.get(row.name).source
        }
      : {})
  })
}

for (const modelType of ['llm', 'text-embedding', 'rerank', 'image']) {
  const folder = join(srcRoot, modelType)
  const names = generated.filter((model) => model.model_type === modelType).map((model) => model.name)
  writeFileSync(join(folder, '_position.yaml'), stringify(names, { lineWidth: 0 }))
}

const normalized = {
  source: source.source,
  captured_at: capturedAt,
  generated_at: capturedAt,
  policy: {
    deprecated_marker: '（即将下线）',
    excluded_deprecated: source.models.filter((row) => row.name.includes('（即将下线）')).map((row) => row.name),
    excluded_retired: source.models.filter((row) => row.availability === 'retired').map((row) => row.name),
    unsupported_status: 'catalog-only-until-the-model-type-api-contract-is-implemented-and-verified',
    llm_specs_verified_at: llmSpecsSource.verified_at,
    llm_spec_sources: llmSpecsSource.sources
  },
  counts,
  active_models: generated,
  unsupported_models: unsupported.map((row) => ({
    name: row.name,
    model_type: classify(row),
    reason: row.unsupported_reason || 'model-type-not-implemented'
  })),
  unsupported_video_models: activeRows.filter((row) => classify(row) === 'video').map((row) => ({ name: row.name }))
}
mkdirSync(join(srcRoot, 'catalog'), { recursive: true })
writeFileSync(join(srcRoot, 'catalog', 'normalized.snapshot.json'), `${JSON.stringify(normalized, null, 2)}\n`)
console.log(
  `Generated ${generated.length} runtime models; ${unsupported.length} current catalog models remain audit-only.`
)
