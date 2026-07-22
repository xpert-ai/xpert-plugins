import { createHash } from 'node:crypto'
import { extname } from 'node:path'
import { WORKSPACE_FILES_SOURCE, type WorkspaceFileLocator, type WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { DINGTALK_MAX_FILE_BYTES } from './types.js'

export const DINGTALK_SUPPORTED_FILE_TYPES = ['xlsx', 'pdf', 'zip', 'rar', 'doc', 'docx'] as const

const DINGTALK_SUPPORTED_FILE_TYPE_SET = new Set<string>(DINGTALK_SUPPORTED_FILE_TYPES)

export type DingTalkSendFileReference = {
  source?: string | null
  filePath?: string | null
  workspacePath?: string | null
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  size?: number | null
}

export type DingTalkSendFileDescriptor = {
  path?: string | null
  filePath?: string | null
  workspacePath?: string | null
  fileRef?: DingTalkSendFileReference | null
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  mimetype?: string | null
  extension?: string | null
  size?: number | null
}

export type DingTalkResolvedSendFile = {
  buffer: Buffer
  fileName: string
  fileType: string
  mimeType: string
  size: number
  sha256: string
}

export type DingTalkSendFileMetadata = Omit<DingTalkResolvedSendFile, 'buffer'>

const MIME_BY_EXTENSION: Record<string, string> = {
  csv: 'text/csv',
  doc: 'application/msword',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  gif: 'image/gif',
  html: 'text/html',
  jpeg: 'image/jpeg',
  jpg: 'image/jpeg',
  json: 'application/json',
  md: 'text/markdown',
  mp4: 'video/mp4',
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  rar: 'application/vnd.rar',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip'
}

export async function resolveDingTalkSendFileFromWorkspace(
  descriptor: DingTalkSendFileDescriptor,
  options: {
    workspaceFiles: Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>
    maxBytes?: number
  }
): Promise<DingTalkResolvedSendFile> {
  const locator = toWorkspaceFileLocator(descriptor)
  const file = await options.workspaceFiles.readRuntimeBuffer(locator)
  return resolveDingTalkSendFileFromBuffer(file.buffer, {
    descriptor,
    fallbackName: file.name,
    fallbackMimeType: file.mimeType,
    fallbackPath: file.workspacePath || file.filePath,
    maxBytes: options.maxBytes
  })
}

export function resolveDingTalkSendFileFromBuffer(
  buffer: Buffer,
  options: {
    descriptor: DingTalkSendFileDescriptor
    fallbackName?: string | null
    fallbackMimeType?: string | null
    fallbackPath?: string | null
    maxBytes?: number
  }
): DingTalkResolvedSendFile {
  const maxBytes = options.maxBytes ?? DINGTALK_MAX_FILE_BYTES
  if (!buffer.length) {
    throw new Error('DingTalk file send does not support empty files.')
  }
  if (buffer.length > maxBytes) {
    throw new Error(`DingTalk file send file is too large: ${buffer.length} bytes; maximum is ${maxBytes} bytes.`)
  }

  const descriptor = options.descriptor
  const fallbackPath = normalizeString(options.fallbackPath) || resolveDescriptorPath(descriptor)
  const fileName = sanitizeDingTalkFileName(
    descriptor.originalName || descriptor.name,
    options.fallbackName || basenamePortable(fallbackPath) || 'file'
  )
  const extension = resolveFileExtension(fileName, fallbackPath, descriptor.extension)
  if (!extension || !DINGTALK_SUPPORTED_FILE_TYPE_SET.has(extension)) {
    const received = extension ? `.${extension}` : 'a file without an extension'
    throw new Error(
      `DingTalk file send supports only ${DINGTALK_SUPPORTED_FILE_TYPES.map((type) => `.${type}`).join(', ')} files; received ${received}.`
    )
  }
  const mimeType = resolveDingTalkFileMimeType(
    fileName,
    descriptor.mimeType || descriptor.mimetype || options.fallbackMimeType
  )

  return {
    buffer,
    fileName,
    fileType: extension,
    mimeType,
    size: buffer.length,
    sha256: createHash('sha256').update(buffer).digest('hex')
  }
}

export function toDingTalkSendFileMetadata(file: DingTalkResolvedSendFile): DingTalkSendFileMetadata {
  return {
    fileName: file.fileName,
    fileType: file.fileType,
    mimeType: file.mimeType,
    size: file.size,
    sha256: file.sha256
  }
}

export function resolveDingTalkFileMimeType(fileName: string, declaredMimeType?: string | null): string {
  return (
    normalizeString(declaredMimeType)?.split(';')[0]?.trim().toLowerCase() ||
    MIME_BY_EXTENSION[resolveFileExtension(fileName, '') ?? ''] ||
    'application/octet-stream'
  )
}

export function sanitizeDingTalkFileName(value?: string | null, fallback?: string | null): string {
  const raw = normalizeString(value) || normalizeString(fallback) || 'file'
  const base = basenamePortable(raw.replace(/\0/g, ''))
  const sanitized = base
    .replace(/[\\/:*?"<>|]/g, '_')
    .split('')
    .map((character) => character.charCodeAt(0) < 32 ? '_' : character)
    .join('')
    .trim()
  return sanitized.slice(0, 250) || 'file'
}

function toWorkspaceFileLocator(descriptor: DingTalkSendFileDescriptor): WorkspaceFileLocator {
  const source = normalizeString(descriptor.fileRef?.source)
  if (source && source !== WORKSPACE_FILES_SOURCE) {
    throw new Error(`Unsupported DingTalk file reference source: ${source}`)
  }
  const path = validateWorkspaceFilePath(resolveDescriptorPath(descriptor))
  return {
    path,
    originalName: normalizeString(descriptor.originalName) || undefined,
    name: normalizeString(descriptor.name) || undefined,
    mimeType: normalizeString(descriptor.mimeType) || undefined,
    mimetype: normalizeString(descriptor.mimetype) || undefined,
    size: typeof descriptor.size === 'number' ? descriptor.size : undefined
  }
}

function resolveDescriptorPath(descriptor: DingTalkSendFileDescriptor): string {
  return (
    normalizeString(descriptor.fileRef?.filePath) ||
    normalizeString(descriptor.fileRef?.workspacePath) ||
    normalizeString(descriptor.path) ||
    normalizeString(descriptor.filePath) ||
    normalizeString(descriptor.workspacePath)
  )
}

function validateWorkspaceFilePath(value: string): string {
  const path = normalizeString(value)
  if (!path) {
    throw new Error('DingTalk file send requires file.path, file.filePath, file.workspacePath, or a workspace fileRef.')
  }
  if (path.includes('\0')) {
    throw new Error('DingTalk file send path contains an invalid null byte.')
  }

  const normalized = path.replace(/\\/g, '/')
  if (/^[a-z][a-z0-9+.-]*:/i.test(normalized)) {
    throw new Error('DingTalk file send only supports files in the current Xpert workspace.')
  }
  if (/^[a-z]:\//i.test(normalized) || normalized.startsWith('//')) {
    throw new Error('DingTalk file send does not support host absolute paths.')
  }
  if (normalized.startsWith('/') && !normalized.startsWith('/workspace/')) {
    throw new Error('DingTalk file send does not support host absolute paths.')
  }

  const workspaceRelative = normalized.startsWith('/workspace/')
    ? normalized.slice('/workspace/'.length)
    : normalized.replace(/^\.\//, '')
  const segments = workspaceRelative.split('/').filter(Boolean)
  if (!segments.length) {
    throw new Error('DingTalk file send requires a file path, not the workspace root.')
  }
  if (segments.includes('..')) {
    throw new Error('DingTalk file send path cannot escape the current workspace.')
  }
  return normalized
}

function resolveFileExtension(fileName: string, fallbackPath: string, explicit?: string | null): string | undefined {
  const fileNameExtension = normalizeExtension(extname(fileName))
  const workspacePathExtension = normalizeExtension(extname(fallbackPath))
  const normalizedExplicit = normalizeString(explicit).replace(/^\./, '').toLowerCase()

  if (fileNameExtension && workspacePathExtension && fileNameExtension !== workspacePathExtension) {
    throw new Error(
      `DingTalk filename extension .${fileNameExtension} does not match workspace path extension .${workspacePathExtension}.`
    )
  }

  const inferredExtension = fileNameExtension || workspacePathExtension
  if (normalizedExplicit && inferredExtension && normalizedExplicit !== inferredExtension) {
    const inferredSource = fileNameExtension ? 'filename' : 'workspace path'
    throw new Error(
      `DingTalk explicit extension .${normalizedExplicit} does not match ${inferredSource} extension .${inferredExtension}.`
    )
  }

  return inferredExtension || normalizedExplicit || undefined
}

function normalizeExtension(value?: string | null): string {
  return normalizeString(value).replace(/^\./, '').toLowerCase()
}

function basenamePortable(value?: string | null): string {
  const normalized = normalizeString(value).replace(/\\/g, '/')
  return normalized.split('/').filter(Boolean).pop() || ''
}

function normalizeString(value?: string | null): string {
  return typeof value === 'string' ? value.trim() : ''
}
