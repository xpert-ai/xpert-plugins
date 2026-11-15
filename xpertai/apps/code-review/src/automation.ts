import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, LessThanOrEqual, MoreThan, MoreThanOrEqual, Repository, type EntityManager } from 'typeorm'
import { AssistantMiddlewareAccessRuntimeCapability, MANAGED_QUEUE_SERVICE_TOKEN, type ManagedQueueService, XPERT_RUNTIME_CAPABILITIES_TOKEN, PluginJobProcessor, SYSTEM_GLOBAL_SCOPE, type RuntimeCapabilityRegistry, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { ReviewDelivery, ReviewRepository, ReviewRun } from './automation-entities.js'
import { QUEUE, type RunStatus } from './automation-domain.js'
import { FEATURE, MIDDLEWARE, PLUGIN, ReviewError, parsePullUrl, type Scope } from './domain.js'
import { publicationMode } from './automation-contract.js'
import { Reviews } from './backend.js'
import { Repositories } from './repositories.js'
import { ReviewPipelineAutomation } from './pipeline/automation.js'
import { ReviewEvents } from './event-subscription.js'
import { WorkflowDiagnostics } from './workflow-diagnostics.js'
import { WorkflowDiagnosis } from './workflow-entity.js'
import { ReviewWebhookInbox } from './webhook-inbox.js'
import { withAutomationLease, type AssertAutomationOwnership } from './automation-lease.js'

import { Review } from './entity.js'
import { scanSchema, stepSchema, reviewPhase, workflowPhase, type AutomationStep } from './automation-jobs.js'

const pending: RunStatus[] = ['queued', 'running', 'publishing', 'awaiting_confirmation', 'awaiting_revision', 'blocked']
const logger = new Logger('CodeReviewAutomation')
const errorCode = (error: unknown) => error instanceof ReviewError ? error.code : 'automation_failed'
export const jobSchema = scanSchema

@Injectable()
export class Automation {
  constructor(@InjectRepository(ReviewRun) readonly runs: Repository<ReviewRun>,
    private readonly inbox: ReviewWebhookInbox,
    readonly repositories: Repositories, private readonly reviews: Reviews,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry, private readonly pipelines: ReviewPipelineAutomation,
    private readonly events: ReviewEvents, private readonly workflows: WorkflowDiagnostics,
    @Inject(MANAGED_QUEUE_SERVICE_TOKEN) private readonly queue: ManagedQueueService) {}
  async schedule(p: ReviewRepository, future = false) {
    try { p = await this.repositories.execution(p) }
    catch (error) {
      await this.repositories.records.update({ id: p.id }, { errorCode: errorCode(error) })
      return
    }
    if (p.executionUserId && (p.errorCode === 'assistant_execution_unavailable' || p.errorCode === 'assistant_binding_required'))
      await this.repositories.records.update({ id: p.id, executionUserId: p.executionUserId,
        executionRevision: p.executionRevision, errorCode: p.errorCode }, { errorCode: null })
    const bucket = Math.floor(Date.now() / 30000) + (future ? 1 : 0)
    return this.asAssistant(p, () => this.enqueue(p, 'supervise', { repositoryId: p.id },
      `scan-${p.id}-${bucket}`, future ? Math.max(1000, bucket * 30000 - Date.now()) : 0))
  }
  private asAssistant<T>(p: ReviewRepository, work: () => Promise<T>) {
    return this.capabilities.require(AssistantMiddlewareAccessRuntimeCapability).runAsAssistant({
      actor: { tenantId: p.tenantId, organizationId: p.organizationId, userId: p.userId },
      assistantId: p.assistantId, provider: MIDDLEWARE, requiredFeature: FEATURE, scope: { type: 'assistant' }
    }, work)
  }
  private enqueue(p: ReviewRepository, jobName: string, payload: object, key: string, delayMs = 0) {
    return this.queue.enqueue({ pluginName: PLUGIN, tenantId: p.tenantId, organizationId: p.organizationId, userId: p.userId,
      queueName: QUEUE, jobName, payload, scopeKey: SYSTEM_GLOBAL_SCOPE, jobId: `code-review-${key}`, delayMs,
      attempts: 3, backoffMs: 5000, removeOnComplete: 20, removeOnFail: 100 })
  }
  private enqueueStep(p: ReviewRepository, step: AutomationStep, delayMs = 0) {
    const bucket = Math.floor((Date.now() + delayMs) / 30000)
    return this.enqueue(p, 'step', step, `${step.kind}-${step.id}-${step.phase}-${Date.parse(step.version)}-${bucket}`, delayMs)
  }

  async recover() {
    // Re-arm each repository on process/plugin restart. No secrets or snapshots enter the queue.
    let recovered = true
    for (const p of await this.repositories.records.find()) {
      try {
        const queued = await this.schedule(p)
        if (p.ownership === 'assistant' && !queued) recovered = false
      } catch { recovered = false }
    }
    return recovered
  }
  visibleQuery(s: Scope, repositories: ReviewRepository[]) {
    return this.runs.createQueryBuilder('run')
      .where('run."tenantId" = :tenantId AND run."organizationId" = :organizationId', s)
      .andWhere('run."repositoryPolicyId" IN (:...repositoryIds)', { repositoryIds: repositories.map(p => p.id).concat('00000000-0000-0000-0000-000000000000') })
      // A newly shared repository must not expose its historical private runs.
      .andWhere(`(run."evidenceUserId" = :evidenceUserId OR (run."evidenceUserId" IS NULL AND run."organizationShared" = false AND run."repositoryPolicyId" IN (:...ownedIds)) OR (run."organizationShared" = true AND run."assistantId" = :sharedAssistantId AND :organizationEvidence = true) OR
        (run.settings->>'visibility' = 'project' AND run.settings->'pipeline'->>'projectId' = :projectId))`, {
        evidenceUserId: s.userId, organizationEvidence: false, sharedAssistantId: s.assistantId,
        ownedIds: repositories.filter(p => p.userId === s.userId && p.assistantId === s.assistantId).map(p => p.id).concat('00000000-0000-0000-0000-000000000000'),
        projectId: s.runtime?.projectId ?? null
      })
  }
  async overview(s: Scope, page = 1, status?: RunStatus) {
    const repositories = await this.repositories.list(s)
    const access = await this.repositories.access(s)
    const query = this.visibleQuery(s, repositories).setParameter('organizationEvidence', access.canRead)
    if (status) query.andWhere('run.status = :status', { status })
    const [runs, total] = repositories.length ? await query.orderBy('run."createdAt"', 'DESC').take(20).skip((page - 1) * 20).getManyAndCount() : [[], 0]
    return { repositories, runs, total, page, access, labels: await this.repositories.labels(s, repositories), app: await this.repositories.app.status(s), workspaceId: s.workspaceId }
  }
  async receive(raw: Buffer | undefined, signature: string | undefined, deliveryId: string, event: string) {
    const repository = await this.inbox.accept(raw, signature, deliveryId, event)
    // Persistence is the acknowledgement boundary. Periodic recovery repairs failed/lost queue wakeups.
    if (repository) void this.schedule(repository).catch(() => logger.warn('Webhook wakeup failed; durable inbox will be recovered'))
    return repository ? { accepted: true } : { accepted: true, ignored: true }
  }
  async trial(s: Scope, repositoryId: string, number: number) {
    await this.repositories.manage(s)
    const p = await this.repositories.execution(await this.repositories.get(s, repositoryId)), github = await this.repositories.github(s, p.id)
    if (p.settings.executionMode !== 'assistant' && !p.settings.pipeline) throw new ReviewError('pipeline_binding_required')
    if (p.settings.executionMode === 'assistant') await this.events.access(p)
    const ref = parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${number}`), snapshot = await github.snapshot(ref)
    const operationKey = `trial-${number}-${snapshot.headSha}-${p.revision}`
    const prior = await this.runs.findOneBy({ repositoryPolicyId: p.id, operationKey })
    if (prior) { await this.schedule(p); return prior }
    const run = await this.runs.save(this.runs.create({ tenantId: p.tenantId, organizationId: p.organizationId, assistantId: p.assistantId, evidenceUserId: p.userId, organizationShared: p.ownership === 'assistant' && p.settings.visibility === 'organization',
      repositoryPolicyId: p.id, operationKey, number, headSha: snapshot.headSha, title: snapshot.title,
      trigger: 'trial', settings: { ...p.settings, delivery: 'draft' }, policyRevision: p.revision, status: 'queued', notBefore: new Date() }))
    await this.schedule(p)
    return run
  }
  async retry(s: Scope, id: string) {
    await this.repositories.manage(s)
    const previous = await this.runs.findOneBy({ id, tenantId: s.tenantId, organizationId: s.organizationId })
    if (!previous) throw new ReviewError('run_not_found')
    const p = await this.repositories.execution(await this.repositories.get(s, previous.repositoryPolicyId))
    if (!['failed', 'cancelled', 'skipped', 'superseded', 'needs_configuration'].includes(previous.status)) throw new ReviewError('run_not_retryable')
    if (p.settings.executionMode !== 'assistant' && !p.settings.pipeline) throw new ReviewError('pipeline_binding_required')
    if (!p.settings.enabled && previous.trigger !== 'trial') throw new ReviewError('automation_paused')
    const operationKey = `retry-${previous.id}`, prior = await this.runs.findOneBy({ repositoryPolicyId: p.id, operationKey })
    if (prior) { await this.schedule(p); return prior }
    const github = await this.repositories.github(s, p.id)
    const snapshot = await github.snapshot(parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${previous.number}`))
    const run = await this.runs.save(this.runs.create({ tenantId: p.tenantId, organizationId: p.organizationId, assistantId: p.assistantId, evidenceUserId: p.userId, organizationShared: p.ownership === 'assistant' && p.settings.visibility === 'organization',
      repositoryPolicyId: p.id, operationKey, number: previous.number, headSha: snapshot.headSha, title: snapshot.title,
      trigger: previous.trigger === 'trial' ? 'trial' : 'retry', settings: { ...p.settings, ...(previous.trigger === 'trial' ? { delivery: 'draft' as const } : {}) },
      policyRevision: p.revision, status: 'queued', notBefore: new Date() }))
    await this.schedule(p)
    return run
  }
  private async policy(id: string, context: ManagedQueueJobContext) {
    const stored = await this.repositories.records.findOneBy({ id })
    if (!stored || stored.tenantId !== context.tenantId || stored.organizationId !== context.organizationId || stored.executionUserId !== context.userId ||
      context.pluginName !== PLUGIN || context.queueName !== QUEUE || context.scopeKey !== SYSTEM_GLOBAL_SCOPE)
      throw new ReviewError('queue_scope_mismatch')
    return this.repositories.execution(stored)
  }
  private async reviewStep(run: ReviewRun): Promise<Extract<AutomationStep, { kind: 'review' }>> {
    // Read persisted state only. The dispatcher never contacts GitHub or starts an Agent.
    const review = run.settings.executionMode === 'assistant' && run.reviewId
      ? await this.runs.manager.findOne(Review, { where: { id: run.reviewId, tenantId: run.tenantId, organizationId: run.organizationId }, select: ['status', 'errorCode'] }) : null
    return { repositoryId: run.repositoryPolicyId, id: run.id, kind: 'review', phase: reviewPhase(run, review), version: run.updatedAt.toISOString() }
  }
  private workflowStep(run: WorkflowDiagnosis): Extract<AutomationStep, { kind: 'workflow' }> {
    return { repositoryId: run.repositoryPolicyId, id: run.id, kind: 'workflow', phase: workflowPhase(run), version: run.updatedAt.toISOString() }
  }
  // Existing supervise jobs now only page through durable records and enqueue individual stages.
  async process(id: string, context: ManagedQueueJobContext, _jobId?: string, after?: string) {
    const p = await this.policy(id, context), manager = this.runs.manager
    const scope = { repositoryPolicyId: id, tenantId: p.tenantId, organizationId: p.organizationId, ...(after ? { id: MoreThan(after) } : {}) }
    const options = { order: { id: 'ASC' as const }, take: 50 }
    const runs = await this.runs.find({ ...options, where: { ...scope, status: In(pending), notBefore: LessThanOrEqual(new Date()) } })
    const deliveries = await manager.find(ReviewDelivery, { ...options, where: { ...scope, status: 'received', retryAt: LessThanOrEqual(new Date()) } })
    const workflows = await manager.find(WorkflowDiagnosis, { ...options, where: { ...scope, status: In(['queued', 'running']) } })
    await this.asAssistant(p, async () => {
      for (const run of runs) await this.enqueueStep(p, await this.reviewStep(run))
      for (const delivery of deliveries) await this.enqueueStep(p, { repositoryId: id, id: delivery.id, kind: 'delivery', phase: 'accept', version: delivery.retryAt.toISOString() })
      for (const run of workflows) await this.enqueueStep(p, this.workflowStep(run))
      // Keyset pagination prevents a full first page of waiting approvals from starving later records.
      const next = [runs, deliveries, workflows].filter(rows => rows.length === options.take).map(rows => rows.at(-1)!.id).sort()[0]
      if (next) await this.enqueue(p, 'supervise', { repositoryId: id, after: next }, `scan-${id}-${Math.floor(Date.now() / 30000)}-${next}`)
    })
  }
  async processStep(step: AutomationStep, context: ManagedQueueJobContext, jobId?: string) {
    const p = await this.policy(step.repositoryId, context), manager = this.runs.manager
    const scope = { id: step.id, repositoryPolicyId: p.id, tenantId: p.tenantId, organizationId: p.organizationId }
    // A PR's different SHAs share ordering, but unrelated PRs/workflows never hold each other up.
    const run = step.kind === 'review' ? await this.runs.findOneBy(scope) : null
    if (step.kind === 'review' && !run) return
    const resource = step.kind === 'review' ? `pull-${run!.number}` : `${step.kind}-${step.id}`
    let successor: AutomationStep | undefined
    let delay = 30_000
    await withAutomationLease(await this.queue.getRedis(), { ...p, id: `${p.id}-${resource}` }, async assertOwned => {
      if (step.kind === 'delivery') {
        const row = await manager.findOneBy(ReviewDelivery, scope)
        if (!row || row.status !== 'received' || row.retryAt > new Date() || row.retryAt.toISOString() !== step.version) return
        await this.inbox.process(p, row.id, assertOwned)
        const saved = await manager.findOneByOrFail(ReviewDelivery, scope)
        if (saved.status === 'received') {
          successor = { ...step, version: saved.retryAt.toISOString() }
          delay = Math.max(0, saved.retryAt.getTime() - Date.now())
        } else if (saved.runId) {
          if (saved.event === 'pull_request') {
            const next = await this.runs.findOneBy({ ...scope, id: saved.runId })
            if (next && pending.includes(next.status)) {
              successor = await this.reviewStep(next)
              delay = Math.max(0, next.notBefore.getTime() - Date.now())
            }
          } else {
            const next = await manager.findOneBy(WorkflowDiagnosis, { ...scope, id: saved.runId })
            if (next && ['queued', 'running'].includes(next.status)) { successor = this.workflowStep(next); delay = 0 }
          }
        }
        return
      }
      if (step.kind === 'workflow') {
        const row = await manager.findOneBy(WorkflowDiagnosis, scope)
        if (!row || !['queued', 'running'].includes(row.status) || row.updatedAt.toISOString() !== step.version || workflowPhase(row) !== step.phase) return
        await assertOwned()
        await manager.update(WorkflowDiagnosis, scope, { updatedAt: new Date() })
        await this.workflows.process(p, row.id, assertOwned)
        const saved = await manager.findOneByOrFail(WorkflowDiagnosis, scope)
        if (['queued', 'running'].includes(saved.status)) successor = this.workflowStep(saved)
      } else {
        const row = await this.runs.findOneByOrFail(scope)
        if (!pending.includes(row.status) || row.notBefore > new Date() || row.updatedAt.toISOString() !== step.version || (await this.reviewStep(row)).phase !== step.phase) return
        await assertOwned()
        await this.runs.update(scope, { updatedAt: new Date(), ...(jobId ? { jobId } : {}) })
        try { await this.advance(manager, p, row, step.phase, assertOwned) }
        catch (error) {
          await assertOwned()
          const code = errorCode(error)
          if (['pipeline_binding_required', 'pipeline_binding_unavailable', 'pipeline_configuration_mismatch', 'pipeline_version_already_started'].includes(code)) {
            await this.finish(manager, row, 'needs_configuration', code)
          } else {
            logger.warn(`Run ${row.id}: ${code}`)
            await this.runs.update(scope, { reason: code })
            await this.repositories.records.update({ id: p.id }, { errorCode: code })
            if (!['awaiting_confirmation', 'awaiting_revision', 'blocked'].includes(row.status) && Date.now() - row.createdAt.getTime() > 60 * 60 * 1000)
              await this.finish(manager, row, 'failed', code)
            throw error
          }
        }
        const saved = await this.runs.findOneByOrFail(scope)
        if (pending.includes(saved.status)) successor = await this.reviewStep(saved)
      }
      if (successor?.phase !== step.phase) delay = 0
    })
    // Release the stage lease before handing off. No worker waits for another phase or for model completion.
    if (successor) await this.asAssistant(p, () => this.enqueueStep(p, successor!, delay))
  }
  private async finish(manager: EntityManager, run: ReviewRun, status: RunStatus, reason: string | null = null) {
    await manager.update(ReviewRun, { id: run.id }, { status, reason, finishedAt: new Date() })
  }
  private async stop(manager: EntityManager, p: ReviewRepository, run: ReviewRun, status: RunStatus, reason: string, assertOwned: AssertAutomationOwnership) {
    await assertOwned()
    if (run.pipelineInstanceId) {
      // A new SHA is superseded by nextRound, preserving the instance and execution audit.
      if (reason !== 'new_commit') await this.pipelines.cancel(p, run)
    } else if (run.reviewId) {
      const r = await this.reviews.get(p, run.reviewId)
      await assertOwned()
      if (r.status === 'running' && !r.pipelineProjectId) await this.reviews.cancel(p, r.id, r.revision)
    }
    await assertOwned()
    await this.finish(manager, run, status, reason)
  }
  private async advance(manager: EntityManager, p: ReviewRepository, run: ReviewRun, phase: Extract<AutomationStep, { kind: 'review' }>['phase'], assertOwned: AssertAutomationOwnership) {
    // A previously attempted POST takes precedence over later policy/head changes.
    if (await this.reconcilePublication(manager, p, run, assertOwned)) return
    if (p.revision !== run.policyRevision || (!p.settings.enabled && run.trigger !== 'trial'))
      return this.stop(manager, p, run, 'cancelled', 'policy_changed', assertOwned)
    if (run.settings.executionMode === 'assistant') {
      try { if (run.trigger === 'trial') await this.events.access(p); else await this.events.assertListening(p) }
      catch { return this.stop(manager, p, run, 'cancelled', 'github_trigger_paused', assertOwned) }
    }
    if (phase === 'reserve' && run.settings.executionMode !== 'assistant') await this.pipelines.validate(p, run)
    const github = await this.repositories.github(p, p.id)
    const current = await github.state(parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${run.number}`))
    await assertOwned()
    if (current.head.sha !== run.headSha) return this.stop(manager, p, run, 'superseded', 'new_commit', assertOwned)
    if (current.state !== 'open' || current.draft) return this.stop(manager, p, run, 'skipped', current.draft ? 'draft_pull_request' : 'pull_request_closed', assertOwned)
    if (run.trigger !== 'trial' && ((!run.settings.includeBots && current.user.type === 'Bot') || (run.settings.branches.length && !run.settings.branches.includes(current.base.ref))))
      return this.stop(manager, p, run, 'skipped', 'branch_or_author_excluded', assertOwned)
    if (run.settings.executionMode !== 'assistant' && !run.settings.pipeline) return this.stop(manager, p, run, 'needs_configuration', 'pipeline_binding_required', assertOwned)
    if (phase === 'reserve') {
      await this.reserveQuota(p, run)
      return
    }
    if (phase === 'prepare') {
      try {
        const record = await this.reviews.prepareAutomatic(p, run, assertOwned)
        await assertOwned()
        await manager.update(ReviewRun, { id: run.id }, { reviewId: record.id, status: 'running', reason: null })
      } catch (error) {
        if (error instanceof ReviewError && ['all_files_excluded', 'stale_revision'].includes(error.code)) return this.finish(manager, run, 'skipped', error.code)
        throw error
      }
      return
    }
    if (run.settings.executionMode === 'assistant') {
      let review = await this.reviews.reconcile(p, run.reviewId!)
      await assertOwned()
      if (review.status === 'ready') {
        await this.repositories.github(p, p.id)
        const instructions = [run.settings.instructions, await this.events.instructions(p)].filter(Boolean).join('\n\n')
        await assertOwned()
        review = await this.reviews.start(p, review.id, review.revision, instructions, run.id)
        await assertOwned()
        await this.events.activity(p, 'run')
      }
      if (review.status === 'reviewed') {
        const mode = publicationMode(run.settings)
        if (mode === 'store' || run.trigger === 'trial') return this.finish(manager, run, 'completed')
        if (mode === 'confirm' && run.status !== 'publishing') {
          if (run.status !== 'awaiting_confirmation') await manager.update(ReviewRun, { id: run.id }, { status: 'awaiting_confirmation' })
          return
        }
        await assertOwned()
        await this.reviews.publishAutomatic(p, run)
        await this.reconcilePublication(manager, p, run, assertOwned)
        return
      }
      if (review.status === 'failed' || review.status === 'cancelled') return this.finish(manager, run, 'failed', review.errorCode ?? 'assistant_task_failed')
      if (run.startedAt && Date.now() - run.startedAt.getTime() > 60 * 60 * 1000) return this.stop(manager, p, run, 'failed', 'review_timeout', assertOwned)
      return
    }
    await this.pipelines.advance(manager, p, run, assertOwned)
  }

  private async reserveQuota(p: ReviewRepository, run: ReviewRun) {
    await this.runs.manager.transaction(async manager => {
      // A concurrent webhook/quota claim must not exhaust the pool with indefinite row-lock waiters.
      const policy = await manager.findOne(ReviewRepository, { where: { id: p.id }, lock: { mode: 'pessimistic_write', onLocked: 'skip_locked' } })
      if (!policy) return
      const current = await manager.findOneByOrFail(ReviewRun, { id: run.id })
      if (current.startedAt || !pending.includes(current.status)) return
      if (policy.executionRevision !== current.policyRevision || (!policy.settings.enabled && current.trigger !== 'trial')) {
        await this.finish(manager, current, 'cancelled', 'policy_changed'); return
      }
      const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
      const quotaWhere = { repositoryPolicyId: p.id, startedAt: MoreThanOrEqual(midnight) }
      const used = await manager.count(ReviewRun, { where: quotaWhere }) + await manager.count(WorkflowDiagnosis, { where: quotaWhere })
      if (used >= current.settings.dailyLimit) { await this.finish(manager, current, 'skipped', 'daily_limit_reached'); return }
      await manager.update(ReviewRun, { id: current.id }, { startedAt: new Date() })
    })
  }

  private async reconcilePublication(manager: EntityManager, p: ReviewRepository, run: ReviewRun, assertOwned: AssertAutomationOwnership) {
    if (!run.reviewId || run.settings.pipeline) return false
    let review = await this.reviews.get(p, run.reviewId)
    if ((review.status === 'submitting' || review.status === 'submission_unknown') && run.settings.publication) {
      const found = await this.reviews.findAutomaticComment(p, run, review).catch(() => null)
      if (found) review = found
    }
    await assertOwned()
    if (review.status === 'submitted') {
      await manager.update(ReviewRun, { id: run.id }, { publicationUrl: review.submissionUrl })
      await this.finish(manager, run, 'published')
      return true
    }
    if (review.status === 'submitting' || review.status === 'submission_unknown') {
      // Allow GitHub time to expose the committed review. Recovery only reads the receipt.
      if (run.settings.publication && Date.now() - review.updatedAt.getTime() < 60 * 60 * 1000)
        await manager.update(ReviewRun, { id: run.id }, { status: 'publishing', reason: 'submission_unknown_check_github' })
      else await this.finish(manager, run, 'publication_unknown', 'submission_unknown_check_github')
      return true
    }
    return false
  }
  async confirm(s: Scope, id: string) {
    await this.repositories.manage(s)
    const run = await this.runs.findOneBy({ id, tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId })
    if (!run) throw new ReviewError('run_not_found')
    if (run.settings.pipeline) throw new ReviewError('pipeline_approval_required')
    if (run.trigger === 'trial' || run.settings.executionMode !== 'assistant' || run.settings.publication !== 'confirm' ||
        run.status !== 'awaiting_confirmation') throw new ReviewError('review_not_submittable')
    const p = await this.repositories.execution(await this.repositories.get(s, run.repositoryPolicyId))
    if (!p.settings.enabled || p.revision !== run.policyRevision || p.settings.publication !== 'confirm') throw new ReviewError('policy_changed')
    const result = await this.runs.update({ id, status: 'awaiting_confirmation' }, { status: 'publishing' })
    if (!result.affected) throw new ReviewError('revision_conflict')
    await this.schedule(p)
    return { status: 'publishing' }
  }
}

@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', concurrency: 2 })
export class AutomationProcessor {
  constructor(private readonly automation: Automation) {}
  async handle(job: ManagedQueueJob, context: ManagedQueueJobContext) {
    const data = scanSchema.parse(job.data)
    await this.automation.process(data.repositoryId, context, job.id, data.after)
  }
}

@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN, queueName: QUEUE, jobName: 'step', concurrency: 4 })
export class AutomationStepProcessor {
  constructor(private readonly automation: Automation) {}
  async handle(job: ManagedQueueJob, context: ManagedQueueJobContext) { await this.automation.processStep(stepSchema.parse(job.data), context, job.id) }
}
