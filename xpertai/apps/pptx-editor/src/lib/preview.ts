import { ConflictException, ForbiddenException, Inject, Injectable, Logger, Optional } from '@nestjs/common'
import { createHash } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import { MANAGED_QUEUE_SERVICE_TOKEN, ProjectFilesRuntimeCapability, SandboxJobsRuntimeCapability,
  WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, SYSTEM_GLOBAL_SCOPE,
  type ManagedQueueJobContext, type ManagedQueueService, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { PptxFiles, type PptxFileInput } from './files.js'
import { PptxEngine } from './ai-engine.js'
import { PPTX_PLUGIN, PPTX_EDITOR } from './constants.js'

export const PPTX_COVER_ACTION = 'pptx.cover'
export const PPTX_COVER_VERSION = '1.0.0'
export const PPTX_COVER_QUEUE = 'pptx.cover'
export type CoverJob = { projectId: string; requestId: string }
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex')
const requestHash = (actor: PptxFileInput['actor'], record: Buffer) => sha(Buffer.concat([
  Buffer.from(JSON.stringify([actor.tenantId, actor.organizationId, actor.userId])), record]))
const checksum = z.string().regex(/^[a-f0-9]{64}$/)
const pending = z.object({ hash: checksum, assistantId: z.string().optional(),
  source: z.object({ providerKey: z.string(), resourceId: z.string() }).strict().optional(),
  path: z.string().optional() }).strict().refine(value => Boolean(value.source) !== Boolean(value.path))
const requestPath = (id: string) => `presentation-previews/requests/${id}.json`
const coverPath = (hash: string) => `presentation-previews/v1-${hash}.png`
const missing = (error: unknown) => !!error && typeof error === 'object' && 'code' in error && error.code === 'ENOENT'
const conflict = (error: unknown) => !!error && typeof error === 'object' && 'status' in error && error.status === 409
const png = (bytes: Buffer) => bytes.length > 24 && bytes.length <= 4 * 1024 * 1024
  && bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))

/** Derived images are version-bound; browser work stays in the platform's isolated Runtime. */
@Injectable()
export class PptxPreview {
  private readonly logger = new Logger('PptxPreview')
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    private readonly files: PptxFiles, private readonly engine: PptxEngine,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService) {}

  private reference(input: PptxFileInput, filePath: string) {
    return { ...input.actor, source: 'platform.workspace.files' as const, catalog: 'projects' as const,
      projectId: input.projectId, scopeId: input.projectId, filePath, workspacePath: filePath }
  }
  private async writeOnce(input: PptxFileInput, path: string, buffer: Buffer) {
    const api = this.runtime.require(ProjectFilesRuntimeCapability)
    try { await api.write({ ...input, path, buffer, expectedHash: null }) }
    catch (error) {
      if (!conflict(error)) throw error
      const existing = await api.read({ ...input, path })
      if (!existing.buffer.equals(buffer)) throw new ConflictException('pptx.preview_conflict')
    }
  }
  async create(input: PptxFileInput): Promise<string | undefined> {
    const buffer = await this.files.previewSource(input), hash = sha(buffer)
    try {
      const projectFiles = this.runtime.require(ProjectFilesRuntimeCapability)
      try {
        const existing = await projectFiles.read({ ...input, path: coverPath(hash) })
        if (png(existing.buffer)) return hash
        return undefined
      } catch (error) { if (!missing(error)) throw error }
      const jobs = this.runtime.get(SandboxJobsRuntimeCapability)
      if (!jobs || !this.queue) return undefined
      const health = await jobs.getActionHealth({ pluginName: PPTX_PLUGIN, action: PPTX_COVER_ACTION, actionVersion: PPTX_COVER_VERSION })
      if (!health.available || !(await this.queue.getExecutionPoolHealth({ executionPool: 'sandbox-browser' })).available) return undefined
      const record = Buffer.from(JSON.stringify({ hash, assistantId: input.assistantId,
        ...('source' in input ? { source: input.source } : { path: input.path }) }))
      const requestId = requestHash(input.actor, record)
      await this.writeOnce(input, requestPath(requestId), record)
      const queued = await this.queue.enqueue({ ...input.actor, pluginName: PPTX_PLUGIN,
        queueName: PPTX_COVER_QUEUE, jobName: 'render', scopeKey: SYSTEM_GLOBAL_SCOPE,
        payload: { projectId: input.projectId, requestId } satisfies CoverJob,
        jobId: `pptx-cover-${input.projectId}-${requestId}`, executionPool: 'sandbox-browser', attempts: 1,
        removeOnComplete: { age: 3600, count: 100 }, removeOnFail: { age: 3600, count: 100 } })
      // The browser runs only in the background processor. Slow previews never hold up delivery indefinitely.
      const deadline = Date.now() + 25000
      do {
        const job = await this.queue.getJob({ jobId: queued.jobId, executionPool: 'sandbox-browser' })
        if (!job || job.state === 'failed') return undefined
        if (job.state === 'completed') {
          await this.resolve(input, hash)
          return hash
        }
        await delay(500)
      } while (Date.now() < deadline)
      return undefined
    } catch {
      this.logger.warn('PPTX cover unavailable; file delivery remains available')
      return undefined
    }
  }
  /** Reconstruct all authority from restored queue ownership, independently of the originating request. */
  async process(data: CoverJob, context: ManagedQueueJobContext) {
    const { projectId, requestId } = z.object({ projectId: z.string().min(1), requestId: checksum }).strict().parse(data)
    if (context.pluginName !== PPTX_PLUGIN || context.queueName !== PPTX_COVER_QUEUE || context.jobName !== 'render'
      || context.scopeKey !== SYSTEM_GLOBAL_SCOPE || !context.tenantId || !context.organizationId || !context.userId)
      throw new ForbiddenException('pptx.preview_scope_invalid')
    const actor = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId }
    const record = await this.runtime.require(ProjectFilesRuntimeCapability).read({ actor, projectId, path: requestPath(requestId) })
    if (requestHash(actor, record.buffer) !== requestId)
      throw new ForbiddenException('pptx.preview_scope_invalid')
    const saved = pending.parse(JSON.parse(record.buffer.toString('utf8')))
    const input: PptxFileInput = { actor, projectId, ...(saved.assistantId ? { assistantId: saved.assistantId } : {}),
      ...(saved.source ? { source: saved.source } : { path: saved.path!, editorKey: PPTX_EDITOR }) }
    const buffer = await this.files.previewSource(input), hash = sha(buffer)
    if (hash !== saved.hash) throw new ConflictException('pptx.preview_stale')
    const jobs = this.runtime.require(SandboxJobsRuntimeCapability)
    const health = await jobs.getActionHealth({ pluginName: PPTX_PLUGIN, action: PPTX_COVER_ACTION, actionVersion: PPTX_COVER_VERSION })
    if (!health.available) throw new Error('pptx.preview_runtime_unavailable')
    const result = await this.engine.run({ action: 'render', buffer, offset: 0, limit: 1 })
    if (!result.html) throw new Error('pptx.preview_empty')
    const html = Buffer.from(result.html), inputPath = `presentation-previews/v1-${hash}.html`
    await this.writeOnce(input, inputPath, html)
    const rendered = await jobs.run({ action: PPTX_COVER_ACTION, actionVersion: PPTX_COVER_VERSION,
      // Sandbox input identity includes the restored actor and exact source reference.
      // Different actors may share cached pixels, but must not share an execution claim.
      idempotencyKey: `pptx-cover:${PPTX_COVER_VERSION}:${input.projectId}:${requestId}`,
      scope: { ...input.actor, pluginName: PPTX_PLUGIN, businessResourceType: 'pptx-cover', businessResourceId: hash },
      payload: {}, files: [{ reference: this.reference(input, inputPath), targetPath: 'slide.html', size: html.length, sha256: sha(html) }],
      outputs: [{ path: 'cover.png', originalName: 'cover.png', mimeType: 'image/png',
        destination: { ...input.actor, catalog: 'projects', projectId: input.projectId, scopeId: input.projectId, folder: 'presentation-previews/rendered' } }],
      timeoutMs: 20000 })
    const output = rendered.outputs.find(item => item.path === 'cover.png' && item.mimeType === 'image/png')
    if (!output) throw new Error('pptx.preview_empty')
    const image = await this.runtime.require(WorkspaceFilesRuntimeCapability).readBuffer(output.reference)
    if (!png(image.buffer) || sha(image.buffer) !== output.sha256) throw new Error('pptx.invalid_preview')
    // Recheck the actual source after rendering; never attach an earlier cover to a newer file.
    if (sha(await this.files.previewSource(input)) !== hash) throw new ConflictException('pptx.preview_stale')
    await this.writeOnce(input, coverPath(hash), image.buffer)
    await this.writeOnce(input, `presentation-previews/requests/${requestId}.result.json`, Buffer.from(JSON.stringify({
      sandboxJobId: rendered.id, sha256: output.sha256, size: image.buffer.length, reference: output.reference })))
  }
  async resolve(input: PptxFileInput, expectedHash: string) {
    if (sha(await this.files.previewSource(input)) !== expectedHash) throw new ConflictException('pptx.preview_stale')
    const filePath = coverPath(expectedHash)
    const image = await this.runtime.require(ProjectFilesRuntimeCapability).read({ ...input, path: filePath })
    if (!png(image.buffer)) throw new Error('pptx.invalid_preview')
    return { reference: this.reference(input, filePath), fileName: 'cover.png', mimeType: 'image/png', size: image.buffer.length }
  }
}
