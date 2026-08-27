import { createHash } from 'node:crypto'
import {
  WorkspaceFilesRuntimeCapability,
  type IAgentMiddlewareContext,
  type WorkspaceFileLocator,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { WECOM_MAX_FILE_BYTES } from '../constants.js'
import { WeComConnectorError } from '../errors.js'
import type { WorkspaceFileInput } from '../tools/schemas.js'

export async function prepareWorkspaceFile(context: IAgentMiddlewareContext, input: WorkspaceFileInput) {
  const files = requireWorkspaceFiles(context)
  const file = await files.readRuntimeBuffer(fileLocator(input))
  if (!file.buffer.length || file.buffer.length > WECOM_MAX_FILE_BYTES) {
    throw new WeComConnectorError(
      'FILE_TOO_LARGE',
      `WeCom files must be non-empty and no larger than ${WECOM_MAX_FILE_BYTES} bytes.`
    )
  }
  const fileName = safeFileName(input.name ?? input.originalName ?? file.name)
  return {
    buffer: file.buffer,
    fileName,
    mimeType: input.mimeType ?? file.mimeType ?? 'application/octet-stream',
    size: file.buffer.length,
    sha256: createHash('sha256').update(file.buffer).digest('hex'),
    workspacePath: file.workspacePath ?? file.reference.workspacePath ?? file.reference.filePath
  }
}

export function requireWorkspaceFiles(context: IAgentMiddlewareContext): WorkspaceFilesApi {
  const files = context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
  if (!files) {
    throw new WeComConnectorError(
      'WORKSPACE_FILES_UNAVAILABLE',
      'Workspace Files is required to send a file through WeCom.'
    )
  }
  return files
}

export function fileLocator(input: WorkspaceFileInput): WorkspaceFileLocator {
  return input.fileRef ?? input.workspacePath ?? input.filePath ?? input.path ?? ''
}

export function safeFileName(value: string) {
  const normalized = value
    .replace(/[\\/\0]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
  return (normalized || 'file').slice(0, 240)
}
