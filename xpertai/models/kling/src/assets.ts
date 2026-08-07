import type { KlingToolDependencies } from './types.js'

const MAX_IMAGE_BYTES = 50 * 1024 * 1024
const MIN_IMAGE_EDGE = 300
const MIN_IMAGE_RATIO = 1 / 2.5
const MAX_IMAGE_RATIO = 2.5

export type EncodedKlingImage = {
  base64: string
  mimeType: 'image/jpeg' | 'image/png'
  width: number
  height: number
}

export async function encodeKlingImage(
  input: unknown,
  deps: KlingToolDependencies,
  label: string
): Promise<EncodedKlingImage> {
  const { buffer, declaredMimeType } = await inputToBuffer(input, deps)
  if (!buffer.length) throw new Error(`${label} is empty`)
  if (buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label} exceeds Kling's 50 MB limit`)

  const image = inspectImage(buffer)
  if (declaredMimeType && !['image/jpeg', 'image/png'].includes(declaredMimeType)) {
    throw new Error(`${label} must be a JPEG or PNG image`)
  }
  if (image.width < MIN_IMAGE_EDGE || image.height < MIN_IMAGE_EDGE) {
    throw new Error(`${label} width and height must each be at least 300 pixels`)
  }
  const ratio = image.width / image.height
  if (ratio < MIN_IMAGE_RATIO || ratio > MAX_IMAGE_RATIO) {
    throw new Error(`${label} aspect ratio must be between 1:2.5 and 2.5:1`)
  }
  return { ...image, base64: buffer.toString('base64') }
}

async function inputToBuffer(input: unknown, deps: KlingToolDependencies) {
  if (Buffer.isBuffer(input)) return { buffer: input, declaredMimeType: undefined }
  if (typeof input === 'string') {
    if (input.startsWith('data:')) return parseDataUrl(input)
    if (/^https?:\/\//iu.test(input)) {
      throw new Error('Use a Workspace file reference instead of a public image URL')
    }
    return readWorkspaceBuffer(input, deps, undefined)
  }
  if (!isRecord(input)) throw new Error('A Workspace image file is required')

  if (Buffer.isBuffer(input.buffer)) {
    return { buffer: input.buffer, declaredMimeType: normalizeMime(input.mimeType ?? input.mimetype) }
  }
  const path = readString(input.filePath) ?? readString(input.workspacePath) ?? readString(input.path)
  if (!path) throw new Error('A Workspace image file path is required')
  return readWorkspaceBuffer(path, deps, normalizeMime(input.mimeType ?? input.mimetype), input)
}

async function readWorkspaceBuffer(
  path: string,
  deps: KlingToolDependencies,
  declaredMimeType?: string,
  original?: Record<string, unknown>
) {
  const value = deps.workspaceFiles.readRuntimeBuffer
    ? await deps.workspaceFiles.readRuntimeBuffer(original ?? path)
    : await deps.workspaceFiles.readBuffer({ filePath: path })
  return {
    buffer: value.buffer,
    declaredMimeType: normalizeMime(value.mimeType) ?? declaredMimeType
  }
}

function parseDataUrl(value: string) {
  const match = /^data:(image\/(?:jpeg|png));base64,([A-Za-z0-9+/=\s]+)$/u.exec(value)
  if (!match) throw new Error('Image data URL must contain Base64 JPEG or PNG data')
  return { buffer: Buffer.from(match[2].replace(/\s/gu, ''), 'base64'), declaredMimeType: match[1] }
}

function inspectImage(buffer: Buffer): Omit<EncodedKlingImage, 'base64'> {
  if (isPng(buffer)) {
    if (buffer.length < 24) throw new Error('PNG image is truncated')
    return { mimeType: 'image/png', width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) }
  }
  if (isJpeg(buffer)) {
    const dimensions = readJpegDimensions(buffer)
    if (!dimensions) throw new Error('JPEG dimensions could not be read')
    return { mimeType: 'image/jpeg', ...dimensions }
  }
  throw new Error('Image must contain valid JPEG or PNG data')
}

function isPng(buffer: Buffer) {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
}

function isJpeg(buffer: Buffer) {
  return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8
}

function readJpegDimensions(buffer: Buffer): { width: number; height: number } | undefined {
  const startOfFrame = new Set([0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf])
  let offset = 2
  while (offset + 3 < buffer.length) {
    if (buffer[offset] !== 0xff) {
      offset += 1
      continue
    }
    while (buffer[offset] === 0xff) offset += 1
    const marker = buffer[offset]
    offset += 1
    if (marker === 0xd8 || marker === 0xd9) continue
    if (offset + 2 > buffer.length) return undefined
    const segmentLength = buffer.readUInt16BE(offset)
    if (segmentLength < 2 || offset + segmentLength > buffer.length) return undefined
    if (startOfFrame.has(marker) && segmentLength >= 7) {
      return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) }
    }
    offset += segmentLength
  }
  return undefined
}

function normalizeMime(value: unknown) {
  return typeof value === 'string' ? value.split(';')[0].trim().toLowerCase() : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
