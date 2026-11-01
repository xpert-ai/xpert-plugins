// Image capability contracts shared by tool choices and payload validation.
export const SEEDREAM_MODEL_OPTIONS = [
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

export function validateImageSize(model: string, size: string) {
  const allModels = new Set<string>(SEEDREAM_MODEL_OPTIONS.map(([value]) => value))
  const modelGroups: Record<string, Set<string>> = {
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
  if (!allowedModels.has(model)) {
    throw new Error(`${size} is not supported by ${model}`)
  }
}
