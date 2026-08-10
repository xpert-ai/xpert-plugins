import type { SiliconflowWorkspaceScope, WorkspaceFilesApi } from './types.js'

const MAX_INPUT_IMAGE_BYTES = 10 * 1024 * 1024

type InputReadOptions = {
  fetchImpl: typeof fetch
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SiliconflowWorkspaceScope
}

export async function encodeImageInput(input: unknown, options: InputReadOptions): Promise<string> {
  const { buffer, mimeType } = await inputToBuffer(input, options)
  if (buffer.length > MAX_INPUT_IMAGE_BYTES) {
    throw new Error('Input image exceeds the 10MB limit')
  }
  if (!mimeType.startsWith('image/')) {
    throw new Error('Input file must be an image')
  }
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

async function inputToBuffer(input: unknown, options: InputReadOptions): Promise<{ buffer: Buffer; mimeType: string }> {
  if (Buffer.isBuffer(input)) return { buffer: input, mimeType: 'image/png' }
  if (input instanceof Uint8Array) return { buffer: Buffer.from(input), mimeType: 'image/png' }
  if (input instanceof ArrayBuffer) return { buffer: Buffer.from(input), mimeType: 'image/png' }

  if (typeof input === 'string') {
    if (input.startsWith('data:')) return parseDataUrl(input)
    if (isHttpUrl(input)) return downloadInput(input, options.fetchImpl)
    return readWorkspaceInput(input, options)
  }

  if (isRecord(input)) {
    const inline = input.blob ?? input.content
    if (inline !== undefined) {
      const result = await inputToBuffer(inline, options)
      return { buffer: result.buffer, mimeType: readMimeType(input) || result.mimeType }
    }

    const filePath = readString(input.filePath) || readString(input.workspacePath) || readString(input.path)
    if (filePath) return readWorkspaceInput(filePath, options, readMimeType(input))

    const url = readString(input.fileUrl) || readString(input.url)
    if (url && isHttpUrl(url)) return downloadInput(url, options.fetchImpl, readMimeType(input))
  }

  throw new Error('Unsupported image input')
}

async function readWorkspaceInput(
  filePath: string,
  options: InputReadOptions,
  mimeType?: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const file = options.workspaceFiles.readRuntimeBuffer
    ? await options.workspaceFiles.readRuntimeBuffer({
        ...options.workspaceScope,
        filePath,
        ...(mimeType ? { mimeType } : {})
      })
    : await options.workspaceFiles.readBuffer({ ...options.workspaceScope, filePath })

  return {
    buffer: Buffer.from(file.buffer),
    mimeType: mimeType || file.mimeType || inferMimeType(file.name || file.filePath)
  }
}

async function downloadInput(
  url: string,
  fetchImpl: typeof fetch,
  mimeType?: string
): Promise<{ buffer: Buffer; mimeType: string }> {
  const parsedUrl = new URL(url)
  if (parsedUrl.protocol !== 'https:') throw new Error('Input image URL must use HTTPS')

  const response = await fetchImpl(url, { method: 'GET' })
  if (!response.ok) throw new Error(`Failed to download input image: ${response.status} ${response.statusText}`)
  const buffer = Buffer.from(await response.arrayBuffer())
  if (buffer.length > MAX_INPUT_IMAGE_BYTES) throw new Error('Input image exceeds the 10MB limit')

  return {
    buffer,
    mimeType: mimeType || response.headers.get('content-type')?.split(';')[0]?.trim() || 'image/png'
  }
}

function parseDataUrl(dataUrl: string): { buffer: Buffer; mimeType: string } {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) throw new Error('Invalid image data URL')
  const mimeType = match[1] || 'image/png'
  const body = match[3] || ''
  const buffer = match[2] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body))
  return { buffer, mimeType }
}

function inferMimeType(fileName: string) {
  switch (fileName.split('.').pop()?.toLowerCase()) {
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg'
    case 'webp':
      return 'image/webp'
    case 'gif':
      return 'image/gif'
    default:
      return 'image/png'
  }
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function readMimeType(value: Record<string, unknown>) {
  return readString(value.mimeType) || readString(value.mimetype) || readString(value.type)
}
