import { Inject, Injectable, Optional, Logger } from '@nestjs/common'
import { In, LessThanOrEqual } from 'typeorm'
import {
  AssistantTaskRuntimeCapability, XPERT_RUNTIME_CAPABILITIES_TOKEN, MANAGED_QUEUE_SERVICE_TOKEN, PluginJobProcessor,
  type RuntimeCapabilityResolver, type ManagedQueueService, type ManagedQueueJob, type ManagedQueueJobContext
} from '@xpert-ai/plugin-sdk'
import { AnalysisService, terminal } from './analysis.service.js'
import { MeetingRecord, AnalysisAttempt } from './entities.js'
import { CONFIG, INSTALLATION, PLUGIN_NAME, QUEUE, FEATURE, PROMPT, NAMESPACE } from './constants.js'
import type { PluginConfig } from './schemas.js'
import { fail, type Installation, type Scope } from './types.js'

type JobPayload = { meetingId: string; attemptId: string }
@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN_NAME, queueName: QUEUE, jobName: 'dispatch', concurrency: 2 })
@PluginJobProcessor({ pluginName: PLUGIN_NAME, queueName: QUEUE, jobName: 'reconcile', concurrency: 2 })
export class AnalysisBackgroundService {
  private timer?: ReturnType<typeof setInterval>
  private scanning = false
  private stopped = true
  private readonly logger = new Logger('MeetingActionReview')
  constructor(private readonly analysis: AnalysisService,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityResolver,
    @Inject(INSTALLATION) private readonly installation: Installation,
    @Inject(CONFIG) private readonly config: PluginConfig,
    @Optional() @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue?: ManagedQueueService) {}
  api() { return this.capabilities.get(AssistantTaskRuntimeCapability) ?? fail('BACKGROUND_UNAVAILABLE') }
  async preflight(scope: Scope) {
    if (!this.queue || !this.installation.scopeKey || this.installation.tenantId !== scope.tenantId) fail('BACKGROUND_UNAVAILABLE')
    const api = this.api()
    if (!api.getPublishedContext || !api.getTaskStatus) fail('BACKGROUND_UNAVAILABLE')
    const published = await api.getPublishedContext(scope.assistantId)
    if (!published.primaryAgentKey || !published.features.includes(FEATURE)) fail('ASSISTANT_NOT_READY')
    if (api.getModels) {
      const models = await api.getModels(scope.assistantId)
      const selected = models.models.find(model => model.id === models.selected_model_id) ?? models.models.find(model => model.default)
      if (!selected || selected.disabled) fail('ASSISTANT_NOT_READY')
    }
    const health = await this.queue.getExecutionPoolHealth({ executionPool: 'default' })
    if (!health.available) fail('BACKGROUND_UNAVAILABLE')
    return published
  }
  start() {
    if (this.timer || !this.installation.tenantId || !this.installation.scopeKey) return
    this.stopped = false
    this.timer = setInterval(() => { void this.scan().catch(() => this.logger.warn('Recovery scan unavailable; will retry.')) }, 10000)
    this.timer.unref()
    void this.scan().catch(() => this.logger.warn('Initial recovery scan unavailable; will retry.'))
  }
  stop() { this.stopped = true; if (this.timer) clearInterval(this.timer); this.timer = undefined }
  async scan() {
    if (this.scanning || this.stopped || !this.installation.scopeKey || !this.installation.tenantId) return
    this.scanning = true
    try {
      const attempts = await this.analysis.db.manager.find(AnalysisAttempt, {
        where: { tenantId: this.installation.tenantId, installationScopeKey: this.installation.scopeKey,
          status: In(['queued','dispatching','running']), nextCheckAt: LessThanOrEqual(new Date()) },
        order: { nextCheckAt: 'ASC', id: 'ASC' }, take: 50
      })
      for (const attempt of attempts) {
        if (this.stopped) break
        if (attempt.deadlineAt.getTime() <= Date.now()) {
          await this.analysis.finishFailure(attempt.id, 'ANALYSIS_TIMEOUT', true)
          // A queue job restores actor authority for best-effort cancellation, even after domain expiry.
          await this.enqueue(attempt, 'reconcile').catch(() => undefined)
          continue
        }
        const claimed = await this.analysis.db.getRepository(AnalysisAttempt).createQueryBuilder().update()
          .set({ nextCheckAt: new Date(Date.now() + 10000) })
          .where('id = :id AND next_check_at <= :now AND status IN (:...states)', {
            id: attempt.id, now: new Date(), states: ['queued','dispatching','running']
          }).execute()
        if (claimed.affected) await this.enqueue(attempt, attempt.status === 'queued' ? 'dispatch' : 'reconcile').catch(() => undefined)
      }
    } finally { this.scanning = false }
  }
  async schedule(row: MeetingRecord) {
    if (!row.activeAttemptId) return
    const a = await this.analysis.db.manager.findOneByOrFail(AnalysisAttempt, { id: row.activeAttemptId })
    // Failure is recoverable from the committed attempt; never turn a committed create into a false rollback.
    await this.enqueue(a, 'dispatch').catch(() => this.logger.warn('Initial queue delivery deferred to recovery scan.'))
  }
  async enqueue(a: AnalysisAttempt, jobName: 'dispatch' | 'reconcile') {
    if (!this.queue) fail('BACKGROUND_UNAVAILABLE')
    return this.queue.enqueue({ pluginName: PLUGIN_NAME, queueName: QUEUE, jobName,
      payload: { meetingId: a.recordId, attemptId: a.id }, tenantId: a.tenantId, organizationId: a.organizationId,
      userId: a.ownerUserId, scopeKey: a.installationScopeKey,
      jobId: `mar-${jobName}-${a.id}-${Math.floor(Date.now()/10000)}`, attempts: 1, removeOnComplete: 100, removeOnFail: 100 })
  }
  async handle(job: ManagedQueueJob<JobPayload>, context: ManagedQueueJobContext) {
    const attempt = await this.analysis.db.manager.findOneBy(AnalysisAttempt, { id: job.data.attemptId, recordId: job.data.meetingId })
    if (!attempt) return
    if (context.tenantId !== attempt.tenantId || context.organizationId !== attempt.organizationId || context.userId !== attempt.ownerUserId ||
      context.scopeKey !== attempt.installationScopeKey || context.scopeKey !== this.installation.scopeKey) fail('NOT_FOUND')
    const api = this.api()
    const query = { executionId: attempt.rootExecutionId, conversationId: attempt.conversationId, clientMessageId: attempt.clientMessageId }
    if (attempt.status === 'timed_out' || (!terminal(attempt) && attempt.deadlineAt.getTime() <= Date.now())) {
      await this.analysis.finishFailure(attempt.id, 'ANALYSIS_TIMEOUT', true)
      await api.cancelTask?.(query).catch(() => undefined)
      return
    }
    if (terminal(attempt)) return
    const row = await this.analysis.db.manager.findOneByOrFail(MeetingRecord, { id: attempt.recordId })
    if (row.activeAttemptId !== attempt.id) return
    if (attempt.dispatchInput) {
      const status = await api.getTaskStatus?.(query)
      if (status) {
        await this.analysis.db.manager.update(AnalysisAttempt, { id: attempt.id }, { platformStatus: status.status })
        if (status.status === 'succeeded' || status.status === 'failed') {
          await this.analysis.finishFailure(attempt.id, status.status === 'succeeded' ? 'NO_VALID_RESULT' : 'ANALYSIS_FAILED')
          return
        }
        if (attempt.status === 'running') return
      }
    }
    const published = attempt.dispatchInput ? null : await this.preflight({
      tenantId: row.tenantId, organizationId: row.organizationId, ownerUserId: row.ownerUserId, assistantId: row.assistantId
    })
    const input = await this.analysis.locked(attempt.id, async (record, current, manager) => {
      if (terminal(current) || current.deadlineAt.getTime() <= Date.now() || record.activeAttemptId !== current.id ||
        (current.leaseUntil && current.leaseUntil.getTime() > Date.now())) return null
      current.dispatchInput ??= {
        xpertId: record.assistantId, agentKey: published!.primaryAgentKey!, expectedPublishedVersion: published!.publishedVersion,
        conversationId: current.conversationId, executionId: current.rootExecutionId, clientMessageId: current.clientMessageId,
        controlPolicy: 'detached', prompt: PROMPT,
        correlation: { namespace: NAMESPACE, subjectId: record.id, operationId: current.id }
      }
      current.publishedVersion = current.dispatchInput.expectedPublishedVersion!
      current.agentKey = current.dispatchInput.agentKey!
      current.status = 'dispatching'; current.leaseUntil = new Date(Date.now()+15000); current.updatedAt = new Date()
      await manager.save(current)
      return current.dispatchInput
    })
    if (!input) return
    if (this.config.testFailAttemptId === attempt.id && process.env.NODE_ENV !== 'production') {
      await this.analysis.finishFailure(attempt.id, 'TEST_INJECTED_FAILURE'); return
    }
    try {
      const receipt = await api.startTask(input)
      if ((receipt.conversationId && receipt.conversationId !== attempt.conversationId) || (receipt.executionId && receipt.executionId !== attempt.rootExecutionId)) {
        await this.analysis.finishFailure(attempt.id, 'EXECUTION_BINDING_MISMATCH'); return
      }
      await this.analysis.locked(attempt.id, async (_record, current, manager) => {
        // The business tool may finish before startTask returns. Enrich handles without reopening it.
        if (!terminal(current)) { current.status = 'running'; current.platformStatus = receipt.status }
        current.threadId = receipt.threadId ?? current.threadId
        current.startedAt ??= new Date(); current.leaseUntil = null; current.updatedAt = new Date()
        await manager.save(current)
      })
    } catch {
      // The dispatch may have succeeded remotely; retain its key and reconcile instead of silently starting another run.
      this.logger.warn('Assistant dispatch outcome unknown; awaiting reconciliation.')
    }
  }
}
