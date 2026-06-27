import type { SeedreamWorkspaceScope, WorkspaceFilesApi } from './types.js'
import { extensionFromMimeType } from './workspace-upload.js'

type FileLike = {
  blob?: Buffer | Uint8Array | ArrayBuffer | string
  content?: Buffer | Uint8Array | ArrayBuffer | string
  fileUrl?: string
  url?: string
  filePath?: string
  workspacePath?: string
  path?: string
  fileName?: string
  name?: string
  mimeType?: string
  mimetype?: string
  type?: string
}

export type InputReadOptions = {
  fetchImpl: typeof fetch
  workspaceFiles: WorkspaceFilesApi
  workspaceScope?: SeedreamWorkspaceScope
  defaultMimeType: string
}

export function bufferToDataUrl(buffer: Buffer, mimeType: string) {
  return `data:${mimeType};base64,${buffer.toString('base64')}`
}

export async function inputToBuffer(input: unknown, options: InputReadOptions) {
  if (Buffer.isBuffer(input)) {
    return { buffer: input, mimeType: options.defaultMimeType }
  }
  if (input instanceof Uint8Array) {
    return { buffer: Buffer.from(input), mimeType: options.defaultMimeType }
  }
  if (input instanceof ArrayBuffer) {
    return { buffer: Buffer.from(input), mimeType: options.defaultMimeType }
  }
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return dataUrlToBuffer(input)
    }
    if (isHttpUrl(input)) {
      return downloadInput(input, options.fetchImpl, options.defaultMimeType)
    }
    return readWorkspaceInput(input, options)
  }
  if (isObject(input)) {
    const file = input as FileLike
    const inline = file.blob ?? file.content
    if (inline !== undefined) {
      return inputToBuffer(inline, { ...options, defaultMimeType: normalizeMimeType(file) ?? options.defaultMimeType })
    }
    const url = file.fileUrl ?? file.url
    if (url) {
      return downloadInput(url, options.fetchImpl, normalizeMimeType(file) ?? options.defaultMimeType)
    }
    const filePath = file.filePath ?? file.path ?? file.workspacePath
    if (filePath) {
      return readWorkspaceInput(filePath, options, normalizeMimeType(file))
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

async function readWorkspaceInput(filePath: string, options: InputReadOptions, mimeType?: string) {
  const file = await options.workspaceFiles.readBuffer({
    ...options.workspaceScope,
    filePath
  })
  const resolvedMimeType =
    mimeType ?? file.mimeType ?? inferMimeType(file.name ?? file.filePath ?? filePath, options.defaultMimeType)
  return {
    buffer: Buffer.from(file.buffer),
    mimeType: resolvedMimeType
  }
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
