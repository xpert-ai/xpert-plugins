import { createHash } from 'node:crypto'
import sharp from 'sharp'

export type AdmissionStatus = 'admitted' | 'request-input' | 'rejected'

export type ImageAdmissionDiagnostics = {
  algorithm: 'foreground-mask-v1'
  status: AdmissionStatus
  sourceWidth: number
  sourceHeight: number
  analysisWidth: number
  analysisHeight: number
  foregroundCoverage: number
  largestComponentFraction: number
  backgroundSeparability: number
  maskConfidence: number
  alphaCoverage: number
  pHash: string
  foregroundBounds: { x: number; y: number; width: number; height: number } | null
  failureCodes: string[]
}

export type ImageAdmissionOptions = {
  maximumBytes: number
  minimumShortSide?: number
  minimumCoverage?: number
  maximumCoverage?: number
  minimumComponentFraction?: number
  minimumConfidence?: number
}

type PixelSample = {
  red: number
  green: number
  blue: number
  alpha: number
}

type ComponentStats = {
  count: number
  minX: number
  minY: number
  maxX: number
  maxY: number
}

const SUPPORTED_MIME_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp'])
const DEFAULT_OPTIONS: Required<ImageAdmissionOptions> = {
  maximumBytes: 25_000_000,
  minimumShortSide: 256,
  minimumCoverage: 0.02,
  maximumCoverage: 0.92,
  minimumComponentFraction: 0.65,
  minimumConfidence: 0.55
}

export async function analyzeImageAdmission(
  buffer: Buffer,
  mimeType: string,
  inputOptions: ImageAdmissionOptions
): Promise<ImageAdmissionDiagnostics> {
  const options = { ...DEFAULT_OPTIONS, ...inputOptions }
  const basicFailureCodes: string[] = []
  if (!SUPPORTED_MIME_TYPES.has(mimeType)) basicFailureCodes.push('unsupported_image_type')
  if (buffer.length === 0) basicFailureCodes.push('empty_image')
  if (buffer.length > options.maximumBytes) basicFailureCodes.push('image_too_large')
  if (basicFailureCodes.length > 0) {
    return rejectedDiagnostics(basicFailureCodes)
  }

  let sourceWidth = 0
  let sourceHeight = 0
  try {
    const metadata = await sharp(buffer, { failOn: 'error' }).metadata()
    sourceWidth = metadata.width ?? 0
    sourceHeight = metadata.height ?? 0
    if (sourceWidth < 1 || sourceHeight < 1) throw new Error('IMAGE_DIMENSIONS_REQUIRED')
  } catch {
    return rejectedDiagnostics(['unreadable_image_dimensions'])
  }

  const analysisSize = analysisDimensions(sourceWidth, sourceHeight)
  let data: Buffer
  try {
    data = await sharp(buffer, { failOn: 'error' })
      .rotate()
      .resize(analysisSize.width, analysisSize.height, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
      .ensureAlpha()
      .raw()
      .toBuffer()
  } catch {
    return rejectedDiagnostics(['unreadable_image_pixels'], sourceWidth, sourceHeight, analysisSize)
  }

  const samples = readSamples(data)
  const alphaCoverage = samples.filter((sample) => sample.alpha >= 0.08).length / samples.length
  const borderColor = estimateBorderColor(samples, analysisSize.width, analysisSize.height)
  const distances = samples.map((sample) => colorDistance(sample, borderColor))
  const borderDistances = borderPixels(distances, analysisSize.width, analysisSize.height)
  const distanceThreshold = Math.max(18, mean(borderDistances) + standardDeviation(borderDistances) * 3 + 8)
  const hasUsefulAlpha = alphaCoverage > 0.005 && alphaCoverage < 0.995
  const mask = samples.map((sample, index) => hasUsefulAlpha
    ? sample.alpha >= 0.08
    : (distances[index] ?? 0) > distanceThreshold)
  const component = largestComponent(mask, analysisSize.width, analysisSize.height)
  const foregroundCoverage = component.count / mask.length
  const largestComponentFraction = mask.filter(Boolean).length > 0
    ? component.count / mask.filter(Boolean).length
    : 0
  const foregroundDistances = distances.filter((distance, index) => Boolean(mask[index]))
  const backgroundSeparability = foregroundDistances.length > 0
    ? clamp((mean(foregroundDistances) - mean(borderDistances)) / 128, 0, 1)
    : 0
  const resolutionScore = clamp(Math.min(sourceWidth, sourceHeight) / (options.minimumShortSide * 2), 0, 1)
  const coverageScore = coverageFit(foregroundCoverage, options.minimumCoverage, options.maximumCoverage)
  const componentScore = clamp(largestComponentFraction, 0, 1)
  const maskConfidence = round(
    clamp(coverageScore * 0.3 + componentScore * 0.35 + backgroundSeparability * 0.2 + resolutionScore * 0.15, 0, 1),
    4
  )
  const failureCodes: string[] = []
  if (Math.min(sourceWidth, sourceHeight) < options.minimumShortSide) failureCodes.push('image_short_side_too_small')
  if (foregroundCoverage < options.minimumCoverage) failureCodes.push('foreground_coverage_too_low')
  if (foregroundCoverage > options.maximumCoverage) failureCodes.push('foreground_coverage_too_high')
  if (largestComponentFraction < options.minimumComponentFraction) failureCodes.push('foreground_components_fragmented')
  if (maskConfidence < options.minimumConfidence) failureCodes.push('foreground_mask_low_confidence')

  const status: AdmissionStatus = failureCodes.includes('image_short_side_too_small')
    ? 'rejected'
    : failureCodes.length === 0
      ? 'admitted'
      : 'request-input'

  return {
    algorithm: 'foreground-mask-v1',
    status,
    sourceWidth,
    sourceHeight,
    analysisWidth: analysisSize.width,
    analysisHeight: analysisSize.height,
    foregroundCoverage: round(foregroundCoverage, 4),
    largestComponentFraction: round(largestComponentFraction, 4),
    backgroundSeparability: round(backgroundSeparability, 4),
    maskConfidence,
    alphaCoverage: round(alphaCoverage, 4),
    pHash: computePHash(samples, analysisSize.width, analysisSize.height),
    foregroundBounds: component.count > 0 ? normalizeBounds(component, analysisSize.width, analysisSize.height) : null,
    failureCodes
  }
}

export function pHashHammingDistance(left: string, right: string): number {
  if (!/^[0-9a-f]{16}$/i.test(left) || !/^[0-9a-f]{16}$/i.test(right)) return Number.POSITIVE_INFINITY
  let distance = 0
  for (let index = 0; index < left.length; index += 1) {
    const xor = Number.parseInt(left[index] ?? '0', 16) ^ Number.parseInt(right[index] ?? '0', 16)
    distance += bitCount(xor)
  }
  return distance
}

export function isNearDuplicate(left: string, right: string, maximumDistance = 8): boolean {
  return pHashHammingDistance(left, right) <= maximumDistance
}

export function admissionFailureSummary(diagnostics: ImageAdmissionDiagnostics): string {
  if (diagnostics.failureCodes.length === 0) return 'Foreground mask, resolution and background separation passed.'
  return diagnostics.failureCodes.join(', ')
}

function analysisDimensions(width: number, height: number): { width: number; height: number } {
  const maximumEdge = 256
  const scale = Math.min(1, maximumEdge / Math.max(width, height))
  return {
    width: Math.max(16, Math.round(width * scale)),
    height: Math.max(16, Math.round(height * scale))
  }
}

function readSamples(data: Buffer): PixelSample[] {
  const samples: PixelSample[] = []
  for (let offset = 0; offset + 3 < data.length; offset += 4) {
    samples.push({
      red: data[offset] ?? 0,
      green: data[offset + 1] ?? 0,
      blue: data[offset + 2] ?? 0,
      alpha: (data[offset + 3] ?? 255) / 255
    })
  }
  return samples
}

function estimateBorderColor(samples: PixelSample[], width: number, height: number): PixelSample {
  const border = borderPixelsFromSamples(samples, width, height)
  const count = Math.max(1, border.length)
  return {
    red: border.reduce((sum, sample) => sum + sample.red, 0) / count,
    green: border.reduce((sum, sample) => sum + sample.green, 0) / count,
    blue: border.reduce((sum, sample) => sum + sample.blue, 0) / count,
    alpha: border.reduce((sum, sample) => sum + sample.alpha, 0) / count
  }
}

function borderPixelsFromSamples(samples: PixelSample[], width: number, height: number): PixelSample[] {
  const result: PixelSample[] = []
  const borderWidth = Math.max(1, Math.round(Math.min(width, height) * 0.05))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < borderWidth || y < borderWidth || x >= width - borderWidth || y >= height - borderWidth) {
        const sample = samples[y * width + x]
        if (sample) result.push(sample)
      }
    }
  }
  return result
}

function borderPixels(values: number[], width: number, height: number): number[] {
  const result: number[] = []
  const borderWidth = Math.max(1, Math.round(Math.min(width, height) * 0.05))
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (x < borderWidth || y < borderWidth || x >= width - borderWidth || y >= height - borderWidth) {
        const value = values[y * width + x]
        if (value !== undefined) result.push(value)
      }
    }
  }
  return result
}

function colorDistance(sample: PixelSample, background: PixelSample): number {
  return Math.sqrt(
    (sample.red - background.red) ** 2 +
    (sample.green - background.green) ** 2 +
    (sample.blue - background.blue) ** 2
  )
}

function largestComponent(mask: boolean[], width: number, height: number): ComponentStats {
  const visited = new Uint8Array(mask.length)
  let largest: ComponentStats = { count: 0, minX: 0, minY: 0, maxX: 0, maxY: 0 }
  const queue: number[] = []
  for (let index = 0; index < mask.length; index += 1) {
    if (!mask[index] || visited[index] === 1) continue
    visited[index] = 1
    queue.push(index)
    let count = 0
    let minX = width
    let minY = height
    let maxX = -1
    let maxY = -1
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor] ?? 0
      const x = current % width
      const y = Math.floor(current / width)
      count += 1
      minX = Math.min(minX, x)
      minY = Math.min(minY, y)
      maxX = Math.max(maxX, x)
      maxY = Math.max(maxY, y)
      for (const neighbor of [current - 1, current + 1, current - width, current + width]) {
        if (neighbor < 0 || neighbor >= mask.length || visited[neighbor] === 1) continue
        const neighborX = neighbor % width
        if (Math.abs(neighborX - x) > 1 || !mask[neighbor]) continue
        visited[neighbor] = 1
        queue.push(neighbor)
      }
    }
    if (count > largest.count) largest = { count, minX, minY, maxX, maxY }
    queue.length = 0
  }
  return largest
}

function normalizeBounds(bounds: ComponentStats, width: number, height: number): ImageAdmissionDiagnostics['foregroundBounds'] {
  return {
    x: round(bounds.minX / width, 4),
    y: round(bounds.minY / height, 4),
    width: round((bounds.maxX - bounds.minX + 1) / width, 4),
    height: round((bounds.maxY - bounds.minY + 1) / height, 4)
  }
}

function computePHash(samples: PixelSample[], width: number, height: number): string {
  const values = samples.map((sample) => (0.2126 * sample.red + 0.7152 * sample.green + 0.0722 * sample.blue) / 255)
  const coefficients: number[] = []
  for (let u = 0; u < 8; u += 1) {
    for (let v = 0; v < 8; v += 1) {
      let sum = 0
      for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
          sum += (values[y * width + x] ?? 0) *
            Math.cos(((2 * x + 1) * u * Math.PI) / (2 * width)) *
            Math.cos(((2 * y + 1) * v * Math.PI) / (2 * height))
        }
      }
      coefficients.push(sum)
    }
  }
  const body = coefficients.slice(1)
  const sorted = [...body].sort((left, right) => left - right)
  const median = sorted[Math.floor(sorted.length / 2)] ?? 0
  let hash = ''
  for (let index = 0; index < 64; index += 1) {
    if (index % 4 === 0) hash += Number.parseInt(body.slice(index, index + 4).map((value) => value > median ? '1' : '0').join(''), 2).toString(16)
  }
  return hash.padStart(16, '0')
}

function coverageFit(coverage: number, minimum: number, maximum: number): number {
  if (coverage >= minimum && coverage <= maximum) return 1
  if (coverage < minimum) return clamp(coverage / Math.max(minimum, 0.0001), 0, 1)
  return clamp((1 - coverage) / Math.max(1 - maximum, 0.0001), 0, 1)
}

function rejectedDiagnostics(failureCodes: string[], sourceWidth = 0, sourceHeight = 0, analysis = { width: 0, height: 0 }): ImageAdmissionDiagnostics {
  return {
    algorithm: 'foreground-mask-v1',
    status: 'rejected',
    sourceWidth,
    sourceHeight,
    analysisWidth: analysis.width,
    analysisHeight: analysis.height,
    foregroundCoverage: 0,
    largestComponentFraction: 0,
    backgroundSeparability: 0,
    maskConfidence: 0,
    alphaCoverage: 0,
    pHash: createHash('sha256').update('rejected').digest('hex').slice(0, 16),
    foregroundBounds: null,
    failureCodes
  }
}

function mean(values: number[]): number {
  return values.length > 0 ? values.reduce((sum, value) => sum + value, 0) / values.length : 0
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const average = mean(values)
  return Math.sqrt(values.reduce((sum, value) => sum + (value - average) ** 2, 0) / values.length)
}

function bitCount(value: number): number {
  let count = 0
  let remaining = value
  while (remaining > 0) {
    count += remaining & 1
    remaining >>>= 1
  }
  return count
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function round(value: number, places: number): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}
