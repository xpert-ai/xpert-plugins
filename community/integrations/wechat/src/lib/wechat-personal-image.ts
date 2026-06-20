export interface WechatPersonalFetchedImage {
  imageContent: string
  contentType?: string
  size: number
}

const DEFAULT_MAX_IMAGE_BYTES = 10 * 1024 * 1024
const IMAGE_EXTENSIONS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.bmp', '.heic', '.heif'])

export async function fetchWechatPersonalImageAsBase64(
  imageUrl: string,
  options: {
    timeoutMs?: number
    maxBytes?: number
  } = {}
): Promise<WechatPersonalFetchedImage> {
  const url = normalizeHttpImageUrl(imageUrl)
  if (!url) {
    throw new Error('只支持 http/https 图片链接。')
  }

  const maxBytes = normalizeMaxBytes(options.maxBytes)
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), normalizeTimeoutMs(options.timeoutMs))
  try {
    const response = await fetch(url, {
      method: 'GET',
      signal: controller.signal
    })
    if (!response.ok) {
      throw new Error(`图片下载失败：HTTP ${response.status}`)
    }

    const contentType = response.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() || undefined
    const contentLength = Number(response.headers.get('content-length'))
    if (Number.isFinite(contentLength) && contentLength > maxBytes) {
      throw new Error(`图片超过大小限制 ${Math.floor(maxBytes / 1024 / 1024)}MB。`)
    }
    if (!isAllowedImageResponse(url, contentType)) {
      throw new Error('图片链接响应不是支持的图片类型。')
    }

    const buffer = Buffer.from(await response.arrayBuffer())
    if (buffer.byteLength > maxBytes) {
      throw new Error(`图片超过大小限制 ${Math.floor(maxBytes / 1024 / 1024)}MB。`)
    }
    if (!buffer.byteLength) {
      throw new Error('图片内容为空。')
    }

    return {
      imageContent: buffer.toString('base64'),
      contentType,
      size: buffer.byteLength
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('图片下载超时。')
    }
    throw error
  } finally {
    clearTimeout(timer)
  }
}

function normalizeHttpImageUrl(value: string): string {
  try {
    const url = new URL(value.trim())
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : ''
  } catch {
    return ''
  }
}

function isAllowedImageResponse(url: string, contentType?: string): boolean {
  if (contentType?.startsWith('image/')) {
    return true
  }
  const pathname = new URL(url).pathname.toLowerCase()
  return Array.from(IMAGE_EXTENSIONS).some((extension) => pathname.endsWith(extension))
}

function normalizeTimeoutMs(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 10000
}

function normalizeMaxBytes(value: unknown): number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0
    ? Math.floor(value)
    : DEFAULT_MAX_IMAGE_BYTES
}
