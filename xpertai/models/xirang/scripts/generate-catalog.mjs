import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const srcRoot = join(packageRoot, 'src')
const sourcePath = join(srcRoot, 'catalog', 'source.snapshot.json')
const llmSpecsPath = join(srcRoot, 'catalog', 'llm-specs.json')
const modelMetadataPath = join(srcRoot, 'catalog', 'model-metadata.json')
const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
const llmSpecsSource = JSON.parse(readFileSync(llmSpecsPath, 'utf8'))
const modelMetadataSource = JSON.parse(readFileSync(modelMetadataPath, 'utf8'))
const capturedAt = source.captured_at || new Date().toISOString()
const sourceModelNames = new Set(source.models.map((row) => row.name))

// JSON is a valid YAML 1.2 document and keeps this catalog generator
// dependency-free when the plugin repository is checked out standalone.
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`

const runtimeModelTypes = new Set(['llm', 'text-embedding', 'rerank', 'image'])
const catalogModelTypes = new Set([...runtimeModelTypes, 'multimodal-embedding', 'video', 'speech2text'])
const featureOrder = [
  'tool-call',
  'multi-tool-call',
  'stream-tool-call',
  'structured-output',
  'agent-thought',
  'vision',
  'video',
  'document'
]
const supportedFeatures = new Set(featureOrder)
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
      source: group.source,
      features: []
    })
  }
}

const explicitModelTypes = new Map()
for (const [modelType, models] of Object.entries(modelMetadataSource.model_types)) {
  if (!catalogModelTypes.has(modelType) || modelType === 'llm') throw new Error(`Unsupported model type: ${modelType}`)
  for (const model of models) {
    if (!sourceModelNames.has(model)) throw new Error(`Model type references unknown catalog model: ${model}`)
    if (explicitModelTypes.has(model)) throw new Error(`Duplicate explicit model type: ${model}`)
    explicitModelTypes.set(model, modelType)
  }
}

const explicitFeatureModels = new Set()
for (const profile of modelMetadataSource.llm_feature_profiles) {
  if (!Object.prototype.hasOwnProperty.call(modelMetadataSource.sources, profile.source)) {
    throw new Error(`Feature profile references unknown source: ${profile.source}`)
  }
  for (const feature of profile.features) {
    if (!supportedFeatures.has(feature)) throw new Error(`Unsupported LLM feature: ${feature}`)
  }
  for (const model of profile.models) {
    const specification = llmSpecs.get(model)
    if (!specification) throw new Error(`Feature profile references unknown LLM: ${model}`)
    if (explicitFeatureModels.has(model)) throw new Error(`Duplicate LLM feature profile: ${model}`)
    explicitFeatureModels.add(model)
    specification.features = featureOrder.filter((feature) => profile.features.includes(feature))
  }
}

const missingFeatureProfiles = [...llmSpecs.keys()].filter((model) => !explicitFeatureModels.has(model))
if (missingFeatureProfiles.length > 0) {
  throw new Error(`Missing LLM feature profile: ${missingFeatureProfiles.join(', ')}`)
}

function classify(row) {
  if (llmSpecs.has(row.name)) return 'llm'
  const modelType = explicitModelTypes.get(row.name)
  if (!modelType) throw new Error(`Missing explicit model type: ${row.name}`)
  return modelType
}

function slug(name, index) {
  const value = name
    .normalize('NFKD')
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return `${String(index).padStart(3, '0')}-${value || 'model'}`
}

function parameterRules(modelType, llmSpec) {
  if (modelType === 'llm') {
    const rules = [
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
      }
    ]
    if (llmSpec.features.includes('structured-output')) {
      rules.push({
        name: 'response_format',
        type: 'string',
        label: { zh_Hans: '回复格式', en_US: 'Response format' },
        required: false,
        options: ['text', 'json_object']
      })
    }
    if (llmSpec.features.includes('agent-thought')) {
      rules.push({
        name: 'enable_thinking',
        type: 'boolean',
        label: { zh_Hans: '思考模式', en_US: 'Thinking mode' },
        required: false,
        default: false
      })
    }
    return rules
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

function runtimePricing(pricing, modelType) {
  if (pricing === undefined || modelType !== 'image' || !Array.isArray(pricing.rules)) return pricing
  const rules = pricing.rules
    .map((rule) =>
      Array.isArray(rule.operations)
        ? { ...rule, operations: rule.operations.filter((operation) => operation === 'text_to_image') }
        : rule
    )
    .filter((rule) => !Array.isArray(rule.operations) || rule.operations.length > 0)
  return {
    ...pricing,
    rules
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
    ...(row.model_id ? { modelConfig: { endpoint_model_name: row.model_id } } : {}),
    model_properties:
      modelType === 'llm'
        ? { mode: 'chat', context_size: llmSpec.context_size }
        : modelType === 'image'
          ? { mode: 'image' }
          : { context_size: modelType === 'rerank' ? rerankContextSizes[name] || 8192 : 8192 },
    parameter_rules: parameterRules(modelType, llmSpec)
  }
  const generated = modelType === 'llm' ? { ...base, features: llmSpec.features } : base
  const preserved = preservedModels.get(name)
  return {
    ...generated,
    ...(preserved?.model_properties && modelType !== 'image'
      ? {
          model_properties: { ...preserved.model_properties, ...generated.model_properties }
        }
      : {}),
    ...(preserved?.pricing !== undefined ? { pricing: runtimePricing(preserved.pricing, modelType) } : {})
  }
}

const activeRows = source.models.filter((row) => !row.name.includes('（即将下线）') && row.availability !== 'retired')
const unsupported = activeRows.filter((row) => !runtimeModelTypes.has(classify(row)) || row.runtime_supported === false)
const runtimeRows = activeRows.filter((row) => runtimeModelTypes.has(classify(row)) && row.runtime_supported !== false)
const counts = {
  llm: 0,
  'text-embedding': 0,
  'multimodal-embedding': 0,
  rerank: 0,
  image: 0,
  video: 0,
  speech2text: 0
}
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
    llm_spec_sources: llmSpecsSource.sources,
    model_metadata_verified_at: modelMetadataSource.verified_at,
    model_metadata_sources: modelMetadataSource.sources,
    unknown_capabilities: 'not-declared-until-explicitly-verified'
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
