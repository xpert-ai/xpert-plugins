import { VeoModels, type VeoModel } from './types.js'

export type VeoGenerationMode =
  | 'text_to_video'
  | 'image_to_video'
  | 'first_last_frame_to_video'
  | 'reference_to_video'

export type VeoSubmissionOptions = {
  model: VeoModel
  prompt: string
  durationSeconds: 4 | 6 | 8
  resolution: '720p' | '1080p' | '4k'
  aspectRatio: '16:9' | '9:16'
  personGeneration: 'allow_all' | 'allow_adult'
}

export function normalizeSubmissionOptions(
  input: Record<string, unknown>,
  mode: VeoGenerationMode
): VeoSubmissionOptions {
  const prompt = requireString(input.prompt, 'Prompt is required')
  if ([...prompt].length > 1024) {
    throw new Error('Veo prompt must not exceed 1,024 characters')
  }

  const model = normalizeModel(input.model)
  const durationSeconds = normalizeDuration(input.duration)
  const resolution = normalizeResolution(input.resolution)
  const aspectRatio = normalizeAspectRatio(input.ratio)

  if (mode === 'reference_to_video' && durationSeconds !== 8) {
    throw new Error('Veo asset-reference generation requires an 8-second duration')
  }
  if (resolution !== '720p' && durationSeconds !== 8) {
    throw new Error('Veo 1080p and 4k generation requires an 8-second duration')
  }
  if (input.generate_audio !== undefined && !normalizeBoolean(input.generate_audio)) {
    throw new Error('Veo 3.1 always generates audio and audio cannot be disabled')
  }

  return {
    model,
    prompt,
    durationSeconds,
    resolution,
    aspectRatio,
    personGeneration:
      mode === 'text_to_video' ? 'allow_all' : 'allow_adult'
  }
}

export function assertInlineRequestLimit(payload: Record<string, unknown>) {
  const requestBytes = Buffer.byteLength(JSON.stringify(payload), 'utf8')
  if (requestBytes > 20 * 1024 * 1024) {
    throw new Error('Veo inline request exceeds the Gemini API 20MB limit')
  }
}

export function requireReferenceImages(value: unknown) {
  const images = Array.isArray(value) ? value : []
  if (images.length < 1 || images.length > 3) {
    throw new Error('Veo requires between 1 and 3 asset reference images')
  }
  return images
}

export function normalizeBoolean(value: unknown) {
  if (typeof value === 'boolean') return value
  if (typeof value === 'string') {
    const normalized = value.trim().toLowerCase()
    if (normalized === 'true') return true
    if (normalized === 'false') return false
  }
  throw new Error('Expected a boolean value')
}

export function requireString(value: unknown, message: string) {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(message)
  }
  return value.trim()
}

function normalizeModel(value: unknown): VeoModel {
  const model =
    typeof value === 'string' && value.trim()
      ? value.trim()
      : 'veo-3.1-generate-preview'
  if (!VeoModels.includes(model as VeoModel)) {
    throw new Error('Unsupported Veo model')
  }
  return model as VeoModel
}

function normalizeDuration(value: unknown): 4 | 6 | 8 {
  const duration = value === undefined ? 8 : Number(value)
  if (![4, 6, 8].includes(duration)) {
    throw new Error('Veo duration must be 4, 6, or 8 seconds')
  }
  return duration as 4 | 6 | 8
}

function normalizeResolution(value: unknown): '720p' | '1080p' | '4k' {
  const resolution =
    typeof value === 'string' && value.trim() ? value.trim() : '720p'
  if (!['720p', '1080p', '4k'].includes(resolution)) {
    throw new Error('Veo resolution must be 720p, 1080p, or 4k')
  }
  return resolution as '720p' | '1080p' | '4k'
}

function normalizeAspectRatio(value: unknown): '16:9' | '9:16' {
  const ratio = typeof value === 'string' && value.trim() ? value.trim() : '16:9'
  if (!['16:9', '9:16'].includes(ratio)) {
    throw new Error('Veo aspect ratio must be 16:9 or 9:16')
  }
  return ratio as '16:9' | '9:16'
}
