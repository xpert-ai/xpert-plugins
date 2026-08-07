import type {
  VeoInlineImage,
  VeoToolDependencies,
  WorkspaceFile,
  WorkspaceRuntimeLocator
} from './types.js'

const SUPPORTED_IMAGE_MIME_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp'
])

type InlineFile = {
  blob?: Buffer | Uint8Array | ArrayBuffer | string
  content?: Buffer | Uint8Array | ArrayBuffer | string
  mimeType?: string | null
  mimetype?: string | null
  type?: string | null
}

export async function encodeInlineImage(
  input: unknown,
  deps: VeoToolDependencies,
  label: string
): Promise<VeoInlineImage> {
  const file = await inputToBuffer(input, deps)
  const mimeType = normalizeImageMimeType(file.mimeType, label)
  return {
    inlineData: {
      mimeType,
      data: file.buffer.toString('base64')
    }
  }
}

async function inputToBuffer(
  input: unknown,
  deps: VeoToolDependencies
): Promise<{ buffer: Buffer; mimeType?: string }> {
  if (Buffer.isBuffer(input)) {
    return { buffer: input }
  }
  if (input instanceof Uint8Array) {
    return { buffer: Buffer.from(input) }
  }
  if (input instanceof ArrayBuffer) {
    return { buffer: Buffer.from(input) }
  }
  if (typeof input === 'string') {
    if (input.startsWith('data:')) {
      return parseDataUrl(input)
    }
    if (/^https?:\/\//i.test(input)) {
      throw new Error(
        'Veo input images must be Workspace Files references, workspace paths, or data URLs'
      )
    }
    return readWorkspaceFile(input, deps)
  }
  if (isRecord(input)) {
    const inline = input as InlineFile
    const bytes = inline.blob ?? inline.content
    if (bytes !== undefined) {
      const resolved = await inputToBuffer(bytes, deps)
      return {
        ...resolved,
        mimeType: readMimeType(inline) ?? resolved.mimeType
      }
    }
    return readWorkspaceFile(input as WorkspaceRuntimeLocator, deps)
  }
  throw new Error('Unsupported Veo image input')
}

async function readWorkspaceFile(
  locator: WorkspaceRuntimeLocator,
  deps: VeoToolDependencies
) {
  if (deps.workspaceFiles.readRuntimeBuffer) {
    const file = await deps.workspaceFiles.readRuntimeBuffer(locator)
    return workspaceFileBytes(file)
  }
  const filePath = readFilePath(locator)
  if (!filePath) {
    throw new Error('Workspace file path is required for Veo image input')
  }
  const file = await deps.workspaceFiles.readBuffer({
    ...deps.workspaceScope,
    ...(isRecord(locator) ? locator : {}),
    filePath
  })
  return workspaceFileBytes(file)
}

function workspaceFileBytes(file: WorkspaceFile & { buffer: Buffer }) {
  return {
    buffer: Buffer.from(file.buffer),
    mimeType: file.mimeType
  }
}

function parseDataUrl(value: string) {
  const match = /^data:([^;,]+);base64,([A-Za-z0-9+/=\s]+)$/s.exec(value)
  if (!match) {
    throw new Error('Invalid base64 image data URL')
  }
  return {
    buffer: Buffer.from((match[2] ?? '').replace(/\s/g, ''), 'base64'),
    mimeType: match[1]
  }
}

function normalizeImageMimeType(value: string | undefined, label: string) {
  const mimeType = (value || 'image/png').toLowerCase() === 'image/jpg'
    ? 'image/jpeg'
    : (value || 'image/png').toLowerCase()
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    throw new Error(`${label} must be a JPEG, PNG, or WebP image`)
  }
  return mimeType
}

function readMimeType(input: InlineFile) {
  return input.mimeType ?? input.mimetype ?? input.type ?? undefined
}

function readFilePath(locator: WorkspaceRuntimeLocator) {
  if (typeof locator === 'string') return locator.trim() || undefined
  const value = locator.filePath ?? locator.workspacePath ?? locator.path
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}
