import { posix } from 'node:path'
import type {
  WorkspaceFileLocator,
  WorkspaceFilesApi,
  WorkspacePortableFileReference
} from '@xpert-ai/plugin-sdk'
import type { PresentationScope } from './types.js'

export interface PresentationWorkspaceFileInput {
  path?: string
  filePath?: string
  workspacePath?: string
  fileRef?: WorkspacePortableFileReference
  originalName?: string
  name?: string
  mimeType?: string
  size?: number
}

/**
 * Resolve tool-facing file inputs through the platform Workspace contract.
 *
 * Legacy Xpert file-analysis output can expose the host-side session path. We
 * never read that path directly: only the typed current-conversation session
 * layout is translated back to its sandbox-visible `/workspace/...` locator.
 */
export function presentationWorkspaceFileLocator(
  input: string | PresentationWorkspaceFileInput,
  scope: Pick<PresentationScope, 'conversationId'>
): WorkspaceFileLocator {
  if (typeof input === 'string') return normalizeRuntimeFilePath(input, scope.conversationId)
  if (input.fileRef) return input.fileRef

  // Match WorkspaceFilesApi's documented descriptor precedence.
  const rawPath = input.filePath ?? input.workspacePath ?? input.path
  if (!rawPath) throw new Error('path, filePath, workspacePath, or fileRef is required.')

  return {
    path: normalizeRuntimeFilePath(rawPath, scope.conversationId),
    originalName: input.originalName,
    name: input.name,
    mimeType: input.mimeType,
    size: input.size
  }
}

export async function readPresentationWorkspaceFile(
  files: Pick<WorkspaceFilesApi, 'readRuntimeBuffer'>,
  scope: Pick<PresentationScope, 'conversationId'>,
  input: string | PresentationWorkspaceFileInput
) {
  const locator = presentationWorkspaceFileLocator(input, scope)
  try {
    return await files.readRuntimeBuffer(locator)
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    if (!/\b(?:Conversation|Workspace) file not found\b/i.test(message)) throw error

    throw new Error(
      `Presentation Workspace file not found at ${displayLocator(locator)}. ` +
      'Use the workspacePath returned by the current attachment or parsed-file tool; do not reuse a path from another conversation.'
    )
  }
}

function normalizeRuntimeFilePath(value: string, conversationId?: string | null) {
  const raw = value.trim().replace(/\\/g, '/')
  if (!raw) throw new Error('Workspace file path is required.')
  if (raw.includes('\0')) throw new Error('Workspace file path contains invalid characters.')

  const segments = raw.split('/').filter(Boolean)
  if (!segments.length || segments.some(segment => segment === '..')) {
    throw new Error('Workspace file path is invalid.')
  }

  if (!posix.isAbsolute(raw)) return posix.normalize(segments.join('/'))

  if (segments[0] === 'workspace') {
    if (segments.length === 1) throw new Error('Workspace file path must point to a file below /workspace.')
    return `/${posix.normalize(segments.join('/'))}`
  }

  const sessionIndex = findCurrentSessionFilesIndex(segments, conversationId)
  if (sessionIndex >= 0) {
    return `/workspace/${segments.slice(sessionIndex).join('/')}`
  }

  const foreignSessionIndex = segments.findIndex((segment, index) =>
    segment === 'sessions' && segments[index + 2] === 'files'
  )
  if (foreignSessionIndex >= 0) {
    throw new Error('Host session file path does not belong to the current conversation.')
  }

  throw new Error(
    'Absolute file paths must be Workspace locators or files from the current conversation session.'
  )
}

function findCurrentSessionFilesIndex(segments: string[], conversationId?: string | null) {
  if (!conversationId) return -1
  return segments.findIndex((segment, index) =>
    segment === 'sessions' &&
    segments[index + 1] === conversationId &&
    segments[index + 2] === 'files' &&
    Boolean(segments[index + 3])
  )
}

function displayLocator(locator: WorkspaceFileLocator) {
  if (typeof locator === 'string') return locator
  return locator.workspacePath ?? locator.filePath ?? ('path' in locator ? locator.path : undefined) ?? '[unknown locator]'
}
