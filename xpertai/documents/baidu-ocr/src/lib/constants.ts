export const BAIDU_OCR = 'baidu-ocr' as const
export const BAIDU_PADDLE_OCR_VL = 'baidu-paddleocr-vl' as const
export const BAIDU_UNLIMITED_OCR = 'baidu-unlimited-ocr' as const
export const BAIDU_OCR_PLUGIN_NAME = '@xpert-ai/plugin-baidu-ocr' as const
export const BAIDU_OCR_PLUGIN_VERSION = '0.2.0' as const

export const BAIDU_TOKEN_URL = 'https://aip.baidubce.com/oauth/2.0/token'
export const BAIDU_PADDLE_SUBMIT_URL = 'https://aip.baidubce.com/rest/2.0/brain/online/v2/paddle-vl-parser/task'
export const BAIDU_PADDLE_QUERY_URL = 'https://aip.baidubce.com/rest/2.0/brain/online/v2/paddle-vl-parser/task/query'
export const BAIDU_UNLIMITED_SUBMIT_URL = 'https://aip.baidubce.com/rest/2.0/brain/online/v2/unlimited-ocr-parser/task'
export const BAIDU_UNLIMITED_QUERY_URL =
  'https://aip.baidubce.com/rest/2.0/brain/online/v2/unlimited-ocr-parser/task/query'

export const BAIDU_DOCUMENT_EXTENSIONS = new Set([
  'pdf',
  'jpg',
  'jpeg',
  'png',
  'bmp',
  'tif',
  'tiff',
  'ofd',
  'doc',
  'docx',
  'txt',
  'wps',
  'ppt',
  'pptx'
])
export const BAIDU_IMAGE_EXTENSIONS = new Set(['jpg', 'jpeg', 'png', 'bmp', 'tif', 'tiff'])
export const BAIDU_MAX_PDF_PAGES = 500
export const BAIDU_MAX_BASE64_BYTES = 50 * 1024 * 1024
export const BAIDU_PDF_BATCH_TARGET_BYTES = 45 * 1024 * 1024
export const BAIDU_MAX_IMAGE_BYTES = 10 * 1024 * 1024
export const BAIDU_MAX_LAYOUT_BYTES = 100 * 1024 * 1024
export const BAIDU_MAX_STREAM_BYTES = 50 * 1024 * 1024
export const BAIDU_MAX_IMAGE_SIDE_PIXELS = 8192

export const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#2563eb"/><path d="M16 17h20l12 12v18H16z" fill="#fff" opacity=".95"/><path d="M36 17v12h12" fill="none" stroke="#93c5fd" stroke-width="4"/><path d="M22 36h20M22 42h15" stroke="#2563eb" stroke-width="3" stroke-linecap="round"/><circle cx="17" cy="15" r="5" fill="#22c55e"/><path d="M12 25v-7a6 6 0 0 1 6-6h7M52 39v7a6 6 0 0 1-6 6h-7" fill="none" stroke="#bfdbfe" stroke-width="3" stroke-linecap="round"/></svg>`
