import { createHash } from 'node:crypto'
import {
  WorkspaceFilesRuntimeCapability,
  type IAgentMiddlewareContext,
  type WorkspaceFileLocator,
  type WorkspaceFilesApi
} from '@xpert-ai/plugin-sdk'
import { QqMailConnectorError } from '../errors.js'
import type { QqMailAccount } from '../mcp/types.js'
import type { WorkspaceFileInput } from '../tools/schemas.js'

export function requireWorkspaceFiles(context: IAgentMiddlewareContext): WorkspaceFilesApi {
  const files = context.runtime.capabilities?.get(WorkspaceFilesRuntimeCapability)
  if (!files) {
    throw new QqMailConnectorError('WORKSPACE_FILES_UNAVAILABLE', 'Workspace Files is required for QQ Mail attachments')
  }
  return files
}

export async function prepareAttachments(
  context: IAgentMiddlewareContext,
  account: QqMailAccount,
  inputs: WorkspaceFileInput[] | undefined
) {
  if (!inputs?.length) return undefined
  const constraints = account.constraints
  if (
    !constraints.maxAttachmentCount ||
    !constraints.maxAttachmentSizeBytes ||
    !constraints.maxTotalAttachmentsSizeBytes
  ) {
    throw new QqMailConnectorError(
      'MCP_TOOL_FAILED',
      'QQ Mail did not report attachment constraints; attachments cannot be sent safely'
    )
  }
  if (inputs.length > constraints.maxAttachmentCount) {
    throw new QqMailConnectorError(
      'ATTACHMENT_TOO_LARGE',
      `QQ Mail allows at most ${constraints.maxAttachmentCount} attachments`
    )
  }
  const files = requireWorkspaceFiles(context)
  const prepared: Array<Record<string, unknown>> = []
  let totalSize = 0
  for (const input of inputs) {
    const file = await files.readRuntimeBuffer(fileLocator(input))
    if (!file.buffer.length || file.buffer.length > constraints.maxAttachmentSizeBytes) {
      throw new QqMailConnectorError(
        'ATTACHMENT_TOO_LARGE',
        `Attachment '${input.name ?? file.name}' must be non-empty and no larger than ${
          constraints.maxAttachmentSizeBytes
        } bytes`
      )
    }
    totalSize += file.buffer.length
    if (totalSize > constraints.maxTotalAttachmentsSizeBytes) {
      throw new QqMailConnectorError(
        'ATTACHMENT_TOO_LARGE',
        `QQ Mail attachments exceed ${constraints.maxTotalAttachmentsSizeBytes} total bytes`
      )
    }
    prepared.push({
      filename: safeFileName(input.name ?? file.name),
      content_type: file.mimeType ?? 'application/octet-stream',
      content: file.buffer.toString('base64'),
      size: file.buffer.length,
      sha1: createHash('sha1').update(file.buffer).digest('hex')
    })
  }
  return prepared
}

export function safeFileName(value: string) {
  const normalized = value
    .replace(/[\\/\0]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
  return (normalized || 'attachment').slice(0, 240)
}

export function fileLocator(input: WorkspaceFileInput): WorkspaceFileLocator {
  return input.fileRef ?? input.workspacePath ?? input.filePath ?? input.path ?? ''
}
