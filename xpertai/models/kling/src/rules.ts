export const KLING_MODELS = ['kling-v3', 'kling-v3-omni', 'kling-3.0-turbo'] as const
export type KlingModel = (typeof KLING_MODELS)[number]
export type KlingMode = 'text_to_video' | 'image_to_video' | 'first_last_frame_to_video' | 'reference_to_video'

const MODEL_MODES: Record<KlingModel, readonly KlingMode[]> = {
  'kling-v3': ['text_to_video', 'image_to_video', 'first_last_frame_to_video'],
  'kling-v3-omni': ['text_to_video', 'image_to_video', 'first_last_frame_to_video', 'reference_to_video'],
  'kling-3.0-turbo': ['text_to_video', 'image_to_video']
}

export type KlingVideoOptions = {
  model: KlingModel
  prompt: string
  resolution: '720p' | '1080p' | '4k'
  ratio: '16:9' | '9:16' | '1:1'
  duration: number
  generateAudio: boolean
  multiShot: boolean
  watermark: boolean
}

export function normalizeVideoOptions(input: Record<string, unknown>, mode: KlingMode): KlingVideoOptions {
  const model = (normalizeString(input.model) ?? 'kling-v3') as KlingModel
  if (!KLING_MODELS.includes(model)) throw new Error('Unsupported Kling model')
  if (!MODEL_MODES[model].includes(mode)) throw new Error(`${model} does not support ${mode}`)

  const prompt = normalizeString(input.prompt)
  if (!prompt) throw new Error('Prompt is required')
  const promptLimit = model === 'kling-3.0-turbo' ? 2500 : 3072
  if (prompt.length > promptLimit) throw new Error(`Prompt exceeds the ${promptLimit} character limit for ${model}`)

  const resolution = (normalizeString(input.resolution) ?? '720p') as KlingVideoOptions['resolution']
  const resolutions = model === 'kling-3.0-turbo' ? ['720p', '1080p'] : ['720p', '1080p', '4k']
  if (!resolutions.includes(resolution)) throw new Error(`${model} does not support ${resolution} output`)

  const ratio = (normalizeString(input.ratio) ?? '16:9') as KlingVideoOptions['ratio']
  if (!['16:9', '9:16', '1:1'].includes(ratio)) throw new Error('Unsupported aspect ratio')

  const duration = normalizeInteger(input.duration, 5)
  if (duration < 3 || duration > 15) throw new Error('Duration must be an integer from 3 to 15 seconds')

  const generateAudio = normalizeBoolean(input.generate_audio, false)
  const multiShot = normalizeBoolean(input.multi_shot, false)
  if (model === 'kling-3.0-turbo' && generateAudio) throw new Error('kling-3.0-turbo does not support native audio')
  if (model === 'kling-3.0-turbo' && multiShot) throw new Error('kling-3.0-turbo does not support multi-shot generation')

  return {
    model,
    prompt,
    resolution,
    ratio,
    duration,
    generateAudio,
    multiShot,
    watermark: normalizeBoolean(input.watermark, false)
  }
}

export function normalizeBoolean(value: unknown, fallback: boolean) {
  if (value === undefined || value === null || value === '') return fallback
  if (value === true || value === 'true') return true
  if (value === false || value === 'false') return false
  throw new Error('Boolean option must be true or false')
}

export function normalizeInteger(value: unknown, fallback: number) {
  if (value === undefined || value === null || value === '') return fallback
  const parsed = typeof value === 'number' ? value : Number(value)
  if (!Number.isInteger(parsed)) throw new Error('Numeric option must be an integer')
  return parsed
}

export function normalizeString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

export function createSettings(options: KlingVideoOptions, includeAspectRatio: boolean) {
  const settings: Record<string, unknown> = {
    resolution: options.resolution,
    duration: options.duration
  }
  if (includeAspectRatio) settings.aspect_ratio = options.ratio
  if (options.model !== 'kling-3.0-turbo') {
    settings.audio = options.generateAudio ? 'native' : 'off'
    settings.multi_shot = options.multiShot
  }
  return settings
}

export function createOptions(options: KlingVideoOptions) {
  return { watermark_info: { enabled: options.watermark } }
}
