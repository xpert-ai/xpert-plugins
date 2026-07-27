import sharp from 'sharp'

export type ImageReliefAnalysis = {
  algorithm: 'deterministic-luminance-heightfield-v1'
  sourceWidth: number
  sourceHeight: number
  columns: number
  rows: number
  modelWidth: number
  modelHeight: number
  modelDepth: number
  heights: number[]
  colors: string[]
  averageColor: string
  contrast: number
  confidence: number
}

const MAXIMUM_GRID_EDGE = 32
const MINIMUM_GRID_EDGE = 8

export async function analyzeImageRelief(
  buffer: Buffer,
  mimeType: string
): Promise<ImageReliefAnalysis> {
  if (!['image/png', 'image/jpeg', 'image/webp'].includes(mimeType)) {
    throw new Error('UNSUPPORTED_IMAGE_TYPE')
  }
  const metadata = await sharp(buffer, { failOn: 'error' }).metadata()
  const sourceWidth = metadata.width ?? 0
  const sourceHeight = metadata.height ?? 0
  if (sourceWidth < 1 || sourceHeight < 1) throw new Error('IMAGE_DIMENSIONS_REQUIRED')

  const { columns, rows } = gridDimensions(sourceWidth, sourceHeight)
  const { data, info } = await sharp(buffer, { failOn: 'error' })
    .rotate()
    .resize(columns, rows, { fit: 'fill', kernel: sharp.kernel.lanczos3 })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })

  if (info.width !== columns || info.height !== rows || info.channels !== 4) {
    throw new Error('IMAGE_ANALYSIS_INVALID')
  }

  const samples = Array.from({ length: columns * rows }, (_, index) => {
    const offset = index * info.channels
    const red = data[offset] ?? 0
    const green = data[offset + 1] ?? 0
    const blue = data[offset + 2] ?? 0
    const alpha = (data[offset + 3] ?? 255) / 255
    const luminance = srgbLuminance(red, green, blue)
    const saturation = colorSaturation(red, green, blue)
    return {
      red,
      green,
      blue,
      alpha,
      rawHeight: alpha * clamp((1 - luminance) * 0.78 + saturation * 0.22, 0, 1)
    }
  })

  const rawHeights = samples.map((sample) => sample.rawHeight)
  const minimum = Math.min(...rawHeights)
  const maximum = Math.max(...rawHeights)
  const spread = maximum - minimum
  const heights = rawHeights.map((value, index) => {
    const alpha = samples[index]?.alpha ?? 1
    if (alpha < 0.04) return 0
    const normalized = spread > 0.025 ? (value - minimum) / spread : value
    return round(clamp(0.06 + normalized * 0.94, 0, 1), 4)
  })
  const colors = samples.map(({ red, green, blue, alpha }) =>
    alpha < 0.04 ? '#111827' : rgbHex(red, green, blue)
  )
  const aspect = sourceWidth / sourceHeight
  const modelWidth = aspect >= 1 ? 2.6 : 2.6 * aspect
  const modelHeight = aspect >= 1 ? 2.6 / aspect : 2.6

  return {
    algorithm: 'deterministic-luminance-heightfield-v1',
    sourceWidth,
    sourceHeight,
    columns,
    rows,
    modelWidth: round(modelWidth, 4),
    modelHeight: round(modelHeight, 4),
    modelDepth: round(Math.max(0.18, Math.min(modelWidth, modelHeight) * 0.16), 4),
    heights,
    colors,
    averageColor: averageColor(samples),
    contrast: round(standardDeviation(rawHeights), 4),
    confidence: round(clamp(0.58 + Math.min(0.2, standardDeviation(rawHeights) * 1.8), 0.58, 0.78), 4)
  }
}

function gridDimensions(width: number, height: number): { columns: number; rows: number } {
  const aspect = width / height
  if (aspect >= 1) {
    return {
      columns: MAXIMUM_GRID_EDGE,
      rows: clampInteger(Math.round(MAXIMUM_GRID_EDGE / aspect), MINIMUM_GRID_EDGE, MAXIMUM_GRID_EDGE)
    }
  }
  return {
    columns: clampInteger(Math.round(MAXIMUM_GRID_EDGE * aspect), MINIMUM_GRID_EDGE, MAXIMUM_GRID_EDGE),
    rows: MAXIMUM_GRID_EDGE
  }
}

function srgbLuminance(red: number, green: number, blue: number): number {
  return (0.2126 * red + 0.7152 * green + 0.0722 * blue) / 255
}

function colorSaturation(red: number, green: number, blue: number): number {
  const maximum = Math.max(red, green, blue)
  const minimum = Math.min(red, green, blue)
  return maximum === 0 ? 0 : (maximum - minimum) / maximum
}

function averageColor(samples: Array<{ red: number; green: number; blue: number; alpha: number }>): string {
  const totals = samples.reduce(
    (result, sample) => ({
      red: result.red + sample.red * sample.alpha,
      green: result.green + sample.green * sample.alpha,
      blue: result.blue + sample.blue * sample.alpha,
      weight: result.weight + sample.alpha
    }),
    { red: 0, green: 0, blue: 0, weight: 0 }
  )
  const weight = Math.max(1, totals.weight)
  return rgbHex(totals.red / weight, totals.green / weight, totals.blue / weight)
}

function standardDeviation(values: number[]): number {
  if (values.length === 0) return 0
  const mean = values.reduce((sum, value) => sum + value, 0) / values.length
  const variance = values.reduce((sum, value) => sum + (value - mean) ** 2, 0) / values.length
  return Math.sqrt(variance)
}

function rgbHex(red: number, green: number, blue: number): string {
  return `#${[red, green, blue]
    .map((value) => clampInteger(Math.round(value), 0, 255).toString(16).padStart(2, '0'))
    .join('')}`
}

function round(value: number, places: number): number {
  const scale = 10 ** places
  return Math.round(value * scale) / scale
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value))
}

function clampInteger(value: number, minimum: number, maximum: number): number {
  return Math.round(clamp(value, minimum, maximum))
}
