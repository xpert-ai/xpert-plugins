import { normalizeString } from './rules.js'

const SEEDREAM_5_PRO_MODEL = 'doubao-seedream-5-0-pro-260628'
const SEEDREAM_5_PRO_MAX_STANDARD_PIXELS = 2_610_000

export function getSeedreamImagePricingDimensions(
  model: string,
  payload: Record<string, unknown>
): { resolution?: string; mode?: string } {
  const size = normalizeString(payload.size)
  if (model === SEEDREAM_5_PRO_MODEL) {
    const pixels = size?.match(/^(\d+)x(\d+)$/)
    return {
      ...(pixels
        ? {
            resolution:
              Number(pixels[1]) * Number(pixels[2]) > SEEDREAM_5_PRO_MAX_STANDARD_PIXELS
                ? 'gt-2.61mp'
                : 'le-2.61mp'
          }
        : {}),
      mode: 'standard'
    }
  }
  return {
    ...(size ? { resolution: size } : {}),
    ...(normalizeString(payload.sequential_image_generation)
      ? { mode: normalizeString(payload.sequential_image_generation) }
      : {})
  }
}
