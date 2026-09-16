import { Inject, Injectable, Optional, ServiceUnavailableException } from '@nestjs/common'
import { createHash } from 'node:crypto'
import {
  isSandboxJobRuntimeError,
  SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type AgentMiddlewareRuntimeCapabilityRegistry,
  type WorkspaceFileScope
} from '@xpert-ai/plugin-sdk'
import { z } from 'zod'
import {
  PACKAGE_NAME,
  ACTION,
  ACTION_VERSION,
  FILE_TYPES,
  ParserConfigSchema,
  type OpenDataLoaderParserConfig
} from './types.js'
// Compatible with installed SDK releases predating organization-scoped Workspace Files.
export type OpenDataLoaderFileScope = WorkspaceFileScope & { organizationId?: string | null }
const failureSchema = z.object({
  ok: z.literal(false),
  code: z.enum([
    'EMPTY_FILE',
    'EMPTY_TEXT',
    'INPUT_TOO_LARGE',
    'OUTPUT_TOO_LARGE',
    'INVALID_DOCUMENT',
    'ENCRYPTED',
    'UNSUPPORTED_FORMAT',
    'NEEDS_OCR',
    'OCR_FAILED',
    'INCOMPLETE_PAGES',
    'RESOURCE_LIMIT',
    'RUNTIME_INVALID',
    'INVALID_CONFIG'
  ]),
  pages: z.array(z.number().int().positive().max(10000)).max(100).optional()
})
const resultSchema = z.discriminatedUnion('ok', [
  failureSchema,
  z.object({
    ok: z.literal(true),
    markdown: z.string().min(1),
    pages: z
      .array(z.object({ page: z.number().int().positive(), markdown: z.string() }))
      .max(10000)
      .optional(),
    assets: z
      .array(
        z.object({
          name: z.string().regex(/^[a-zA-Z0-9_-]+\.[a-zA-Z0-9]+$/),
          mimeType: z.string().max(100),
          data: z.string(),
          size: z
            .number()
            .int()
            .nonnegative()
            .max(128 * 1024 * 1024),
          sha256: z.string().regex(/^[a-f0-9]{64}$/),
          page: z.number().int().positive().optional()
        })
      )
      .max(1000)
  })
])

@Injectable()
export class OpenDataLoaderSandboxConverter {
  constructor(
    @Optional()
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    private readonly capabilities?: Pick<AgentMiddlewareRuntimeCapabilityRegistry, 'get'>
  ) {}

  async checkHealth() {
    const { jobs } = this.runtime()
    const health = await jobs.getActionHealth({
      pluginName: PACKAGE_NAME,
      action: ACTION,
      actionVersion: ACTION_VERSION
    })
    if (!health.available)
      throw new ServiceUnavailableException(
        health.reason === 'ACTION_MISSING'
          ? 'OpenDataLoader Sandbox Action is missing (ACTION_MISSING). Install OpenDataLoader as a system plugin, then restart the API.'
          : `OpenDataLoader Sandbox Runtime is unavailable (${health.reason ?? 'RUNTIME_UNBOUND'}). ${
              health.message ?? 'Check the platform Sandbox Runtime configuration.'
            }`
      )
    return health
  }

  async convert(
    filePath: string,
    extension: string,
    options: OpenDataLoaderParserConfig & {
      fileScope?: OpenDataLoaderFileScope
      documentId?: string
      stage: 'test' | 'prod'
      signal?: AbortSignal
    }
  ) {
    const parserConfig = ParserConfigSchema.parse(options)
    if (!FILE_TYPES.includes(extension)) throw new Error(`OpenDataLoader does not support this file type: ${extension}`)
    const scope = options.fileScope
    if (!scope?.tenantId || scope.catalog !== 'knowledges' || !scope.scopeId) {
      throw new Error('OpenDataLoader requires the host knowledge-base file scope')
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
    if (!source.buffer.length) throw new Error('OPENDATALOADER_EMPTY_FILE')
    if (source.buffer.length > 100 * 1024 * 1024) throw new Error('OPENDATALOADER_INPUT_TOO_LARGE')
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
        ACTION_VERSION,
        health.sandboxRuntimeVersion,
        health.artifactDigest,
        health.manifest?.dependenciesSha256,
        parserConfig
      ])
    )
    // A retry reattaches Core's existing Job; cancellation must target that same ID.
    const jobId = jobIdFromIdentity(identity)
    const folder = `opendataloader/jobs/${identity}`
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
      const result = await jobs
        .run({
          jobId,
          action: ACTION,
          actionVersion: ACTION_VERSION,
          idempotencyKey: `opendataloader:${identity}`,
          scope: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            userId: scope.userId,
            pluginName: PACKAGE_NAME,
            businessResourceType: 'knowledge-document',
            businessResourceId: options.documentId ?? identity
          },
          payload: { extension, ...parserConfig },
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
        .catch(rethrowConversionFailure)
      options.signal?.throwIfAborted()
      const output = result.outputs.find((item) => item.path === 'result.json')
      if (!output || output.size > 128 * 1024 * 1024)
        throw new Error('OpenDataLoader Sandbox output is missing or exceeds its limit')
      const content = await files.readBuffer(output.reference)
      if (content.buffer.length > 128 * 1024 * 1024) throw new Error('OPENDATALOADER_OUTPUT_TOO_LARGE')
      if (content.buffer.length !== output.size || sha256(content.buffer) !== output.sha256) {
        throw new Error('OpenDataLoader Sandbox output integrity check failed')
      }
      const converted = resultSchema.parse(JSON.parse(content.buffer.toString('utf8')))
      if (converted.ok === false)
        throw Object.assign(new Error(`OPENDATALOADER_${converted.code}`), { pages: converted.pages })
      let decodedSize = Buffer.byteLength(converted.markdown)
      const names = new Set<string>()
      for (const asset of converted.assets) {
        const data = Buffer.from(asset.data, 'base64')
        if (
          names.has(asset.name) ||
          data.toString('base64') !== asset.data ||
          data.length !== asset.size ||
          sha256(data) !== asset.sha256
        )
          throw new Error('OPENDATALOADER_INVALID_DOCUMENT')
        names.add(asset.name)
        decodedSize += data.length
        if (decodedSize > 128 * 1024 * 1024) throw new Error('OPENDATALOADER_OUTPUT_TOO_LARGE')
      }
      if (!converted.markdown.trim()) throw new Error('OPENDATALOADER_EMPTY_TEXT')
      return { ...converted, sandboxJobId: result.id, runtimeProfile: result.runtimeProfile }
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
        'OpenDataLoader requires platform Sandbox Jobs and Workspace Files. Update and restart the API.'
      )
    return { jobs, files }
  }
}

/** Restore only the bounded error envelope emitted by this Action, retaining other Runtime failures. */
function rethrowConversionFailure(error: unknown): never {
  if (isSandboxJobRuntimeError(error)) {
    const match = error.message.match(/^OPENDATALOADER_CONVERSION_ERROR: (\{[^\r\n]{1,2048}\})$/m)
    let failure: z.infer<typeof failureSchema> | undefined
    if (match) {
      try {
        const parsed = failureSchema.safeParse(JSON.parse(match[1]))
        if (parsed.success) failure = parsed.data
      } catch {
        // Malformed or truncated output remains the original Runtime error.
      }
    }
    if (failure) throw Object.assign(new Error(`OPENDATALOADER_${failure.code}`), { pages: failure.pages })
  }
  throw error
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
