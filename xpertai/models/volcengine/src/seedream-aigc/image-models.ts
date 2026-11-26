// Image capability contracts shared by tool choices and payload validation.
export const SEEDREAM_55_MODEL = 'doubao-seedream-5-5-261028'
export const SEEDREAM_MODEL_OPTIONS = [
  [SEEDREAM_55_MODEL, 'Seedream 5.5'],
  ['doubao-seedream-4-0-250828', 'Seedream4.0'],
  ['doubao-seedream-4-5-251128', 'Seedream4.5'],
  ['doubao-seedream-5-0-260128', 'Seedream5.0 Lite'],
  ['doubao-seedream-5-0-pro-260628', 'Seedream5.0 Pro'],
  ['doubao-seedream-5-0-flash-260915', 'Seedream5.0 Flash']
] as const

const SEEDREAM_IMAGE_CAPABILITIES: Record<
  string,
  { supportsSequential: boolean; supportsStream: boolean; supportsOutputFormat: boolean; maxInputImages: number }
> = {
  [SEEDREAM_55_MODEL]: {
    supportsSequential: false,
    supportsStream: false,
    supportsOutputFormat: true,
    maxInputImages: 10
  },
  'doubao-seedream-5-0-flash-260915': {
    supportsSequential: false,
    supportsStream: false,
    supportsOutputFormat: true,
    maxInputImages: 10
  },
  'doubao-seedream-5-0-pro-260628': {
    supportsSequential: false,
    supportsStream: false,
    supportsOutputFormat: true,
    maxInputImages: 10
  },
  'doubao-seedream-5-0-260128': {
    supportsSequential: true,
    supportsStream: true,
    supportsOutputFormat: true,
    maxInputImages: 14
  },
  'doubao-seedream-4-5-251128': {
    supportsSequential: true,
    supportsStream: true,
    supportsOutputFormat: false,
    maxInputImages: 14
  },
  'doubao-seedream-4-0-250828': {
    supportsSequential: true,
    supportsStream: true,
    supportsOutputFormat: false,
    maxInputImages: 14
  }
}

export function getSeedreamImageCapabilities(model: string) {
  return SEEDREAM_IMAGE_CAPABILITIES[model] ?? SEEDREAM_IMAGE_CAPABILITIES['doubao-seedream-4-5-251128']
}

export const IMAGE_SIZE_OPTIONS = [
  ['2048x2048', '1:1 (2048x2048)'],
  ['1K', 'Seedream 5.5 · 1K'],
  ['1.5K', 'Seedream 5.5 · 1.5K'],
  ['2K', 'Seedream 5.5 · 2K'],
  ['2880x1440', 'Seedream 5.5 · 2:1 (2880x1440)'],
  ['2304x1728', '4:3 (2304x1728)'],
  ['1728x2304', '3:4 (1728x2304)'],
  ['2848x1600', '16:9 (2848x1600)'],
  ['1600x2848', '9:16 (1600x2848)'],
  ['2496x1664', '3:2 (2496x1664)'],
  ['1664x2496', '2:3 (1664x2496)'],
  ['3136x1344', '21:9 (3136x1344)'],
  ['4096x4096', '1:1 (4096x4096)'],
  ['4704x3520', '4:3 (4704x3520)'],
  ['3520x4704', '3:4 (3520x4704)'],
  ['5504x3040', '16:9 (5504x3040)'],
  ['3040x5504', '9:16 (3040x5504)'],
  ['4992x3328', '3:2 (4992x3328)'],
  ['3328x4992', '2:3 (3328x4992)'],
  ['6240x2656', '21:9 (6240x2656)'],
  ['3072x3072', '5.0 Lite 3K · 1:1 (3072x3072)'],
  ['3456x2592', '5.0 Lite 3K · 4:3 (3456x2592)'],
  ['2592x3456', '5.0 Lite 3K · 3:4 (2592x3456)'],
  ['4096x2304', '5.0 Lite 3K · 16:9 (4096x2304)'],
  ['2304x4096', '5.0 Lite 3K · 9:16 (2304x4096)'],
  ['3744x2496', '5.0 Lite 3K · 3:2 (3744x2496)'],
  ['2496x3744', '5.0 Lite 3K · 2:3 (2496x3744)'],
  ['4704x2016', '5.0 Lite 3K · 21:9 (4704x2016)'],
  ['2368x1776', '5.0 Pro 2K · 4:3 (2368x1776)'],
  ['1776x2368', '5.0 Pro 2K · 3:4 (1776x2368)'],
  ['2816x1584', '5.0 Pro 2K · 16:9 (2816x1584)'],
  ['1584x2816', '5.0 Pro 2K · 9:16 (1584x2816)'],
  ['1024x1024', '5.0 Pro/4.0 1K · 1:1 (1024x1024)'],
  ['1152x864', '5.0 Pro/4.0 1K · 4:3 (1152x864)'],
  ['864x1152', '5.0 Pro/4.0 1K · 3:4 (864x1152)'],
  ['1424x800', '5.0 Pro 1K · 16:9 (1424x800)'],
  ['800x1424', '5.0 Pro 1K · 9:16 (800x1424)'],
  ['1568x672', '5.0 Pro 1K · 21:9 (1568x672)'],
  ['1280x720', '4.0 1K · 16:9 (1280x720)'],
  ['720x1280', '4.0 1K · 9:16 (720x1280)'],
  ['1512x648', '4.0 1K · 21:9 (1512x648)']
] as const

export function validateImageSize(model: string, size: string) {
  if (model === SEEDREAM_55_MODEL) {
    if (['1K', '1.5K', '2K'].includes(size)) return
    const match = /^(\d+)x(\d+)$/.exec(size)
    if (match) {
      const width = Number(match[1])
      const height = Number(match[2])
      const pixels = width * height
      if (pixels >= 921_600 && pixels <= 4_624_220 && width <= 16 * height && height <= 16 * width) return
    }
    throw new Error(`${size} is not supported by ${model}`)
  }
  const allModels = new Set<string>(SEEDREAM_MODEL_OPTIONS.map(([value]) => value))
  const modelGroups: Record<string, Set<string>> = {
    '1K': new Set([SEEDREAM_55_MODEL]),
    '1.5K': new Set([SEEDREAM_55_MODEL]),
    '2K': new Set([SEEDREAM_55_MODEL]),
    '2880x1440': new Set([SEEDREAM_55_MODEL]),
    '4096x4096': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '4704x3520': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3520x4704': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '5504x3040': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3040x5504': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '4992x3328': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3328x4992': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '6240x2656': new Set(['doubao-seedream-5-0-260128', 'doubao-seedream-4-5-251128', 'doubao-seedream-4-0-250828']),
    '3072x3072': new Set(['doubao-seedream-5-0-260128']),
    '3456x2592': new Set(['doubao-seedream-5-0-260128']),
    '2592x3456': new Set(['doubao-seedream-5-0-260128']),
    '4096x2304': new Set(['doubao-seedream-5-0-260128']),
    '2304x4096': new Set(['doubao-seedream-5-0-260128']),
    '3744x2496': new Set(['doubao-seedream-5-0-260128']),
    '2496x3744': new Set(['doubao-seedream-5-0-260128']),
    '4704x2016': new Set(['doubao-seedream-5-0-260128']),
    '2368x1776': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '1776x2368': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '2816x1584': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '1584x2816': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '1024x1024': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915', 'doubao-seedream-4-0-250828']),
    '1152x864': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915', 'doubao-seedream-4-0-250828']),
    '864x1152': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915', 'doubao-seedream-4-0-250828']),
    '1424x800': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '800x1424': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '1568x672': new Set(['doubao-seedream-5-0-pro-260628', 'doubao-seedream-5-0-flash-260915']),
    '1280x720': new Set(['doubao-seedream-4-0-250828']),
    '720x1280': new Set(['doubao-seedream-4-0-250828']),
    '1512x648': new Set(['doubao-seedream-4-0-250828'])
  }
  const allowedModels = modelGroups[size] ?? allModels
  if (!allowedModels.has(model) || !IMAGE_SIZE_OPTIONS.some(([preset]) => preset === size)) {
    throw new Error(`${size} is not supported by ${model}`)
  }
}
