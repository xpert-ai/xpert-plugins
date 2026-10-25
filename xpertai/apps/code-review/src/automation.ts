import { Inject, Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { In, MoreThanOrEqual, Repository, type EntityManager } from 'typeorm'
import { z } from 'zod/v3'
import { MANAGED_QUEUE_SERVICE_TOKEN, PluginJobProcessor, SYSTEM_GLOBAL_SCOPE, type ManagedQueueService, type PluginContext, type ManagedQueueJob, type ManagedQueueJobContext } from '@xpert-ai/plugin-sdk'
import { ReviewDelivery, ReviewRepository, ReviewRun } from './automation-entities.js'
import { CONTEXT, QUEUE, pullEventSchema, triggerDecision, verifyWebhook, type RunStatus } from './automation-domain.js'
import { PLUGIN, ReviewError, idSchema, parsePullUrl, type Scope } from './domain.js'
import { Reviews } from './backend.js'
import { Repositories } from './repositories.js'
import { ReviewPipelineAutomation } from './pipeline/automation.js'
import { assertGitHubRepositoryApplication } from './github-integration.js'

const pending: RunStatus[] = ['queued', 'running', 'publishing', 'awaiting_confirmation', 'awaiting_revision', 'blocked']
const logger = new Logger('CodeReviewAutomation')
const errorCode = (error: unknown) => error instanceof ReviewError ? error.code : 'automation_failed'
export const jobSchema = z.object({ repositoryId: idSchema }).strict()

@Injectable()
export class Automation {
  constructor(@InjectRepository(ReviewRun) readonly runs: Repository<ReviewRun>,
    @InjectRepository(ReviewDelivery) private readonly deliveries: Repository<ReviewDelivery>,
    readonly repositories: Repositories, private readonly reviews: Reviews,
    @Inject(CONTEXT) private readonly context: PluginContext, private readonly pipelines: ReviewPipelineAutomation) {}
  private queue() { return this.context.resolve<ManagedQueueService>(MANAGED_QUEUE_SERVICE_TOKEN) }
  async schedule(p: ReviewRepository, future = false) {
    const bucket = Math.floor(Date.now() / 30000) + (future ? 1 : 0)
    return this.queue().enqueue({ pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', payload: { repositoryId: p.id },
      tenantId: p.tenantId, organizationId: p.organizationId, userId: p.userId, scopeKey: SYSTEM_GLOBAL_SCOPE,
      jobId: `code-review-${p.id}-${bucket}`, delayMs: future ? Math.max(1000, bucket * 30000 - Date.now()) : 0,
      attempts: 3, backoffMs: 5000, removeOnComplete: 20, removeOnFail: 100 })
  }
  async recover() {
    // Re-arm each repository on process/plugin restart. No secrets or snapshots enter the queue.
    for (const p of await this.repositories.records.find()) await this.schedule(p)
  }
  visibleQuery(s: Scope, repositories: ReviewRepository[]) {
    return this.runs.createQueryBuilder('run')
      .where('run."tenantId" = :tenantId AND run."organizationId" = :organizationId', s)
      .andWhere('run."repositoryPolicyId" IN (:...repositoryIds)', { repositoryIds: repositories.map(p => p.id).concat('00000000-0000-0000-0000-000000000000') })
      // A newly shared repository must not expose its historical private runs.
      .andWhere(`(run."repositoryPolicyId" IN (:...ownedIds) OR
        (run.settings->>'visibility' = 'project' AND run.settings->'pipeline'->>'projectId' = :projectId))`, {
        ownedIds: repositories.filter(p => p.userId === s.userId && p.assistantId === s.assistantId).map(p => p.id).concat('00000000-0000-0000-0000-000000000000'),
        projectId: s.runtime?.projectId ?? null
      })
  }
  async overview(s: Scope, page = 1, status?: RunStatus) {
    const repositories = await this.repositories.list(s)
    const query = this.visibleQuery(s, repositories)
    if (status) query.andWhere('run.status = :status', { status })
    const [runs, total] = repositories.length ? await query.orderBy('run."createdAt"', 'DESC').take(20).skip((page - 1) * 20).getManyAndCount() : [[], 0]
    return { repositories, runs, total, page, app: await this.repositories.app.status(s), workspaceId: s.workspaceId }
  }
  async receive(raw: Buffer | undefined, signature: string | undefined, deliveryId: string, event: string) {
    const application = await this.repositories.app.config()
    verifyWebhook(raw, signature, application?.webhookSecret)
    if (!/^[\w-]{1,100}$/.test(deliveryId) || !/^[a-z_]{1,80}$/.test(event)) throw new ReviewError('invalid_webhook_headers')
    const bytes = raw! // verified above
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (event !== 'pull_request') return { accepted: true, ignored: true }
    const payload = pullEventSchema.parse(JSON.parse(bytes.toString('utf8')))
    const p = await this.repositories.records.findOneBy({ installationId: String(payload.installation.id), repositoryId: String(payload.repository.id) })
    if (!p) return { accepted: true, ignored: true }
    if (application?.tenantId && application.tenantId !== p.tenantId) throw new ReviewError('github_integration_unavailable')
    await this.runs.manager.transaction(async manager => {
      // Serialize policy changes, webhook deduplication and daily quota claims across API processes.
      const locked = await manager.findOneOrFail(ReviewRepository, { where: { id: p.id }, lock: { mode: 'pessimistic_write' } })
      assertGitHubRepositoryApplication(application!, locked)
      const previous = await manager.findOneBy(ReviewDelivery, { deliveryId })
      if (previous) {
        if (previous.digest !== digest) throw new ReviewError('delivery_payload_mismatch')
        return
      }
      const reason = triggerDecision(locked.settings, payload) ?? (!locked.settings.pipeline ? 'pipeline_binding_required' : null), pr = payload.pull_request
      // Non-trigger events must not consume the key used by a subsequent ready_for_review event.
      const operationKey = `${pr.number}-${pr.head.sha}-${locked.revision}${reason ? '-skip-' + payload.action : ''}`
      let run = await manager.findOneBy(ReviewRun, { repositoryPolicyId: locked.id, operationKey })
      if (!run) run = await manager.save(ReviewRun, manager.create(ReviewRun, { tenantId: locked.tenantId, organizationId: locked.organizationId,
        assistantId: locked.assistantId, repositoryPolicyId: locked.id, operationKey, number: pr.number, headSha: pr.head.sha, title: pr.title,
        trigger: payload.action, settings: locked.settings, policyRevision: locked.revision, status: reason === 'pipeline_binding_required' ? 'needs_configuration' : reason ? 'skipped' : 'queued', reason,
        notBefore: new Date(Date.now() + (payload.action === 'synchronize' ? 30000 : 0)), finishedAt: reason ? new Date() : null }))
      await manager.save(ReviewDelivery, manager.create(ReviewDelivery, { deliveryId, event, digest, tenantId: locked.tenantId,
        organizationId: locked.organizationId, runId: run.id, status: 'processed' }))
      await manager.update(ReviewRepository, { id: locked.id }, { lastEventAt: new Date() })
    })
    // Returning an error on enqueue failure lets GitHub redelivery re-arm the already persisted run.
    await this.schedule(p)
    return { accepted: true }
  }
  async trial(s: Scope, repositoryId: string, number: number) {
    const p = await this.repositories.get(s, repositoryId), github = await this.repositories.github(s, p.id)
    if (!p.settings.pipeline) throw new ReviewError('pipeline_binding_required')
    const ref = parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${number}`), snapshot = await github.snapshot(ref)
    const operationKey = `trial-${number}-${snapshot.headSha}-${p.revision}`
    const prior = await this.runs.findOneBy({ repositoryPolicyId: p.id, operationKey })
    if (prior) { await this.schedule(p); return prior }
    const run = await this.runs.save(this.runs.create({ tenantId: p.tenantId, organizationId: p.organizationId, assistantId: p.assistantId,
      repositoryPolicyId: p.id, operationKey, number, headSha: snapshot.headSha, title: snapshot.title,
      trigger: 'trial', settings: { ...p.settings, delivery: 'draft' }, policyRevision: p.revision, status: 'queued', notBefore: new Date() }))
    await this.schedule(p)
    return run
  }
  async retry(s: Scope, id: string) {
    const previous = await this.runs.findOneBy({ id, tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId })
    if (!previous) throw new ReviewError('run_not_found')
    const p = await this.repositories.get(s, previous.repositoryPolicyId)
    if (!['failed', 'cancelled', 'skipped', 'superseded', 'needs_configuration'].includes(previous.status)) throw new ReviewError('run_not_retryable')
    if (!p.settings.pipeline) throw new ReviewError('pipeline_binding_required')
    if (!p.settings.enabled && previous.trigger !== 'trial') throw new ReviewError('automation_paused')
    const operationKey = `retry-${previous.id}`, prior = await this.runs.findOneBy({ repositoryPolicyId: p.id, operationKey })
    if (prior) { await this.schedule(p); return prior }
    const github = await this.repositories.github(s, p.id)
    const snapshot = await github.snapshot(parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${previous.number}`))
    const run = await this.runs.save(this.runs.create({ tenantId: p.tenantId, organizationId: p.organizationId, assistantId: p.assistantId,
      repositoryPolicyId: p.id, operationKey, number: previous.number, headSha: snapshot.headSha, title: snapshot.title,
      trigger: previous.trigger === 'trial' ? 'trial' : 'retry', settings: { ...p.settings, ...(previous.trigger === 'trial' ? { delivery: 'draft' as const } : {}) },
      policyRevision: p.revision, status: 'queued', notBefore: new Date() }))
    await this.schedule(p)
    return run
  }
  async process(id: string, context: ManagedQueueJobContext, jobId?: string) {
    const p = await this.repositories.records.findOneBy({ id })
    if (!p || p.tenantId !== context.tenantId || p.organizationId !== context.organizationId || p.userId !== context.userId ||
      context.pluginName !== PLUGIN || context.queueName !== QUEUE || context.scopeKey !== SYSTEM_GLOBAL_SCOPE)
      throw new ReviewError('queue_scope_mismatch')
    // Schedule the successor BEFORE doing work. Crashes and ambiguous task dispatches remain recoverable.
    await this.schedule(p, true)
    // Each phase commits before the next, so a restart cannot lose task identity or quota reservations.
    for (let phase = 0; phase < 3; phase++) await this.runs.manager.transaction(async manager => {
      const locked = await manager.findOneOrFail(ReviewRepository, { where: { id }, lock: { mode: 'pessimistic_write' } })
      // Rotate inspected runs so old drafts cannot starve newly queued work.
      const runs = await manager.find(ReviewRun, { where: { repositoryPolicyId: id, status: In(pending) }, order: { updatedAt: 'ASC', id: 'ASC' }, take: 10 })
      for (const run of runs) {
        if (run.notBefore > new Date()) continue
        try {
          await manager.update(ReviewRun, { id: run.id }, { updatedAt: new Date(), ...(jobId ? { jobId } : {}) })
          await this.advance(manager, locked, run)
        }
        catch (error) {
          const code = errorCode(error)
          if (['pipeline_binding_required', 'pipeline_binding_unavailable', 'pipeline_configuration_mismatch', 'pipeline_version_already_started'].includes(code)) {
            await this.finish(manager, run, 'needs_configuration', code); continue
          }
          logger.warn(`Run ${run.id}: ${code}`)
          await manager.update(ReviewRun, { id: run.id }, { reason: code })
          await manager.update(ReviewRepository, { id }, { errorCode: code })
          // Transient API/queue failures can recover, but do not bill indefinitely.
          if (!['awaiting_confirmation', 'awaiting_revision', 'blocked'].includes(run.status) && Date.now() - run.createdAt.getTime() > 60 * 60 * 1000) await this.finish(manager, run, 'failed', code)
        }
      }
    })
  }
  private async finish(manager: EntityManager, run: ReviewRun, status: RunStatus, reason: string | null = null) {
    await manager.update(ReviewRun, { id: run.id }, { status, reason, finishedAt: new Date() })
  }
  private async stop(manager: EntityManager, p: ReviewRepository, run: ReviewRun, status: RunStatus, reason: string) {
    if (run.pipelineInstanceId) {
      // A new SHA is superseded by nextRound, preserving the instance and execution audit.
      if (reason !== 'new_commit') await this.pipelines.cancel(p, run)
    } else if (run.reviewId) {
      const r = await this.reviews.get(p, run.reviewId)
      if (r.status === 'running' && !r.pipelineProjectId) await this.reviews.cancel(p, r.id, r.revision)
    }
    await this.finish(manager, run, status, reason)
  }
  private async advance(manager: EntityManager, p: ReviewRepository, run: ReviewRun) {
    // A previously attempted POST takes precedence over later policy/head changes.
    if (await this.reconcilePublication(manager, p, run)) return
    if (p.revision !== run.policyRevision || (!p.settings.enabled && run.trigger !== 'trial'))
      return this.stop(manager, p, run, 'cancelled', 'policy_changed')
    const github = await this.repositories.github(p, p.id)
    const current = await github.state(parsePullUrl(`https://github.com/${p.owner}/${p.repository}/pull/${run.number}`))
    if (current.head.sha !== run.headSha) return this.stop(manager, p, run, 'superseded', 'new_commit')
    if (current.state !== 'open' || current.draft) return this.stop(manager, p, run, 'skipped', current.draft ? 'draft_pull_request' : 'pull_request_closed')
    if (run.trigger !== 'trial' && ((!run.settings.includeBots && current.user.type === 'Bot') || (run.settings.branches.length && !run.settings.branches.includes(current.base.ref))))
      return this.stop(manager, p, run, 'skipped', 'branch_or_author_excluded')
    if (!run.settings.pipeline) return this.stop(manager, p, run, 'needs_configuration', 'pipeline_binding_required')
    if (run.pipelineInstanceId) return this.pipelines.advance(manager, p, run)
    await this.pipelines.validate(p, run)
    if (!run.startedAt) {
      const midnight = new Date(); midnight.setUTCHours(0, 0, 0, 0)
      const used = await manager.count(ReviewRun, { where: { repositoryPolicyId: p.id, startedAt: MoreThanOrEqual(midnight) } })
      if (used >= run.settings.dailyLimit) return this.finish(manager, run, 'skipped', 'daily_limit_reached')
      // Commit the quota reservation before fetching or dispatching a model task.
      await manager.update(ReviewRun, { id: run.id }, { startedAt: new Date() }); return
    }
    if (!run.reviewId) {
      try {
        const record = await this.reviews.prepareAutomatic(p, run)
        await manager.update(ReviewRun, { id: run.id }, { reviewId: record.id, status: 'running', reason: null })
      } catch (error) {
        if (error instanceof ReviewError && ['all_files_excluded', 'stale_revision'].includes(error.code)) return this.finish(manager, run, 'skipped', error.code)
        throw error
      }
      return
    }
    await this.pipelines.advance(manager, p, run)
  }

  private async reconcilePublication(manager: EntityManager, p: ReviewRepository, run: ReviewRun) {
    if (!run.reviewId || run.settings.pipeline) return false
    const review = await this.reviews.get(p, run.reviewId)
    if (review.status === 'submitted') {
      await manager.update(ReviewRun, { id: run.id }, { publicationUrl: review.submissionUrl })
      await this.finish(manager, run, 'published')
      return true
    }
    if (review.status === 'submitting' || review.status === 'submission_unknown') {
      await this.finish(manager, run, 'publication_unknown', 'submission_unknown_check_github')
      return true
    }
    return false
  }
  async confirm(s: Scope, id: string) {
    const run = await this.runs.findOneBy({ id, tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId })
    if (!run) throw new ReviewError('run_not_found')
    const p = await this.repositories.get(s, run.repositoryPolicyId)
    // Historical private drafts stay readable, but new publication requires the Project gate.
    throw new ReviewError(run.settings.pipeline ? 'pipeline_approval_required' : 'pipeline_binding_required')
  }
}

@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', concurrency: 2 })
export class AutomationProcessor {
  constructor(private readonly automation: Automation) {}
  async handle(job: ManagedQueueJob, context: ManagedQueueJobContext) { await this.automation.process(jobSchema.parse(job.data).repositoryId, context, job.id) }
}
