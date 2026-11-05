import { Inject, Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod/v3'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { MANAGED_QUEUE_SERVICE_TOKEN, PluginJobProcessor, WorkspaceFilesRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type ManagedQueueJob, type ManagedQueueJobContext, type ManagedQueueService, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import { artifactDocumentDependencyAssets, type ArtifactDocumentDependencyAsset } from '@xpert-ai/plugin-sdk/artifact-document'
import { DashboardService, PLUGIN_NAME } from './dashboard.service'
import { dashboardSchema, type DashboardManifest } from './dashboard.schema'

const TTL = 86400, MAX_RUNTIME = 10 * 60_000, WAIT_MS = 20_000
const hash = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const key = (scope: { tenantId?: string | null; organizationId?: string | null }, id: string) => {
  if (!scope.tenantId || !scope.organizationId) throw new Error('DASHBOARD_SAVE_REQUEST_DENIED')
  return `live_dashboard:save:${scope.tenantId}:${scope.organizationId}:${id}`
}
const contextSchema = z.object({ tenantId: z.string().uuid(), organizationId: z.string().uuid(), userId: z.string().uuid(),
  hostType: z.enum(['agent', 'project']), hostId: z.string().uuid(), projectId: z.string().uuid().optional() }).strict()
const fileSchema = z.object({ filePath: z.string(), workspacePath: z.string(), sha256: z.string(), size: z.number() }).strict()
const receiptSchema = z.object({ artifactId: z.string().uuid(), draftId: z.string(), draftRevision: z.number(), baseVersionId: z.string().nullable(), status: z.literal('draft'), title: z.string() })
const sourceFileSchema = z.object({ path: z.string().max(300), sha256: z.string().regex(/^[a-f0-9]{64}$/) }).strict()
const recordSchema = z.object({ requestId: z.string().uuid(), jobId: z.string(), context: contextSchema, file: fileSchema,
  manifestId: z.string().uuid(), expectedRevision: z.number(), state: z.enum(['queued', 'running', 'succeeded', 'failed']), stage: z.string(), completed: z.number(), total: z.number(),
  fingerprint: z.string(), createdAt: z.number(), deadline: z.number(), error: z.string().optional(), dashboard: receiptSchema.optional(), sourceFile: sourceFileSchema.optional() }).strict()
const inputSchema = z.object({ manifest: dashboardSchema, expectedVersionId: z.string().uuid().nullable(), expectedRevision: z.number().int().nonnegative(),
  dependencies: artifactDocumentDependencyAssets.optional() }).strict()
type RecordState = z.infer<typeof recordSchema>
export const saveRequestSchema = z.object({ requestId: z.string().uuid() }).strict()
export const waitSaveRequestSchema = saveRequestSchema.extend({ cursor: z.string().min(1).max(100) }).strict()
function trustedScope(context: XpertResolvedViewHostContext) {
  return contextSchema.parse({ tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId,
    hostType: context.hostType, hostId: context.hostId,
    ...(context.hostType === 'project' ? { projectId: context.hostId } : context.runtimeScope?.projectId ? { projectId: context.runtimeScope.projectId } : {}) })
}
function restoredScope(scope: RecordState['context']): XpertResolvedViewHostContext {
  return { ...scope, slots: [], ...(scope.projectId ? { runtimeScope: { projectId: scope.projectId, conversationId: null,
    dataScopeKey: `project:${scope.projectId}`, workspaceFiles: { catalog: 'projects', scopeId: scope.projectId, projectId: scope.projectId } } } : {}) }
}

/** Durable save orchestration; domain validation and CAS remain in DashboardService. */
@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN_NAME, queueName: 'save-validation', jobName: 'save', concurrency: 2 })
export class DashboardSaveRequests {
  constructor(private readonly service: DashboardService, @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService) {}

  async submit(context: XpertResolvedViewHostContext, manifest: DashboardManifest, expectedVersionId: string | null, expectedRevision: number,
    idempotencyKey: string, sourceFile?: z.infer<typeof sourceFileSchema>, dependencies?: ArtifactDocumentDependencyAsset[]) {
    await this.service.authorizeProject(context, 'write')
    const scope = trustedScope(context), parsed = inputSchema.parse({ manifest, expectedVersionId, expectedRevision, dependencies })
    const fingerprint = hash(JSON.stringify({ ...parsed, manifest: { ...parsed.manifest, ...(expectedRevision === 0 ? { id: 'new' } : {}) }, sourceFile }))
    const previousCount = await this.service.previousBindingCount(context, parsed.manifest)
    this.service.assertCapacity(parsed.manifest.bindings.length, previousCount)
    const redis = await this.queue.getRedis(), files = this.runtime.require(WorkspaceFilesRuntimeCapability)
    const dedupe = `${key(scope, 'submission')}:${hash(JSON.stringify([scope, idempotencyKey]))}`
    const previous = await redis.get(dedupe)
    if (previous) {
      if ((await this.read(context, previous)).fingerprint !== fingerprint) throw new Error('DASHBOARD_SAVE_IDEMPOTENCY_CONFLICT')
      return this.get(context, previous)
    }
    const requestId = randomUUID(), buffer = Buffer.from(JSON.stringify(parsed))
    if (buffer.length > 12_000_000) throw new Error('DASHBOARD_MANIFEST_TOO_LARGE')
    const stored = await files.uploadBuffer({ tenantId: scope.tenantId, userId: scope.userId, catalog: 'users', buffer,
      originalName: 'save.json', fileName: 'save.json', folder: `live-dashboard-save/${requestId}`, mimeType: 'application/json' })
    const record: RecordState = { requestId, jobId: `dashboard-save-${requestId}`, context: scope,
      file: { filePath: stored.filePath, workspacePath: stored.workspacePath, sha256: hash(buffer), size: buffer.length },
      fingerprint, manifestId: manifest.id, expectedRevision, state: 'queued', stage: 'queued', completed: 0, total: manifest.bindings.length, createdAt: Date.now(), deadline: Date.now() + MAX_RUNTIME,
      ...(sourceFile ? { sourceFile: sourceFileSchema.parse(sourceFile) } : {}) }
    const winner = await redis.eval("local id=redis.call('GET',KEYS[1]); if id then return id end; redis.call('SET',KEYS[2],ARGV[2],'EX',ARGV[3]); redis.call('SET',KEYS[1],ARGV[1],'EX',ARGV[3]); return ARGV[1]", 2,
      dedupe, key(scope, requestId), requestId, JSON.stringify(record), TTL)
    if (winner !== requestId) {
      await files.deleteFile(this.reference(record))
      if ((await this.read(context, String(winner))).fingerprint !== fingerprint) throw new Error('DASHBOARD_SAVE_IDEMPOTENCY_CONFLICT')
      return this.get(context, String(winner))
    }
    // Recovery can enqueue the same deterministic job if the process stops at this boundary.
    await this.enqueue(record)
    return this.snapshot(record)
  }
  private reference(record: RecordState) {
    return { source: 'platform.workspace.files' as const, tenantId: record.context.tenantId, userId: record.context.userId, catalog: 'users' as const,
      filePath: record.file.filePath, workspacePath: record.file.workspacePath }
  }
  private async enqueue(record: RecordState) {
    await this.queue.enqueue({ pluginName: PLUGIN_NAME, queueName: 'save-validation', jobName: 'save', payload: { requestId: record.requestId },
      tenantId: record.context.tenantId, organizationId: record.context.organizationId, userId: record.context.userId,
      scopeKey: 'system:global', jobId: record.jobId, attempts: 1, removeOnComplete: { age: TTL, count: 1000 }, removeOnFail: { age: TTL, count: 1000 } })
  }
  private async read(context: XpertResolvedViewHostContext, requestId: string) {
    z.string().uuid().parse(requestId)
    const redis = await this.queue.getRedis(), value = await redis.get(key(context, requestId))
    if (!value) throw new Error('DASHBOARD_SAVE_REQUEST_UNAVAILABLE')
    const record = recordSchema.parse(JSON.parse(value))
    if (JSON.stringify(trustedScope(context)) !== JSON.stringify(record.context)) throw new Error('DASHBOARD_SAVE_REQUEST_DENIED')
    return record
  }
  private snapshot(record: RecordState) {
    const terminal = record.state === 'succeeded' || record.state === 'failed'
    const result = { requestId: record.requestId, state: record.state, stage: record.stage, completed: record.completed, total: record.total,
      terminal, ...(record.dashboard ? { dashboard: record.dashboard, ...(record.sourceFile ? { sourceFile: record.sourceFile } : {}) } : {}),
      ...(record.error ? { error: record.error } : {}), nextAction: terminal ? 'report_result' : 'wait' }
    return { ...result, cursor: hash(JSON.stringify(result)) }
  }
  async get(context: XpertResolvedViewHostContext, requestId: string) {
    await this.service.authorizeProject(context)
    let record = await this.read(context, requestId)
    if (record.state === 'queued' || record.state === 'running') {
      const job = await this.queue.getJob({ jobId: record.jobId })
      if (!job && record.deadline > Date.now()) await this.enqueue(record)
      else if (job?.state === 'failed' || !job && record.deadline <= Date.now()) {
        // A completed domain receipt always wins a racing observation.
        record = await this.read(context, requestId)
        if (record.state !== 'succeeded') {
          const receipt = await this.service.savedRequestReceipt(context, record.manifestId, record.requestId, record.expectedRevision)
          record = receipt ? { ...record, state: 'succeeded', stage: 'saved', completed: record.total, dashboard: receipt }
            : { ...record, state: 'failed', error: 'DASHBOARD_SAVE_JOB_FAILED: retrieve the current draft before retrying; no new save receipt was confirmed.' }
          await (await this.queue.getRedis()).set(key(record.context, requestId), JSON.stringify(record), 'EX', TTL)
          await this.runtime.require(WorkspaceFilesRuntimeCapability).deleteFile(this.reference(record)).catch(() => undefined)
        }
      }
    }
    return this.snapshot(record)
  }
  async wait(context: XpertResolvedViewHostContext, requestId: string, cursor: string, signal?: AbortSignal) {
    const until = Date.now() + WAIT_MS
    let current = await this.get(context, requestId)
    while (!current.terminal && current.cursor === cursor && Date.now() < until) {
      await delay(Math.min(2000, until - Date.now()), undefined, { signal })
      current = this.snapshot(await this.read(context, requestId))
    }
    return current.terminal || current.cursor !== cursor ? current : this.get(context, requestId)
  }
  async handle(job: ManagedQueueJob<{ requestId: string }>, identity: ManagedQueueJobContext) {
    const requestId = z.string().uuid().parse(job.data.requestId), redis = await this.queue.getRedis()
    let record = recordSchema.parse(JSON.parse(await redis.get(key(identity, requestId)) ?? 'null'))
    if (record.context.tenantId !== identity.tenantId || record.context.organizationId !== identity.organizationId || record.context.userId !== identity.userId)
      throw new Error('DASHBOARD_SAVE_REQUEST_DENIED')
    if (record.state === 'succeeded') return
    let committed = false, terminalPersisted = false
    const persist = async () => { await redis.set(key(record.context, requestId), JSON.stringify(record), 'EX', TTL) }
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability)
    try {
      const file = await files.readBuffer(this.reference(record))
      if (file.buffer.length !== record.file.size || hash(file.buffer) !== record.file.sha256) throw new Error('DASHBOARD_SAVE_INPUT_CHANGED')
      const input = inputSchema.parse(JSON.parse(file.buffer.toString('utf8')))
      const dashboard = await this.service.save(restoredScope(record.context), input.manifest, input.expectedVersionId, input.expectedRevision, input.dependencies,
        { requestId, progress: async (stage, completed, total) => {
          if (Date.now() >= record.deadline) throw new Error('DASHBOARD_SAVE_DEADLINE')
          record = { ...record, state: 'running', stage, completed, total }; await persist()
        } })
      committed = true
      record = { ...record, state: 'succeeded', stage: 'saved', completed: record.total, dashboard }
      await persist()
      terminalPersisted = true
    } catch (error) {
      // Keep frozen input for recovery when the Artifact CAS succeeded but status persistence did not.
      if (committed) throw new Error('DASHBOARD_SAVE_COMMIT_UNCONFIRMED')
      // Do not persist native provider messages or private query configuration.
      const code = error instanceof Error ? error.message.match(/^DASHBOARD_[A-Z_]+/)?.[0] : undefined
      record = { ...record, state: 'failed', error: code ?? 'DASHBOARD_SAVE_VALIDATION_FAILED' }; await persist()
      terminalPersisted = true
      throw new Error(record.error)
    } finally {
      if (terminalPersisted) await files.deleteFile(this.reference(record)).catch(() => undefined)
    }
  }
}
