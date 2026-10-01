import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join } from 'node:path'
import type { WorkspaceFileLocator, WorkspaceFilesApi } from '@xpert-ai/plugin-sdk'
import { ZSXQ_MAX_ATTACHMENT_BYTES, ZSXQ_MAX_ATTACHMENTS } from '../constants.js'
import { ZsxqConnectorError } from '../errors.js'
import type { WorkspaceFileInput } from '../tools/schemas.js'

export type StagedZsxqFiles = {
  paths: string[]
  names: string[]
  totalBytes: number
  cleanup(): Promise<void>
}

export async function stageWorkspaceFiles(
  files: WorkspaceFilesApi,
  inputs: readonly WorkspaceFileInput[],
  options?: { imagesOnly?: boolean; maxFiles?: number }
): Promise<StagedZsxqFiles> {
  const maxFiles = Math.min(options?.maxFiles ?? ZSXQ_MAX_ATTACHMENTS, ZSXQ_MAX_ATTACHMENTS)
  if (!inputs.length || inputs.length > maxFiles) {
    throw new ZsxqConnectorError('FILE_INVALID', `Provide between 1 and ${maxFiles} attachments.`)
  }
  const directory = await mkdtemp(join(tmpdir(), 'xpert-zsxq-'))
  await mkdir(directory, { recursive: true, mode: 0o700 })
  const paths: string[] = []
  const names: string[] = []
  let totalBytes = 0
  try {
    for (const [index, input] of inputs.entries()) {
      const source = await files.readRuntimeBuffer(fileLocator(input))
      const size = source.size ?? source.buffer.length
      if (!source.buffer.length || size !== source.buffer.length || (input.size !== undefined && input.size !== size)) {
        throw new ZsxqConnectorError(
          'FILE_INVALID',
          'Attachment is empty or its declared size does not match its content.'
        )
      }
      totalBytes += size
      if (size > ZSXQ_MAX_ATTACHMENT_BYTES || totalBytes > ZSXQ_MAX_ATTACHMENT_BYTES) {
        throw new ZsxqConnectorError(
          'FILE_TOO_LARGE',
          `Attachments may total at most ${ZSXQ_MAX_ATTACHMENT_BYTES} bytes.`
        )
      }
      const name = safeFileName(input.originalName ?? input.name ?? source.name ?? `attachment-${index + 1}`)
      const mimeType = input.mimeType ?? source.mimeType
      if (options?.imagesOnly && !isImage(name, mimeType)) {
        throw new ZsxqConnectorError('FILE_INVALID', `Attachment '${name}' must be an image.`)
      }
      const path = join(directory, `${index + 1}-${name}`)
      await writeFile(path, source.buffer, { mode: 0o600 })
      paths.push(path)
      names.push(name)
    }
    return { paths, names, totalBytes, cleanup: () => rm(directory, { recursive: true, force: true }) }
  } catch (error) {
    await rm(directory, { recursive: true, force: true })
    throw error
  }
}

export function attachmentDisplayNames(inputs: readonly WorkspaceFileInput[] | undefined): string[] {
  return (inputs ?? []).map((input, index) =>
    safeFileName(
      input.originalName ??
        input.name ??
        (basename(input.workspacePath ?? input.filePath ?? input.path ?? '') || `attachment-${index + 1}`)
    )
  )
}

function fileLocator(input: WorkspaceFileInput): WorkspaceFileLocator {
  return input.fileRef ?? input.workspacePath ?? input.filePath ?? input.path ?? ''
}

function safeFileName(value: string): string {
  const safe = value
    .replace(/[\\/\0-\x1f\x7f]/g, '_')
    .replace(/^\.+$/, '_')
    .trim()
  return (safe || 'attachment').slice(0, 240)
}

function isImage(name: string, mimeType: string | undefined): boolean {
  if (mimeType) return mimeType.toLowerCase().startsWith('image/')
  return /\.(avif|bmp|gif|heic|heif|jpe?g|png|webp)$/i.test(name)
}
