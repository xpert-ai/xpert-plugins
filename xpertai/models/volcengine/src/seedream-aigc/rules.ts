export const SEEDANCE_2_MODELS = new Set([
  'doubao-seedance-2-5-260628',
  'doubao-seedance-2-0-260128',
  'doubao-seedance-2-0-fast-260128',
  'doubao-seedance-2-0-mini-260615'
])

export const MODEL_ALIASES: Record<string, string> = {
  'doubao-seedance-2-0-fast-250428': 'doubao-seedance-2-0-fast-260128'
}

type VideoModelCapabilities = {
  family: '2.5' | '2.0' | '1.5' | '1.0'
  resolutions: readonly string[]
  defaultResolution: string
  durationRange: readonly [number, number]
  supportsDurationAuto: boolean
  supportsCameraFixed: boolean
  supportsServiceTier: boolean
  supportsBitrateMode: boolean
  supportsOutputFormat: boolean
  supportsPriority: boolean
  supportsWebSearch: boolean
  supportsGenerateAudio: boolean
  supportsDraft: boolean
  supportsAudioOnly: boolean
  maxReferenceImages: number
  maxReferenceVideos: number
  maxReferenceAudios: number
}

const VIDEO_MODEL_CAPABILITIES: Record<VideoModelCapabilities['family'], VideoModelCapabilities> = {
  '2.5': {
    family: '2.5',
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    durationRange: [4, 30],
    supportsDurationAuto: true,
    supportsCameraFixed: false,
    supportsServiceTier: false,
    supportsBitrateMode: false,
    supportsOutputFormat: true,
    supportsPriority: true,
    supportsWebSearch: true,
    supportsGenerateAudio: true,
    supportsDraft: false,
    supportsAudioOnly: true,
    maxReferenceImages: 30,
    maxReferenceVideos: 10,
    maxReferenceAudios: 10
  },
  '2.0': {
    family: '2.0',
    resolutions: ['480p', '720p'],
    defaultResolution: '720p',
    durationRange: [4, 15],
    supportsDurationAuto: true,
    supportsCameraFixed: false,
    supportsServiceTier: false,
    supportsBitrateMode: true,
    supportsOutputFormat: false,
    supportsPriority: true,
    supportsWebSearch: true,
    supportsGenerateAudio: true,
    supportsDraft: false,
    supportsAudioOnly: false,
    maxReferenceImages: 9,
    maxReferenceVideos: 3,
    maxReferenceAudios: 3
  },
  '1.5': {
    family: '1.5',
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '720p',
    durationRange: [4, 12],
    supportsDurationAuto: true,
    supportsCameraFixed: true,
    supportsServiceTier: true,
    supportsBitrateMode: false,
    supportsOutputFormat: false,
    supportsPriority: false,
    supportsWebSearch: false,
    supportsGenerateAudio: true,
    supportsDraft: true,
    supportsAudioOnly: false,
    maxReferenceImages: 1,
    maxReferenceVideos: 0,
    maxReferenceAudios: 0
  },
  '1.0': {
    family: '1.0',
    resolutions: ['480p', '720p', '1080p'],
    defaultResolution: '1080p',
    durationRange: [2, 12],
    supportsDurationAuto: false,
    supportsCameraFixed: true,
    supportsServiceTier: true,
    supportsBitrateMode: false,
    supportsOutputFormat: false,
    supportsPriority: false,
    supportsWebSearch: false,
    supportsGenerateAudio: false,
    supportsDraft: false,
    supportsAudioOnly: false,
    maxReferenceImages: 1,
    maxReferenceVideos: 0,
    maxReferenceAudios: 0
  }
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
  bitrate_mode?: string | null
  output_format?: string | null
  priority?: string | number | null
  web_search?: string | boolean | null
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
  bitrate_mode: string
  output_format: string
  priority: number
  web_search: boolean
  isSeedance2: boolean
  isSeedance25: boolean
  isSeedance15: boolean
  capabilities: VideoModelCapabilities
}

export function normalizeVideoGenerationOptions(input: VideoGenerationInput): NormalizedVideoGenerationOptions {
  const requestedModel = normalizeString(input.model) || 'doubao-seedance-1-5-pro-251215'
  const model = MODEL_ALIASES[requestedModel] || requestedModel
  const capabilities = getVideoModelCapabilities(model)
  const isSeedance25 = capabilities.family === '2.5'
  const isSeedance2 = isSeedance2Model(model)
  const isSeedance15 = capabilities.family === '1.5'
  let prompt = normalizeString(input.prompt) || ''
  if (prompt.length > 500) {
    prompt = prompt.slice(0, 500)
  }

  const requestedResolution = normalizeString(input.resolution) || capabilities.defaultResolution
  const resolution = capabilities.resolutions.includes(requestedResolution)
    ? requestedResolution
    : capabilities.defaultResolution

  let duration = normalizeNumber(input.duration, 5)
  if (duration === -1) {
    duration = capabilities.supportsDurationAuto ? -1 : 5
  } else {
    duration = clamp(duration, capabilities.durationRange[0], capabilities.durationRange[1])
  }

  const seed = clamp(normalizeNumber(input.seed, -1), -1, 4294967295)
  const draft = normalizeBoolean(input.draft, false) && capabilities.supportsDraft
  const returnLastFrame = normalizeBoolean(input.return_last_frame, false)

  return {
    model,
    prompt,
    resolution,
    ratio: normalizeString(input.ratio) || '16:9',
    duration,
    seed,
    camera_fixed: normalizeBoolean(input.camera_fixed, false),
    watermark: normalizeBoolean(input.watermark, true),
    generate_audio: capabilities.supportsGenerateAudio && normalizeBoolean(input.generate_audio, true),
    draft,
    return_last_frame: draft && returnLastFrame ? false : returnLastFrame,
    service_tier: capabilities.supportsServiceTier ? normalizeServiceTier(input.service_tier) : 'default',
    bitrate_mode: normalizeEnum(input.bitrate_mode, ['standard', 'high'], 'standard'),
    output_format: normalizeEnum(input.output_format, ['mp4', 'mov'], 'mp4'),
    priority: clamp(normalizeNumber(input.priority, 0), 0, 9),
    web_search: normalizeBoolean(input.web_search, false),
    isSeedance2,
    isSeedance25,
    isSeedance15,
    capabilities
  }
}

export function getVideoModelCapabilities(model: string): VideoModelCapabilities {
  const normalized = model.toLowerCase()
  if (normalized.includes('seedance-2-5')) return VIDEO_MODEL_CAPABILITIES['2.5']
  if (normalized.includes('seedance-2-0')) return VIDEO_MODEL_CAPABILITIES['2.0']
  if (normalized.includes('seedance-1-5-pro')) return VIDEO_MODEL_CAPABILITIES['1.5']
  return VIDEO_MODEL_CAPABILITIES['1.0']
}

export function isSeedance2Model(model: string) {
  const normalized = model.toLowerCase()
  return SEEDANCE_2_MODELS.has(normalized) || normalized.includes('seedance-2-5') || normalized.includes('seedance-2-0')
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

function normalizeServiceTier(value: unknown) {
  return normalizeEnum(value, ['default', 'flex'], 'default')
}

function normalizeEnum(value: unknown, options: readonly string[], fallback: string) {
  const normalized = normalizeString(value)
  return normalized && options.includes(normalized) ? normalized : fallback
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}
