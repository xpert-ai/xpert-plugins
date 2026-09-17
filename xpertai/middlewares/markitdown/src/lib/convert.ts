import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFileScope
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import { MARKITDOWN_PACKAGE_NAME } from './types.js'

export const MARKITDOWN_FILE_TYPES = ['pdf', 'docx', 'pptx', 'html', 'htm', 'txt', 'md', 'markdown']
export const MARKITDOWN_ACTION = 'markitdown.convert'
export const MARKITDOWN_ACTION_VERSION = '1.1.0'
// Compatible with installed SDK releases predating organization-scoped Workspace Files.
export type MarkItDownFileScope = WorkspaceFileScope & { organizationId?: string | null }
const resultSchema = z.object({
  markdown: z.string().min(1),
  title: z.string().nullable().optional(),
  pages: z
    .array(
      z.object({
        page: z.number().int().positive(),
        markdown: z.string(),
        needsOcr: z.boolean(),
        blank: z.boolean()
      })
    )
    .optional()
})

@Injectable()
export class MarkItDownSandboxConverter {
  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: Pick<AgentMiddlewareRuntimeCapabilityRegistry, 'get'>
  ) {}

  async checkHealth() {
    const { jobs } = this.runtime()
    const health = await jobs.getActionHealth({
      pluginName: MARKITDOWN_PACKAGE_NAME,
      action: MARKITDOWN_ACTION,
      actionVersion: MARKITDOWN_ACTION_VERSION
    })
    if (!health.available)
      throw new ServiceUnavailableException(
        health.reason === 'ACTION_MISSING'
          ? 'MarkItDown Sandbox Action is missing (ACTION_MISSING). Install the updated MarkItDown as a system plugin, remove the legacy organization installation, then restart the API.'
          : `MarkItDown Sandbox Runtime is unavailable (${health.reason ?? 'RUNTIME_UNBOUND'}). ${
              health.message ?? 'Check the platform Sandbox Runtime configuration.'
            }`
      )
    return health
  }

  async convert(
    filePath: string,
    extension: string,
    options: {
      fileScope?: MarkItDownFileScope
      documentId?: string
      stage: 'test' | 'prod'
      signal?: AbortSignal
    }
  ) {
    if (!MARKITDOWN_FILE_TYPES.includes(extension))
      throw new Error(`MarkItDown does not support this file type: ${extension}`)
    const scope = options.fileScope
    if (!scope?.tenantId || scope.catalog !== 'knowledges' || !scope.scopeId) {
      throw new Error('MarkItDown requires the host knowledge-base file scope')
    }
    options.signal?.throwIfAborted()
    const health = await this.checkHealth()
    const { files, jobs } = this.runtime()
    const reference = await files.resolveRuntimeReference({
      ...scope,
      source: 'platform.workspace.files',
      filePath,
      workspacePath: filePath
    })
    const source = await files.readBuffer(reference)
    if (!source.buffer.length) throw new Error('MARKITDOWN_EMPTY_FILE')
    if (source.buffer.length > 100 * 1024 * 1024) throw new Error('MARKITDOWN_INPUT_TOO_LARGE')
    const checksum = sha256(source.buffer)
    const identity = sha256(
      JSON.stringify([
        scope.tenantId,
        scope.organizationId,
        scope.userId,
        scope.scopeId,
        options.documentId,
        reference.filePath,
        extension,
        checksum,
        options.stage,
        MARKITDOWN_ACTION_VERSION,
        health.sandboxRuntimeVersion,
        health.artifactDigest
      ])
    )
    // A retry reattaches Core's existing Job; cancellation must target that same ID.
    const jobId = jobIdFromIdentity(identity)
    const folder = `markitdown/jobs/${identity}`
    options.signal?.throwIfAborted()
    let cancelRetry: ReturnType<typeof setInterval> | undefined
    const cancel = () => {
      // Abort can arrive before Core persists the Job. Retry until it exists or run() settles.
      const attempt = () =>
        void jobs
          .cancel({ jobId })
          .then(() => clearInterval(cancelRetry))
          .catch(() => undefined)
      cancelRetry = setInterval(attempt, 100)
      cancelRetry.unref()
      attempt()
    }
    options.signal?.addEventListener('abort', cancel, { once: true })
    try {
      const result = await jobs.run({
        jobId,
        action: MARKITDOWN_ACTION,
        actionVersion: MARKITDOWN_ACTION_VERSION,
        idempotencyKey: `markitdown:${identity}`,
        scope: {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          userId: scope.userId,
          pluginName: MARKITDOWN_PACKAGE_NAME,
          businessResourceType: 'knowledge-document',
          businessResourceId: options.documentId ?? identity
        },
        payload: { extension: extension === 'markdown' ? 'md' : extension },
        files: [{ reference, targetPath: 'source.bin', size: source.buffer.length, sha256: checksum }],
        outputs: [
          {
            path: 'result.json',
            originalName: 'result.json',
            mimeType: 'application/json',
            destination: { ...scope, folder }
          }
        ],
        timeoutMs: 300000
      })
      options.signal?.throwIfAborted()
      const output = result.outputs.find((item) => item.path === 'result.json')
      if (!output || output.size > 128 * 1024 * 1024)
        throw new Error('MarkItDown Sandbox output is missing or exceeds its limit')
      const content = await files.readBuffer(output.reference)
      if (content.buffer.length !== output.size || sha256(content.buffer) !== output.sha256) {
        throw new Error('MarkItDown Sandbox output integrity check failed')
      }
      const converted = resultSchema.parse(JSON.parse(content.buffer.toString('utf8')))
      if (!converted.markdown.trim()) throw new Error('MARKITDOWN_EMPTY_TEXT')
      return { ...converted, sandboxJobId: result.id, runtimeProfile: result.runtimeProfile }
    } catch (error) {
      const code =
        error instanceof Error &&
        error.message.match(
          /\bMARKITDOWN_(?:EMPTY_FILE|EMPTY_TEXT|INPUT_TOO_LARGE|OUTPUT_TOO_LARGE|INVALID_DOCUMENT)\b/
        )?.[0]
      if (code) throw new Error(code)
      throw error
    } finally {
      options.signal?.removeEventListener('abort', cancel)
      clearInterval(cancelRetry)
    }
  }

  private runtime() {
    const jobs = this.capabilities?.get(SandboxJobsRuntimeCapability)
    const files = this.capabilities?.get(WorkspaceFilesRuntimeCapability)
    if (!jobs || !files)
      throw new ServiceUnavailableException(
        'MarkItDown requires platform Sandbox Jobs and Workspace Files. Update and restart the API.'
      )
    return { jobs, files }
  }
}

function sha256(value: Buffer | string): string {
  return createHash('sha256').update(value).digest('hex')
}

/** UUIDv8 derived from the tenant-scoped conversion identity. */
function jobIdFromIdentity(identity: string): string {
  const bytes = Buffer.from(identity.slice(0, 32), 'hex')
  bytes[6] = (bytes[6] & 0x0f) | 0x80
  bytes[8] = (bytes[8] & 0x3f) | 0x80
  const hex = bytes.toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`
}
