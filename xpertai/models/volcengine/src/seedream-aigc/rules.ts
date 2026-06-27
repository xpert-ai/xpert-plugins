export const SEEDANCE_2_MODELS = new Set(['doubao-seedance-2-0-260128', 'doubao-seedance-2-0-fast-260128'])
export const MODEL_ALIASES: Record<string, string> = {
  'doubao-seedance-2-0-fast-250428': 'doubao-seedance-2-0-fast-260128'
}

export type VideoGenerationInput = {
  model?: string | null
  prompt?: string | null
  resolution?: string | null
  ratio?: string | null
  duration?: string | number | null
  seed?: string | number | null
  camera_fixed?: string | boolean | null
  watermark?: string | boolean | null
  generate_audio?: string | boolean | null
  draft?: string | boolean | null
  return_last_frame?: string | boolean | null
  service_tier?: string | null
}

export type NormalizedVideoGenerationOptions = {
  model: string
  prompt: string
  resolution: string
  ratio: string
  duration: number
  seed: number
  camera_fixed: boolean
  watermark: boolean
  generate_audio: boolean
  draft: boolean
  return_last_frame: boolean
  service_tier: string
  isSeedance2: boolean
  isSeedance15: boolean
}

export function normalizeVideoGenerationOptions(input: VideoGenerationInput): NormalizedVideoGenerationOptions {
  const model = MODEL_ALIASES[normalizeString(input.model) || ''] || normalizeString(input.model) || 'doubao-seedance-1-5-pro-251215'
  const isSeedance2 = isSeedance2Model(model)
  const isSeedance15 = model.includes('seedance-1-5')
  let prompt = normalizeString(input.prompt) || ''
  if (prompt.length > 500) {
    prompt = prompt.slice(0, 500)
  }

  let resolution = normalizeString(input.resolution) || '720p'
  if (isSeedance2 && resolution === '1080p') {
    resolution = '720p'
  }

  let duration = normalizeNumber(input.duration, 5)
  if (duration === -1 && !(isSeedance2 || isSeedance15)) {
    duration = 5
  } else if (duration !== -1) {
    const [minDuration, maxDuration] = getDurationRange(isSeedance2, isSeedance15)
    duration = clamp(duration, minDuration, maxDuration)
  }

  const seed = clamp(normalizeNumber(input.seed, -1), -1, 4294967295)
  let draft = normalizeBoolean(input.draft, false)
  const returnLastFrame = normalizeBoolean(input.return_last_frame, false)
  if (draft && !isSeedance15) {
    draft = false
  }
  if (draft && returnLastFrame) {
    return {
      model,
      prompt,
      resolution,
      ratio: normalizeString(input.ratio) || '16:9',
      duration,
      seed,
      camera_fixed: normalizeBoolean(input.camera_fixed, false),
      watermark: normalizeBoolean(input.watermark, true),
      generate_audio: normalizeBoolean(input.generate_audio, true),
      draft,
      return_last_frame: false,
      service_tier: normalizeServiceTier(input.service_tier, isSeedance2),
      isSeedance2,
      isSeedance15
    }
  }

  return {
    model,
    prompt,
    resolution,
    ratio: normalizeString(input.ratio) || '16:9',
    duration,
    seed,
    camera_fixed: normalizeBoolean(input.camera_fixed, false),
    watermark: normalizeBoolean(input.watermark, true),
    generate_audio: normalizeBoolean(input.generate_audio, true),
    draft,
    return_last_frame: returnLastFrame,
    service_tier: normalizeServiceTier(input.service_tier, isSeedance2),
    isSeedance2,
    isSeedance15
  }
}

export function isSeedance2Model(model: string) {
  const normalized = model.toLowerCase()
  return SEEDANCE_2_MODELS.has(normalized) || normalized.includes('seedance-2-0')
}

export function normalizeBoolean(value: string | boolean | null | undefined, fallback: boolean) {
  if (typeof value === 'boolean') {
    return value
  }
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  return fallback
}

export function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function normalizeNumber(value: unknown, fallback: number) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value)
    if (Number.isFinite(parsed)) return parsed
  }
  return fallback
}

function normalizeServiceTier(value: unknown, isSeedance2: boolean) {
  const serviceTier = normalizeString(value) || 'default'
  return isSeedance2 && serviceTier === 'flex' ? 'default' : serviceTier
}

function getDurationRange(isSeedance2: boolean, isSeedance15: boolean) {
  if (isSeedance2) return [4, 15] as const
  if (isSeedance15) return [4, 12] as const
  return [2, 12] as const
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
