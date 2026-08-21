import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const packageRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const srcRoot = join(packageRoot, 'src')
const sourcePath = join(srcRoot, 'catalog', 'source.snapshot.json')
const source = JSON.parse(readFileSync(sourcePath, 'utf8'))
const capturedAt = source.captured_at || new Date().toISOString()
const version = capturedAt.slice(0, 10)

// JSON is a valid YAML 1.2 document and keeps this catalog generator
// dependency-free when the plugin repository is checked out standalone.
const stringify = (value) => `${JSON.stringify(value, null, 2)}\n`

const imagePattern = /(seedream|qwen-image|wan2\.[67]-image)/i
const videoPattern = /(t2v|i2v|r2v|kf2v|video|seedance|animate-mix)/i
const embeddingPattern = /(embedding|bge-m3)/i
const rerankPattern = /(rerank|reranker|gte-rerank)/i

function classify(name) {
  if (imagePattern.test(name)) return 'image'
  if (videoPattern.test(name)) return 'video'
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

function exactPrice(display) {
  if (typeof display !== 'string' || !display.includes('/百万Tokens') || display.includes('~') || display.includes('标准时段') || display.includes('优惠时段')) return null
  const match = display.match(/¥\s*([0-9]+(?:\.[0-9]+)?)\/百万Tokens/i)
  return match ? Number(match[1]) : null
}

function timeTierPrices(display) {
  if (typeof display !== 'string' || display.includes('~')) return null
  const match = display.match(/标准时段\s*¥\s*([0-9]+(?:\.[0-9]+)?)\/百万Tokens\s*优惠时段\s*¥\s*([0-9]+(?:\.[0-9]+)?)\/百万Tokens/i)
  return match ? { standard: Number(match[1]), offpeak: Number(match[2]) } : null
}

function tokenUnit(unit) {
  return typeof unit === 'string' && /\/百万tokens/i.test(unit)
}

function tokenRule(component, unitPrice, range = {}) {
  return {
    component,
    unit_price: unitPrice,
    unit_size: 1_000_000,
    currency: 'CNY',
    ...range
  }
}

function segmentTokenRules(component, segments) {
  if (!Array.isArray(segments) || segments.length === 0) return []
  const rules = []
  for (const segment of segments) {
    if (!tokenUnit(segment.unit)) continue
    const range = {}
    if (segment.min_input_tokens != null) range.min_input_tokens = segment.min_input_tokens
    if (segment.max_input_tokens != null) range.max_input_tokens = segment.max_input_tokens
    if (segment.min_output_tokens != null) range.min_output_tokens = segment.min_output_tokens
    if (segment.max_output_tokens != null) range.max_output_tokens = segment.max_output_tokens
    if (typeof segment.unit_price === 'number') rules.push(tokenRule(component, segment.unit_price, range))
    else rules.push({ ...tokenRule(component, 0, range), mode: '__xirang_unpriced__' })
  }
  return rules
}

function tokenPriceRules(component, display, segments) {
  const segmentRules = segmentTokenRules(component, segments)
  if (segmentRules.length > 0) return segmentRules
  const exact = exactPrice(display)
  if (exact != null) {
    return [tokenRule(component, exact)]
  }
  const tiers = timeTierPrices(display)
  if (tiers) {
    return [
      {
        ...tokenRule(component, tiers.standard),
        daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '08:00', end_time: '24:00' }
      },
      {
        ...tokenRule(component, tiers.offpeak),
        daily_time_window: { time_zone: 'Asia/Shanghai', start_time: '00:00', end_time: '08:00' }
      }
    ]
  }
  // A deliberately non-matching rule makes the SDK report this component as
  // unpriced. It must not be represented as a free model.
  return [{ component, unit_price: 0, unit_size: 1_000_000, currency: 'CNY', mode: '__xirang_unpriced__' }]
}

function firstSegmentPrice(segments) {
  return Array.isArray(segments)
    ? segments.find((segment) => tokenUnit(segment.unit) && typeof segment.unit_price === 'number')?.unit_price
    : undefined
}

function tokenPricing(row) {
  const inputExact = exactPrice(row.input)
  const outputExact = exactPrice(row.output)
  const inputTier = timeTierPrices(row.input)
  const outputTier = timeTierPrices(row.output)
  const inputDisplayPrice = firstSegmentPrice(row.input_segments) ?? inputExact ?? inputTier?.standard ?? 0
  const outputDisplayPrice = firstSegmentPrice(row.output_segments) ?? outputExact ?? outputTier?.standard ?? 0
  const cacheReadRules = row.cache_hit_input
    ? tokenPriceRules('cache_read_input', row.cache_hit_input, row.cache_hit_input_segments)
    : []
  return {
    input: String(inputDisplayPrice),
    output: String(outputDisplayPrice),
    unit: '0.000001',
    currency: 'CNY',
    rules: [
      ...tokenPriceRules('input', row.input, row.input_segments),
      ...cacheReadRules,
      ...tokenPriceRules('output', row.output, row.output_segments)
    ]
  }
}

function exactGenerationPrice(display) {
  if (typeof display !== 'string') return null
  const match = display.match(/¥\s*([0-9]+(?:\.[0-9]+)?)\s*\/张/i)
  return match ? Number(match[1]) : null
}

function imagePricing(row) {
  const unitPrice = exactGenerationPrice(row.output)
  if (unitPrice != null) {
    return {
      type: 'usage',
      rules: [{
        id: 'image-generation',
        version,
        effective_from: `${version}T00:00:00+08:00`,
        unit: 'generation',
        unit_size: 1,
        unit_price: unitPrice,
        currency: 'CNY',
        charge_type: 'paid',
        component: 'output',
        operations: ['text_to_image', 'image_to_image', 'multi_image_to_image'],
        source_url: 'https://ctxirang.ctyun.cn/maas/inlineService'
      }]
    }
  }
  return { type: 'usage', rules: [] }
}

function llmFeatures(name) {
  const normalized = name.toLowerCase()
  const features = ['tool-call', 'multi-tool-call', 'stream-tool-call', 'structured-output']
  if (/(deepseek|reason|thinking|kimi-k2|glm-5|glm4\.6v|minimax-m2)/i.test(normalized)) features.push('agent-thought')
  if (/(vl|vision|omni|seed-1\.6-vision|glm4\.6v)/i.test(normalized)) features.push('vision')
  return [...new Set(features)]
}

function parameterRules(modelType) {
  if (modelType === 'llm') {
    return [
      { name: 'temperature', use_template: 'temperature', label: { zh_Hans: '温度', en_US: 'Temperature' }, default: 0.2, min: 0, max: 2 },
      { name: 'top_p', use_template: 'top_p', label: { zh_Hans: 'Top P', en_US: 'Top P' }, default: 1, min: 0, max: 1 },
      { name: 'max_tokens', use_template: 'max_tokens', label: { zh_Hans: '最大输出 Token', en_US: 'Max output tokens' }, default: 2048, min: 1, max: 32768 },
      { name: 'response_format', type: 'string', label: { zh_Hans: '回复格式', en_US: 'Response format' }, required: false, options: ['text', 'json_object'] },
      { name: 'enable_thinking', type: 'boolean', label: { zh_Hans: '思考模式', en_US: 'Thinking mode' }, required: false, default: false }
    ]
  }
  if (modelType === 'image') {
    return [
      { name: 'prompt', type: 'text', label: { zh_Hans: '提示词', en_US: 'Prompt' }, required: true },
      { name: 'size', type: 'string', label: { zh_Hans: '尺寸', en_US: 'Size' }, required: false, default: '2K' },
      { name: 'response_format', type: 'string', label: { zh_Hans: '响应格式', en_US: 'Response format' }, required: false, default: 'url', options: ['url', 'b64_json'] },
      { name: 'watermark', type: 'boolean', label: { zh_Hans: '水印', en_US: 'Watermark' }, required: false, default: true }
    ]
  }
  return []
}

function modelSchema(row, modelType) {
  const name = row.name
  const base = {
    model: name,
    label: { en_US: name, zh_Hans: name },
    model_type: modelType,
    model_properties: modelType === 'llm'
      ? { mode: 'chat', context_size: 32768 }
      : { context_size: 8192 },
    parameter_rules: parameterRules(modelType)
  }
  if (modelType === 'llm') {
    return { ...base, features: llmFeatures(name), pricing: tokenPricing(row) }
  }
  if (modelType === 'image') return { ...base, pricing: imagePricing(row) }
  return { ...base, pricing: tokenPricing(row) }
}

const activeRows = source.models.filter((row) => !row.name.includes('（即将下线）'))
const unsupported = activeRows.filter((row) => classify(row.name) === 'video')
const runtimeRows = activeRows.filter((row) => classify(row.name) !== 'video')
const counts = { llm: 0, 'text-embedding': 0, rerank: 0, image: 0, video: unsupported.length }
const generated = []

for (const modelType of ['llm', 'text-embedding', 'rerank', 'image']) {
  const folder = join(srcRoot, modelType)
  mkdirSync(folder, { recursive: true })
  for (const file of readdirSync(folder)) {
    if (file.endsWith('.yaml') && file !== '_position.yaml') rmSync(join(folder, file))
  }
}

for (const [index, row] of runtimeRows.entries()) {
  const modelType = classify(row.name)
  counts[modelType] += 1
  const folder = join(srcRoot, modelType)
  mkdirSync(folder, { recursive: true })
  const file = `${slug(row.name, index)}.yaml`
  writeFileSync(join(folder, file), stringify(modelSchema(row, modelType), { lineWidth: 0 }))
  generated.push({
    name: row.name,
    ...(row.model_id ? { model_id: row.model_id } : {}),
    model_type: modelType,
    source_input: row.input,
    source_output: row.output,
    ...(row.cache_hit_input ? { source_cache_hit_input: row.cache_hit_input } : {}),
    priced: modelType === 'image'
      ? imagePricing(row).rules.length > 0
      : tokenPriceRules('input', row.input, row.input_segments).some((rule) => rule.mode !== '__xirang_unpriced__') && tokenPriceRules('output', row.output, row.output_segments).some((rule) => rule.mode !== '__xirang_unpriced__')
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
    video_status: 'catalog-only-unsupported-until-api-contract-is-verified',
    price_policy: 'Exact prices, standard/off-peak prices, and tooltip token thresholds are billed. Ranges without a verifiable tooltip threshold and dashes remain unpriced.'
  },
  counts,
  active_models: generated,
  unsupported_video_models: unsupported.map((row) => ({ name: row.name, source_input: row.input, source_output: row.output }))
}
mkdirSync(join(srcRoot, 'catalog'), { recursive: true })
writeFileSync(join(srcRoot, 'catalog', 'normalized.snapshot.json'), `${JSON.stringify(normalized, null, 2)}\n`)
console.log(`Generated ${generated.length} runtime models (${counts.llm} LLM, ${counts['text-embedding']} embedding, ${counts.rerank} rerank, ${counts.image} image); ${unsupported.length} video models remain catalog-only.`)
