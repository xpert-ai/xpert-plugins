import type { BaiduOcrIntegrationOptions, BaiduOcrServerType, BaiduPaddleOptions, BaiduParserEngine } from './types.js'

export function baiduOcrServerType(options: BaiduOcrIntegrationOptions): BaiduOcrServerType {
  const type = options.serverType ?? 'official'
  if (type !== 'official' && type !== 'self-hosted') throw new Error('Unsupported Baidu OCR service type')
  return type
}

// Existing document and workflow overrides retain their meaning. New configurations use the integration defaults.
export function resolveBaiduParseOptions(
  legacy: BaiduPaddleOptions,
  integration: BaiduOcrIntegrationOptions
): Required<BaiduPaddleOptions> {
  const options = {
    analysisChart: legacy.analysisChart ?? integration.analysisChart ?? false,
    mergeTables: legacy.mergeTables ?? integration.mergeTables ?? true,
    relevelTitles: legacy.relevelTitles ?? integration.relevelTitles ?? true,
    recognizeSeal: legacy.recognizeSeal ?? integration.recognizeSeal ?? false,
    returnSpanBoxes: legacy.returnSpanBoxes ?? integration.returnSpanBoxes ?? true,
    preserveRawOutput: legacy.preserveRawOutput ?? integration.preserveRawOutput ?? true,
    preserveImages: legacy.preserveImages ?? integration.preserveImages ?? true
  }
  for (const [key, value] of Object.entries(options)) {
    if (typeof value !== 'boolean') throw new Error(`Invalid PaddleOCR-VL option: ${key}`)
  }
  return options
}

export function paddleOcrBaseUrl(options: BaiduOcrIntegrationOptions): string {
  if (!options.apiUrl?.trim()) throw new Error('PaddleOCR-VL self-hosted service URL is required')
  let url: URL
  try {
    url = new URL(options.apiUrl.trim())
  } catch {
    throw new Error('PaddleOCR-VL service URL must be an HTTP or HTTPS URL')
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) {
    throw new Error('PaddleOCR-VL service URL must be HTTP or HTTPS without embedded credentials, query or fragment')
  }
  return url
    .toString()
    .replace(/\/+$/, '')
    .replace(/\/layout-parsing$/, '')
}

export function validateBaiduIntegration(options: BaiduOcrIntegrationOptions, engine?: BaiduParserEngine): void {
  if (baiduOcrServerType(options) === 'official') {
    if (!options.apiKey?.trim() || !options.secretKey?.trim())
      throw new Error('Baidu OCR requires API Key and Secret Key')
  } else {
    if (engine === 'unlimited-ocr') throw new Error('Unlimited-OCR only supports the official Baidu Cloud service')
    paddleOcrBaseUrl(options)
  }
  resolveBaiduParseOptions({}, options)
}
