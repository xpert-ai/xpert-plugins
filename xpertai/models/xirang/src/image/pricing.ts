import type { XirangImageInput, XirangImageResponse } from '../types.js'

const SEEDREAM_5_PRO_MODEL = 'doubao-seedream-5.0-pro'
const SEEDREAM_5_PRO_MAX_STANDARD_PIXELS = 2_610_000

export function getXirangImagePricingDimensions(
  model: string,
  input: XirangImageInput,
  response?: XirangImageResponse
): { resolution?: string; mode?: string } {
  if (model !== SEEDREAM_5_PRO_MODEL) return {}
  const size = typeof input.size === 'string' ? input.size.trim().toLowerCase() : undefined
  const requestPixels = parsePixelCount(size)
  const responseSize =
    Array.isArray(response?.data) && typeof response.data[0]?.size === 'string' ? response.data[0].size : undefined
  const resolvedPixelCount = requestPixels ?? parsePixelCount(responseSize)
  const resolution =
    resolvedPixelCount !== undefined
      ? resolvedPixelCount > SEEDREAM_5_PRO_MAX_STANDARD_PIXELS
        ? 'gt-2.61mp'
        : 'le-2.61mp'
      : undefined
  return { ...(resolution ? { resolution } : {}), mode: 'standard' }
}

function parsePixelCount(size?: string): number | undefined {
  const pixels = size
    ?.trim()
    .toLowerCase()
    .match(/^(\d+)x(\d+)$/)
  return pixels ? Number(pixels[1]) * Number(pixels[2]) : undefined
}
