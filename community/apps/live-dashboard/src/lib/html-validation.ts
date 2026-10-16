import { BadRequestException, Inject, Injectable } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod/v3'
import type { AnalyticalDataset, XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { MANAGED_QUEUE_SERVICE_TOKEN, PluginJobProcessor, SandboxJobsRuntimeCapability, WorkspaceFilesRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type ManagedQueueJob, type ManagedQueueJobContext, type ManagedQueueService,
  type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { DashboardManifest } from './dashboard.schema'

const PLUGIN = '@xpert-ai/plugin-live-dashboard', ACTION = 'live_dashboard.validate-html', POOL = 'sandbox-browser'
const reportSchema = z.object({ ok: z.boolean(), errors: z.array(z.string().max(300)).max(16),
  requestedBindings: z.array(z.string().max(80)).max(60), renderedTextLength: z.number().int().nonnegative() }).strict()
const recordSchema = z.object({ tenantId: z.string(), organizationId: z.string(), userId: z.string(), manifestId: z.string(), deadline: z.number(),
  filePath: z.string(), workspacePath: z.string(), size: z.number(), sha256: z.string() }).strict()
const digest = (buffer: Buffer) => createHash('sha256').update(buffer).digest('hex')
const recordKey = (id: string) => `live_dashboard:validation:${id}`

/** Browser execution belongs to the platform's bounded background pool, not the API request. */
@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN, queueName: 'html-validation', jobName: 'validate', concurrency: 1 })
export class HtmlDashboardValidation {
  constructor(@Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly runtime: RuntimeCapabilityRegistry,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService) {}

  async validate(context: XpertResolvedViewHostContext, manifest: DashboardManifest, datasets: AnalyticalDataset[]) {
    if (!manifest.presentation) return null
    if (!context.tenantId || !context.organizationId || !context.userId) throw new BadRequestException('DASHBOARD_ACCESS_DENIED')
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability), jobs = this.runtime.require(SandboxJobsRuntimeCapability)
    const [health, pool] = await Promise.all([jobs.getActionHealth({ pluginName: PLUGIN, action: ACTION, actionVersion: '1.0.0' }),
      this.queue.getExecutionPoolHealth({ executionPool: POOL })])
    if (!health.available || !pool.available) throw new BadRequestException(`DASHBOARD_HTML_VALIDATION_UNAVAILABLE: ${health.reason ?? pool.warning ?? 'Browser Runtime unavailable'}`)
    const jobId = randomUUID(), scope = { tenantId: context.tenantId, userId: context.userId, catalog: 'users' as const }
    const buffer = Buffer.from(JSON.stringify({ html: manifest.presentation.html,
      context: { bindingIds: manifest.bindings.map(binding => binding.id), defaults: Object.fromEntries(manifest.controls.filter(control => control.defaultValue !== undefined).map(control => [control.controlId, control.defaultValue ?? null])), theme: 'light', locale: 'en' },
      datasets: Object.fromEntries(manifest.bindings.map(binding => [binding.id, datasets.find(dataset => dataset.datasetId === binding.output.datasetId)])) }))
    const stored = await files.uploadBuffer({ ...scope, buffer, originalName: 'document.json', fileName: 'document.json', folder: `live-dashboard-validation/${jobId}`, mimeType: 'application/json' })
    const reference = { source: 'platform.workspace.files' as const, ...scope, filePath: stored.filePath, workspacePath: stored.workspacePath }
    const redis = await this.queue.getRedis(), key = recordKey(jobId), deadline = Date.now() + 90000
    const record = { tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, manifestId: manifest.id,
      deadline, filePath: stored.filePath, workspacePath: stored.workspacePath, size: buffer.length, sha256: digest(buffer) }
    let finished = false
    try {
      // Transient plugin-owned task record; queue payloads contain only its identity, never HTML or rows.
      await redis.set(key, JSON.stringify(record), 'EX', 300)
      const queued = await this.queue.enqueue({ pluginName: PLUGIN, queueName: 'html-validation', jobName: 'validate', payload: { validationId: jobId },
        tenantId: context.tenantId, organizationId: context.organizationId, userId: context.userId, scopeKey: 'system:global', jobId,
        attempts: 1, executionPool: POOL, removeOnComplete: { age: 3600, count: 100 }, removeOnFail: { age: 86400, count: 100 } })
      while (Date.now() < deadline) {
        const state = await this.queue.getJob({ jobId: queued.jobId, executionPool: POOL })
        if (state?.state === 'failed') { finished = true; throw new BadRequestException(`DASHBOARD_HTML_VALIDATION_FAILED: ${state.failedReason?.slice(0, 500) ?? 'Browser Job failed'}`) }
        if (state?.state === 'completed') {
          const report = reportSchema.parse(JSON.parse(await redis.get(`${key}:report`) ?? 'null'))
          finished = true
          if (!report.ok) throw new BadRequestException(`DASHBOARD_HTML_PREFLIGHT_FAILED: ${JSON.stringify(report.errors)}. Repair the Workspace HTML or include every required previewId, then retry. No dashboard was saved.`)
          return { jobId, requestedBindings: report.requestedBindings, status: 'passed' }
        }
        await delay(250)
      }
      throw new BadRequestException('DASHBOARD_HTML_VALIDATION_TIMEOUT')
    } finally {
      if (!finished) {
        await Promise.allSettled([this.queue.cancel({ jobId, executionPool: POOL }), jobs.cancel({ jobId })])
      }
      await removeTemporary(() => files.deleteFile(reference))
      await redis.del(key, `${key}:report`)
    }
  }

  /** Ownership comes from persisted queue context. This handler needs no HTTP request or conversation. */
  async handle(job: ManagedQueueJob<{ validationId: string }>, context: ManagedQueueJobContext) {
    const jobId = z.string().uuid().parse(job.data.validationId), key = recordKey(jobId), redis = await this.queue.getRedis()
    const record = recordSchema.parse(JSON.parse(await redis.get(key) ?? 'null'))
    if (record.deadline <= Date.now() || record.tenantId !== context.tenantId || record.organizationId !== context.organizationId || record.userId !== context.userId)
      throw new Error('DASHBOARD_HTML_VALIDATION_EXPIRED_OR_DENIED')
    const files = this.runtime.require(WorkspaceFilesRuntimeCapability), jobs = this.runtime.require(SandboxJobsRuntimeCapability)
    const scope = { tenantId: record.tenantId, userId: record.userId, catalog: 'users' as const }
    const reference = { source: 'platform.workspace.files' as const, ...scope, filePath: record.filePath, workspacePath: record.workspacePath }
    try {
      const result = await jobs.run({ jobId, action: ACTION, actionVersion: '1.0.0', idempotencyKey: `live_dashboard/${jobId}`,
        scope: { tenantId: record.tenantId, organizationId: record.organizationId, userId: record.userId, pluginName: PLUGIN, businessResourceType: 'html-validation', businessResourceId: record.manifestId },
        payload: {}, files: [{ reference, targetPath: 'document.json', size: record.size, sha256: record.sha256 }], timeoutMs: Math.min(60000, record.deadline - Date.now()),
        outputs: [{ path: 'report.json', originalName: 'report.json', mimeType: 'application/json', destination: { ...scope, folder: `live-dashboard-validation/${jobId}` } }] })
      const output = result.outputs.find(output => output.path === 'report.json')
      if (!output) throw new Error('DASHBOARD_HTML_VALIDATION_UNAVAILABLE')
      try {
        const bytes = (await files.readBuffer(output.reference)).buffer
        if (bytes.length > 16000 || digest(bytes) !== output.sha256) throw new Error('DASHBOARD_HTML_VALIDATION_INVALID')
        await redis.set(`${key}:report`, JSON.stringify(reportSchema.parse(JSON.parse(bytes.toString('utf8')))), 'EX', 300)
      } finally { await removeTemporary(() => files.deleteFile(output.reference)) }
    } finally { await removeTemporary(() => files.deleteFile(reference)) }
  }
}

async function removeTemporary(remove: () => Promise<void>) {
  try { await remove() } catch (error) {
    if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
  }
}
