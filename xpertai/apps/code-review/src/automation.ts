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

const pending: RunStatus[] = ['queued', 'running', 'publishing', 'awaiting_confirmation']
const logger = new Logger('CodeReviewAutomation')
const errorCode = (error: unknown) => error instanceof ReviewError ? error.code : 'automation_failed'
export const jobSchema = z.object({ repositoryId: idSchema }).strict()

@Injectable()
export class Automation {
  constructor(@InjectRepository(ReviewRun) readonly runs: Repository<ReviewRun>,
    @InjectRepository(ReviewDelivery) private readonly deliveries: Repository<ReviewDelivery>,
    readonly repositories: Repositories, private readonly reviews: Reviews,
    @Inject(CONTEXT) private readonly context: PluginContext) {}
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
  async overview(s: Scope, page = 1, status?: RunStatus) {
    const repositories = await this.repositories.list(s)
    const [runs, total] = repositories.length ? await this.runs.findAndCount({
      where: { tenantId: s.tenantId, organizationId: s.organizationId, assistantId: s.assistantId, repositoryPolicyId: In(repositories.map(p => p.id)), ...(status ? { status } : {}) },
      order: { createdAt: 'DESC' }, take: 20, skip: (page - 1) * 20
    }) : [[], 0]
    return { repositories, runs, total, page, app: this.repositories.app.status(), workspaceId: s.workspaceId }
  }
  async receive(raw: Buffer | undefined, signature: string | undefined, deliveryId: string, event: string) {
    verifyWebhook(raw, signature, this.repositories.app.config()?.webhookSecret)
    if (!/^[\w-]{1,100}$/.test(deliveryId) || !/^[a-z_]{1,80}$/.test(event)) throw new ReviewError('invalid_webhook_headers')
    const bytes = raw! // verified above
    const digest = createHash('sha256').update(bytes).digest('hex')
    if (event !== 'pull_request') return { accepted: true, ignored: true }
    const payload = pullEventSchema.parse(JSON.parse(bytes.toString('utf8')))
    const p = await this.repositories.records.findOneBy({ installationId: String(payload.installation.id), repositoryId: String(payload.repository.id) })
    if (!p) return { accepted: true, ignored: true }
    await this.runs.manager.transaction(async manager => {
      // Serialize policy changes, webhook deduplication and daily quota claims across API processes.
      const locked = await manager.findOneOrFail(ReviewRepository, { where: { id: p.id }, lock: { mode: 'pessimistic_write' } })
      const previous = await manager.findOneBy(ReviewDelivery, { deliveryId })
      if (previous) {
        if (previous.digest !== digest) throw new ReviewError('delivery_payload_mismatch')
        return
      }
      const reason = triggerDecision(locked.settings, payload), pr = payload.pull_request
      // Non-trigger events must not consume the key used by a subsequent ready_for_review event.
      const operationKey = `${pr.number}-${pr.head.sha}-${locked.revision}${reason ? '-skip-' + payload.action : ''}`
      let run = await manager.findOneBy(ReviewRun, { repositoryPolicyId: locked.id, operationKey })
      if (!run) run = await manager.save(ReviewRun, manager.create(ReviewRun, { tenantId: locked.tenantId, organizationId: locked.organizationId,
        assistantId: locked.assistantId, repositoryPolicyId: locked.id, operationKey, number: pr.number, headSha: pr.head.sha, title: pr.title,
        trigger: payload.action, settings: locked.settings, policyRevision: locked.revision, status: reason ? 'skipped' : 'queued', reason,
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
    if (!['failed', 'cancelled', 'skipped', 'superseded'].includes(previous.status)) throw new ReviewError('run_not_retryable')
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
          logger.warn(`Run ${run.id}: ${code}`)
          await manager.update(ReviewRun, { id: run.id }, { reason: code })
          await manager.update(ReviewRepository, { id }, { errorCode: code })
          // Transient API/queue failures can recover, but do not bill indefinitely.
          if (run.status !== 'awaiting_confirmation' && Date.now() - run.createdAt.getTime() > 60 * 60 * 1000) await this.finish(manager, run, 'failed', code)
        }
      }
    })
  }
  private async finish(manager: EntityManager, run: ReviewRun, status: RunStatus, reason: string | null = null) {
    await manager.update(ReviewRun, { id: run.id }, { status, reason, finishedAt: new Date() })
  }
  private async stop(manager: EntityManager, p: ReviewRepository, run: ReviewRun, status: RunStatus, reason: string) {
    if (run.reviewId) {
      const r = await this.reviews.get(p, run.reviewId)
      if (r.status === 'running') await this.reviews.cancel(p, r.id, r.revision)
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
    // Drafts remain observable, but only an explicit confirmation may publish them.
    if (run.status === 'awaiting_confirmation') return
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
    let r = await this.reviews.reconcile(p, run.reviewId)
    if (r.status === 'ready') { await this.reviews.start(p, r.id, r.revision, run.settings.instructions, run.id); return }
    if (r.status === 'running') {
      if (Date.now() - r.updatedAt.getTime() > 60 * 60 * 1000) return this.stop(manager, p, run, 'failed', 'review_timeout')
      return
    }
    if (r.status === 'failed' || r.status === 'cancelled') return this.finish(manager, run, r.status, r.errorCode)
    if (r.status === 'submitted') {
      await manager.update(ReviewRun, { id: run.id }, { publicationUrl: r.submissionUrl }); return this.finish(manager, run, 'published')
    }
    if (r.status === 'submitting' || r.status === 'submission_unknown') return this.finish(manager, run, 'publication_unknown', 'submission_unknown_check_github')
    if (r.status !== 'reviewed') return
    if (run.settings.delivery === 'draft') return this.finish(manager, run, 'awaiting_confirmation')
    await manager.update(ReviewRun, { id: run.id }, { status: 'publishing' })
    r = await this.reviews.publishAutomatic(p, run)
    await manager.update(ReviewRun, { id: run.id }, { publicationUrl: r.submissionUrl })
    await this.finish(manager, run, 'published')
  }
  private async reconcilePublication(manager: EntityManager, p: ReviewRepository, run: ReviewRun) {
    if (!run.reviewId) return false
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
    const result = await this.runs.manager.transaction(async manager => {
      const locked = await manager.findOneOrFail(ReviewRepository, { where: { id: p.id }, lock: { mode: 'pessimistic_write' } })
      const latest = await manager.findOneByOrFail(ReviewRun, { id })
      if (latest.status !== 'awaiting_confirmation' || latest.trigger === 'trial') throw new ReviewError('run_not_submittable')
      await this.advance(manager, locked, latest)
      const current = await manager.findOneByOrFail(ReviewRun, { id })
      if (current.status === 'published') return { published: true }
      if (current.status !== 'awaiting_confirmation') return { error: current.reason ?? 'run_not_submittable' }
      try {
        const r = await this.reviews.publishAutomatic(locked, current, true)
        await manager.update(ReviewRun, { id }, { publicationUrl: r.submissionUrl, status: 'published', reason: null, finishedAt: new Date() })
        return { published: true }
      } catch (error) {
        // Commit the reconciled outcome before returning an error to the caller.
        // Throwing inside this transaction would leave the inbox at "Needs confirmation".
        await this.advance(manager, locked, current)
        const reconciled = await manager.findOneByOrFail(ReviewRun, { id })
        return { error: reconciled.reason ?? errorCode(error) }
      }
    })
    if (result.error) throw new ReviewError(result.error)
    return { published: true }
  }
}

@Injectable()
@PluginJobProcessor({ pluginName: PLUGIN, queueName: QUEUE, jobName: 'supervise', concurrency: 2 })
export class AutomationProcessor {
  constructor(private readonly automation: Automation) {}
  async handle(job: ManagedQueueJob, context: ManagedQueueJobContext) { await this.automation.process(jobSchema.parse(job.data).repositoryId, context, job.id) }
}
