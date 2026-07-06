import { createHash } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import { homedir } from 'node:os'
import { basename, extname, isAbsolute, resolve } from 'node:path'
import type { WorkspaceFileLocator, WorkspaceFilesApi, WorkspacePortableFileReference } from '@xpert-ai/plugin-sdk'
import { normalizeString } from './types.js'

export const WECHAT_MAX_SEND_FILE_BYTES = 25 * 1024 * 1024
const WORKSPACE_FILES_SOURCE: WorkspacePortableFileReference['source'] = 'platform.workspace.files'

export type WechatSendFileDescriptor = {
  path?: string | null
  filePath?: string | null
  workspacePath?: string | null
  fileRef?: (Partial<Omit<WorkspacePortableFileReference, 'source'>> & { source?: string | null }) | null
  originalName?: string | null
  name?: string | null
  mimeType?: string | null
  mimetype?: string | null
  extension?: string | null
  size?: number | null
}

export type WechatResolvedSendFile = {
  filePath: string
  fileRef?: WorkspacePortableFileReference
  fileName: string
  mimeType: string
  extension?: string
  size: number
  sha256: string
  fileContent: string
}

export type WechatSendFileMetadata = Omit<WechatResolvedSendFile, 'fileContent'>

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
  pdf: 'application/pdf',
  png: 'image/png',
  ppt: 'application/vnd.ms-powerpoint',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  txt: 'text/plain',
  xls: 'application/vnd.ms-excel',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  zip: 'application/zip'
}

/**
 * Legacy resolver for host/API-process readable local paths.
 *
 * New sandbox-produced files should go through `resolveWechatSendFileFromWorkspace`
 * so `/workspace/...` is interpreted by the platform instead of Node fs.
 */
export async function resolveWechatSendFile(
  descriptor: WechatSendFileDescriptor,
  options: { maxBytes?: number; workspaceRoot?: string | null } = {}
): Promise<WechatResolvedSendFile> {
  const filePath = resolveWechatSendFilePath(descriptor, options)
  const info = await stat(filePath).catch((error) => {
    throw new Error(`微信文件发送无法读取文件: ${filePath}; ${error instanceof Error ? error.message : String(error)}`)
  })
  if (!info.isFile()) {
    throw new Error(`微信文件发送只支持普通文件: ${filePath}`)
  }
  if (info.size <= 0) {
    throw new Error(`微信文件发送文件为空: ${filePath}`)
  }

  const maxBytes = options.maxBytes ?? WECHAT_MAX_SEND_FILE_BYTES
  if (info.size > maxBytes) {
    throw new Error(`微信文件发送文件过大: ${info.size} bytes; maximum is ${maxBytes} bytes`)
  }

  const bytes = await readFile(filePath)
  return resolveWechatSendFileFromBuffer(bytes, {
    descriptor,
    filePath,
    fallbackName: basename(filePath),
    maxBytes
  })
}

/**
 * Resolve a WeChat file payload through Xpert's runtime workspace capability.
 *
 * This is the preferred path for sandbox outputs such as `/workspace/report.docx`
 * because the platform owns scope inference and safe path normalization.
 */
export async function resolveWechatSendFileFromWorkspace(
  descriptor: WechatSendFileDescriptor,
  options: {
    workspaceFiles: Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>
    maxBytes?: number
  }
): Promise<WechatResolvedSendFile> {
  const file = await options.workspaceFiles.readRuntimeBuffer(toWorkspaceFileLocator(descriptor))
  const fileRef = file.reference
  return resolveWechatSendFileFromBuffer(file.buffer, {
    descriptor,
    filePath: fileRef.filePath,
    fileRef,
    fallbackName: file.name || basename(fileRef.filePath),
    fallbackMimeType: file.mimeType,
    maxBytes: options.maxBytes
  })
}

/**
 * Decide whether a descriptor should be resolved by workspace capability instead
 * of legacy host-path reads.
 */
export function shouldResolveWechatSendFileFromWorkspace(descriptor: WechatSendFileDescriptor): boolean {
  const rawPath =
    normalizeString(descriptor.fileRef?.filePath) ||
    normalizeString(descriptor.fileRef?.workspacePath) ||
    normalizeString(descriptor.path) ||
    normalizeString(descriptor.filePath) ||
    normalizeString(descriptor.workspacePath)
  if (!rawPath) {
    return false
  }
  if (normalizeString(descriptor.fileRef?.source) === WORKSPACE_FILES_SOURCE) {
    return true
  }
  if (rawPath === '/workspace' || rawPath.startsWith('/workspace/')) {
    return true
  }
  return !isAbsolute(expandHomePath(rawPath))
}

/** Validate file bytes and convert them into the payload expected by WeChat APIs. */
export function resolveWechatSendFileFromBuffer(
  bytes: Buffer,
  options: {
    descriptor: WechatSendFileDescriptor
    filePath: string
    fileRef?: WorkspacePortableFileReference
    fallbackName?: string | null
    fallbackMimeType?: string | null
    maxBytes?: number
  }
): WechatResolvedSendFile {
  const { descriptor, filePath, fileRef } = options
  const maxBytes = options.maxBytes ?? WECHAT_MAX_SEND_FILE_BYTES
  if (!bytes.length) {
    throw new Error(`微信文件发送文件为空: ${filePath}`)
  }
  if (bytes.length > maxBytes) {
    throw new Error(`微信文件发送文件过大: ${bytes.length} bytes; maximum is ${maxBytes} bytes`)
  }
  const fileName = sanitizeWechatSendFileName(
    descriptor.originalName || descriptor.name,
    options.fallbackName || basename(filePath)
  )
  const extension = resolveFileExtension(fileName, filePath, descriptor.extension)
  const mimeType =
    normalizeString(descriptor.mimeType || descriptor.mimetype) ||
    normalizeString(options.fallbackMimeType) ||
    (extension ? MIME_BY_EXTENSION[extension.toLowerCase()] : '') ||
    'application/octet-stream'

  return {
    filePath,
    ...(fileRef ? { fileRef } : {}),
    fileName,
    mimeType,
    ...(extension ? { extension } : {}),
    size: bytes.length,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    fileContent: bytes.toString('base64')
  }
}

export function resolveWechatSendFilePath(
  descriptor: WechatSendFileDescriptor,
  options: { workspaceRoot?: string | null } = {}
): string {
  const rawPath =
    normalizeString(descriptor.path) ||
    normalizeString(descriptor.filePath) ||
    normalizeString(descriptor.workspacePath)
  if (!rawPath) {
    throw new Error('微信文件发送缺少文件路径。请传入 file.path、file.filePath 或 file.workspacePath。')
  }
  if (rawPath.includes('\0')) {
    throw new Error('微信文件发送文件路径包含非法字符。')
  }

  const expandedPath = expandHomePath(rawPath)
  if (isAbsolute(expandedPath)) {
    return expandedPath
  }

  const workspaceRoot = normalizeString(options.workspaceRoot)
  if (!workspaceRoot) {
    throw new Error('微信文件发送需要可访问的本地绝对路径。相对路径请使用 Xpert workspace runtime capability。')
  }
  if (!isAbsolute(workspaceRoot)) {
    throw new Error('微信文件发送 workspaceRoot 必须是本地绝对路径。')
  }

  const root = resolve(workspaceRoot)
  const resolved = resolve(root, expandedPath)
  if (resolved !== root && !resolved.startsWith(`${root}/`)) {
    throw new Error('微信文件发送文件路径不能逃逸 workspaceRoot。')
  }
  return resolved
}

export function sanitizeWechatSendFileName(value?: string | null, fallback?: string | null): string {
  const raw = normalizeString(value) || normalizeString(fallback) || 'file'
  const base = basename(raw.replace(/\0/g, '')).replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').trim()
  return base.slice(0, 255) || 'file'
}

export function toWechatSendFileMetadata(file: WechatResolvedSendFile): WechatSendFileMetadata {
  return {
    filePath: file.filePath,
    ...(file.fileRef ? { fileRef: file.fileRef } : {}),
    fileName: file.fileName,
    mimeType: file.mimeType,
    ...(file.extension ? { extension: file.extension } : {}),
    size: file.size,
    sha256: file.sha256
  }
}

function expandHomePath(value: string): string {
  if (value === '~') {
    return homedir()
  }
  if (value.startsWith('~/')) {
    return resolve(homedir(), value.slice(2))
  }
  return value
}

/** Convert the tool descriptor into the compact locator accepted by the platform. */
function toWorkspaceFileLocator(descriptor: WechatSendFileDescriptor): WorkspaceFileLocator {
  const fileRefPath = normalizeString(descriptor.fileRef?.filePath) || normalizeString(descriptor.fileRef?.workspacePath)
  if (fileRefPath) {
    return {
      ...descriptor.fileRef,
      source: WORKSPACE_FILES_SOURCE,
      filePath: fileRefPath,
      workspacePath: normalizeString(descriptor.fileRef?.workspacePath) || fileRefPath,
      originalName: descriptor.originalName,
      name: descriptor.name,
      mimeType: descriptor.mimeType || descriptor.mimetype,
      size: descriptor.size
    } as WorkspacePortableFileReference
  }

  return {
    path: descriptor.path,
    filePath: descriptor.filePath,
    workspacePath: descriptor.workspacePath,
    originalName: descriptor.originalName,
    name: descriptor.name,
    mimeType: descriptor.mimeType,
    mimetype: descriptor.mimetype,
    size: descriptor.size
  }
}

function resolveFileExtension(
  fileName: string,
  filePath: string,
  explicit?: string | null
): string | undefined {
  const normalizedExplicit = normalizeString(explicit).replace(/^\./, '').toLowerCase()
  if (normalizedExplicit) {
    return normalizedExplicit
  }
  return (
    extname(fileName).replace(/^\./, '').toLowerCase() ||
    extname(filePath).replace(/^\./, '').toLowerCase() ||
    undefined
  )
}
