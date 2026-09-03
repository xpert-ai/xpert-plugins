import type { MiniMaxVideoToolDependencies } from './types.js'

const MAX_IMAGE_BYTES = 30 * 1024 * 1024
const SUPPORTED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/heic',
  'image/heif'
])

export async function encodeMiniMaxImage(
  input: unknown,
  deps: MiniMaxVideoToolDependencies,
  label: string
): Promise<string> {
  if (typeof input === 'string') {
    const value = input.trim()
    if (/^https:\/\//iu.test(value) || /^data:image\//iu.test(value)) return value
    return readWorkspaceImage(value, deps, label)
  }
  if (!isRecord(input)) throw new Error(`${label} must be a Workspace image or public HTTPS URL`)
  const publicUrl = readString(input.url) ?? readString(input.fileUrl)
  if (publicUrl) {
    if (!/^https:\/\//iu.test(publicUrl)) throw new Error(`${label} URL must use HTTPS`)
    return publicUrl
  }
  const path = readString(input.workspacePath) ?? readString(input.filePath) ?? readString(input.path)
  if (!path) throw new Error(`${label} is missing a Workspace path`)
  return readWorkspaceImage(path, deps, label, input)
}

async function readWorkspaceImage(
  path: string,
  deps: MiniMaxVideoToolDependencies,
  label: string,
  descriptor?: Record<string, unknown>
) {
  const value = deps.workspaceFiles.readRuntimeBuffer
    ? await deps.workspaceFiles.readRuntimeBuffer(descriptor ?? path)
    : await deps.workspaceFiles.readBuffer({ filePath: path })
  if (!value.buffer.length) throw new Error(`${label} is empty`)
  if (value.buffer.length > MAX_IMAGE_BYTES) throw new Error(`${label} exceeds MiniMax's 30 MB limit`)
  const mimeType = normalizeMime(value.mimeType ?? descriptor?.mimeType ?? descriptor?.mimetype)
  if (!mimeType || !SUPPORTED_IMAGE_TYPES.has(mimeType)) {
    throw new Error(`${label} must be JPEG, PNG, WEBP, HEIC, or HEIF`)
  }
  return `data:${mimeType};base64,${value.buffer.toString('base64')}`
}

function normalizeMime(value: unknown) {
  return typeof value === 'string' ? value.split(';')[0]?.trim().toLowerCase() : undefined
}

function readString(value: unknown) {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
