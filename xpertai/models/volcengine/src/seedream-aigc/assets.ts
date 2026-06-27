import { readFile } from 'fs/promises'
import { basename } from 'path'
import { extensionFromMimeType } from './workspace-upload.js'

type FileLike = {
  blob?: Buffer | Uint8Array | ArrayBuffer | string
  content?: Buffer | Uint8Array | ArrayBuffer | string
  fileUrl?: string
  url?: string
  filePath?: string
  path?: string
  fileName?: string
  name?: string
  mimeType?: string
  mimetype?: string
  type?: string
}

export async function inputToDataUrl(input: unknown, fetchImpl: typeof fetch, defaultMimeType = 'image/png') {
  if (typeof input === 'string' && input.startsWith('data:')) {
    return input
  }
  const { buffer, mimeType } = await inputToBuffer(input, fetchImpl, defaultMimeType)
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function inputToBuffer(input: unknown, fetchImpl: typeof fetch, defaultMimeType = 'application/octet-stream') {
  if (Buffer.isBuffer(input)) {
    return { buffer: input, mimeType: defaultMimeType }
  }
  if (input instanceof Uint8Array) {
    return { buffer: Buffer.from(input), mimeType: defaultMimeType }
  }
  if (input instanceof ArrayBuffer) {
    return { buffer: Buffer.from(input), mimeType: defaultMimeType }
  }
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return dataUrlToBuffer(input)
    }
    if (isHttpUrl(input)) {
      return downloadInput(input, fetchImpl, defaultMimeType)
    }
    return { buffer: await readFile(input), mimeType: inferMimeType(input, defaultMimeType) }
  }
  if (isObject(input)) {
    const file = input as FileLike
    const inline = file.blob ?? file.content
    if (inline !== undefined) {
      return inputToBuffer(inline, fetchImpl, normalizeMimeType(file) ?? defaultMimeType)
    }
    const url = file.fileUrl ?? file.url
    if (url) {
      return downloadInput(url, fetchImpl, normalizeMimeType(file) ?? defaultMimeType)
    }
    const filePath = file.filePath ?? file.path
    if (filePath) {
      return { buffer: await readFile(filePath), mimeType: normalizeMimeType(file) ?? inferMimeType(filePath, defaultMimeType) }
    }
  }
  throw new Error('Unsupported file input')
}

export function enforceMaxBytes(buffer: Buffer, maxBytes: number, label: string) {
  if (buffer.length > maxBytes) {
    throw new Error(`${label} exceeds ${Math.round(maxBytes / 1024 / 1024)}MB limit`)
  }
}

export function createGeneratedFileName(prefix: string, index: number, mimeType: string, forcedName?: string) {
  if (forcedName) {
    return forcedName
  }
  const suffix = index > 0 ? `-${index + 1}` : ''
  return `${prefix}${suffix}.${extensionFromMimeType(mimeType)}`
}

export function basenameFromUrl(url: string, fallback: string) {
  try {
    return basename(new URL(url).pathname) || fallback
  } catch {
    return fallback
  }
}

function dataUrlToBuffer(dataUrl: string) {
  const match = /^data:([^;,]+)?(;base64)?,(.*)$/s.exec(dataUrl)
  if (!match) {
    throw new Error('Invalid data URL')
  }
  const mimeType = match[1] || 'application/octet-stream'
  const body = match[3] ?? ''
  const buffer = match[2] ? Buffer.from(body, 'base64') : Buffer.from(decodeURIComponent(body))
  return { buffer, mimeType }
}

async function downloadInput(url: string, fetchImpl: typeof fetch, defaultMimeType: string) {
  const response = await fetchImpl(url, { method: 'GET' })
  if (!response.ok) {
    throw new Error(`Failed to download input file: ${response.status} ${response.statusText}`)
  }
  const arrayBuffer = await response.arrayBuffer()
  return {
    buffer: Buffer.from(arrayBuffer),
    mimeType: response.headers.get('content-type')?.split(';')[0]?.trim() || defaultMimeType
  }
}

function normalizeMimeType(file: FileLike) {
  return file.mimeType ?? file.mimetype ?? file.type
}

function inferMimeType(fileName: string, fallback: string) {
  const ext = fileName.split('.').pop()?.toLowerCase()
  if (ext === 'jpg' || ext === 'jpeg') return 'image/jpeg'
  if (ext === 'png') return 'image/png'
  if (ext === 'webp') return 'image/webp'
  if (ext === 'gif') return 'image/gif'
  if (ext === 'mp4') return 'video/mp4'
  if (ext === 'mp3') return 'audio/mpeg'
  if (ext === 'wav') return 'audio/wav'
  return fallback
}

function isHttpUrl(value: string) {
  return /^https?:\/\//i.test(value)
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object'
}
