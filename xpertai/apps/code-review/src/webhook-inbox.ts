import { Injectable, Logger } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { ReviewDelivery, ReviewRepository, ReviewRun } from './automation-entities.js'
import { pullEventSchema, triggerDecision, verifyWebhook, type PullEvent } from './automation-domain.js'
import { ReviewError } from './domain.js'
import { Repositories } from './repositories.js'
import { ReviewEvents } from './event-subscription.js'
import { assertGitHubRepositoryApplication } from './github-integration.js'
import { WorkflowDiagnostics } from './workflow-diagnostics.js'
import { workflowEventSchema } from './workflow-contract.js'
import type { AssertAutomationOwnership } from './automation-lease.js'

const eventSchema = z.discriminatedUnion('event', [
  z.object({ event: z.literal('pull_request'), data: pullEventSchema }),
  z.object({ event: z.literal('workflow_run'), data: workflowEventSchema })
])
const envelopeSchema = z.object({ policyRevision: z.number().int().positive(),
  appId: z.string(), integrationId: z.string().nullable(), event: eventSchema })
export type StoredWebhook = z.infer<typeof envelopeSchema>
const logger = new Logger('CodeReviewWebhookInbox')

/** Acknowledge only durable, authenticated input. Queue wakeups can be reconstructed from the database. */
@Injectable()
export class ReviewWebhookInbox {
  constructor(@InjectRepository(ReviewDelivery) readonly deliveries: Repository<ReviewDelivery>,
    private readonly repositories: Repositories, private readonly events: ReviewEvents, private readonly workflows: WorkflowDiagnostics) {}

  async accept(raw: Buffer | undefined, signature: string | undefined, deliveryId: string, event: string) {
    const application = await this.repositories.app.config()
    verifyWebhook(raw, signature, application?.webhookSecret)
    if (!/^[\w-]{1,100}$/.test(deliveryId) || !/^[a-z_]{1,80}$/.test(event)) throw new ReviewError('invalid_webhook_headers')
    if (event !== 'pull_request' && event !== 'workflow_run') return null
    const parsed = eventSchema.parse({ event, data: JSON.parse(raw!.toString('utf8')) })
    const p = await this.repositories.records.findOneBy({ installationId: String(parsed.data.installation.id), repositoryId: String(parsed.data.repository.id) })
    if (!p) return null
    if (application?.tenantId && application.tenantId !== p.tenantId) throw new ReviewError('github_integration_unavailable')
    assertGitHubRepositoryApplication(application!, p)
    const digest = createHash('sha256').update(raw!).digest('hex')
    // No policy row lock, external authorization, raw body, signature, or credentials in this insert.
    const payload: StoredWebhook = { policyRevision: p.executionRevision, appId: application!.appId,
      integrationId: application!.integrationId ?? null, event: parsed }
    await this.deliveries.createQueryBuilder().insert().values({ deliveryId, event, digest,
      tenantId: p.tenantId, organizationId: p.organizationId, repositoryPolicyId: p.id, status: 'received', payload }).orIgnore().execute()
    const saved = await this.deliveries.findOneByOrFail({ deliveryId })
    if (saved.digest !== digest || saved.event !== event || saved.tenantId !== p.tenantId || saved.organizationId !== p.organizationId ||
      (saved.repositoryPolicyId && saved.repositoryPolicyId !== p.id)) throw new ReviewError('delivery_payload_mismatch')
    return p
  }

  async process(p: ReviewRepository, id: string, assertOwned: AssertAutomationOwnership) {
    const delivery = await this.deliveries.findOneBy({ id, repositoryPolicyId: p.id, tenantId: p.tenantId, organizationId: p.organizationId })
    if (!delivery || delivery.status !== 'received' || delivery.retryAt > new Date()) return
    try {
      const stored = envelopeSchema.parse(delivery.payload)
      const application = await this.repositories.app.config()
      if (!application) throw new ReviewError('github_app_not_configured')
      if (stored.policyRevision !== p.executionRevision || application.appId !== stored.appId ||
        (application.integrationId ?? null) !== stored.integrationId || (application.tenantId && application.tenantId !== p.tenantId)) {
        await assertOwned()
        await this.deliveries.update({ id: delivery.id, status: 'received' }, { status: 'processed', payload: null, errorCode: 'webhook_binding_changed' })
        return
      }
      assertGitHubRepositoryApplication(application, p)
      if (stored.event.event === 'workflow_run') {
        await this.workflows.receive(p, stored.event.data, delivery.deliveryId, delivery.digest, assertOwned)
      } else {
        await this.pull(p, stored.event.data, delivery, assertOwned)
      }
      await this.events.activity(p, 'event').catch(() => logger.warn('Webhook activity timestamp update failed'))
    } catch (error) {
      await assertOwned()
      const code = error instanceof ReviewError ? error.code : 'webhook_processing_failed'
      await this.deliveries.update({ id: delivery.id, status: 'received' }, { attempts: delivery.attempts + 1, errorCode: code,
        retryAt: new Date(Date.now() + Math.min(300_000, 5000 * 2 ** Math.min(delivery.attempts, 6))) })
      logger.warn(`Delivery ${delivery.id}: ${code}; retained for retry`)
    }
  }

  private async pull(p: ReviewRepository, payload: PullEvent, delivery: ReviewDelivery, assertOwned: AssertAutomationOwnership) {
    const execution = await this.repositories.execution(p)
    let authorizationReason: string | null = null
    if (p.settings.executionMode === 'assistant') {
      try { await this.events.assertListening(execution) }
      catch (error) {
        if (!(error instanceof ReviewError) || error.code !== 'github_trigger_paused') throw error
        authorizationReason = error.code
      }
    }
    await assertOwned()
    // Existing webhook atomic boundary: only database work; a busy row leaves the durable inbox pending.
    await this.deliveries.manager.transaction(async manager => {
      const locked = await manager.findOneOrFail(ReviewRepository, { where: { id: p.id }, lock: { mode: 'pessimistic_write', onLocked: 'nowait' } })
      const previous = await manager.findOneByOrFail(ReviewDelivery, { id: delivery.id })
      if (previous.status === 'processed') return
      if (locked.executionRevision !== p.executionRevision) throw new ReviewError('revision_conflict')
      let reason = triggerDecision(locked.settings, payload) ?? authorizationReason
      if (locked.settings.executionMode !== 'assistant' && !locked.settings.pipeline) reason ??= 'pipeline_binding_required'
      const pr = payload.pull_request
      const operationKey = `${pr.number}-${pr.head.sha}-${locked.executionRevision}${reason ? '-skip-' + payload.action : ''}`
      let run = await manager.findOneBy(ReviewRun, { repositoryPolicyId: locked.id, operationKey })
      if (!run) run = await manager.save(ReviewRun, manager.create(ReviewRun, { tenantId: locked.tenantId, organizationId: locked.organizationId,
        assistantId: locked.assistantId, evidenceUserId: execution.userId, organizationShared: locked.ownership === 'assistant' && locked.settings.visibility === 'organization',
        repositoryPolicyId: locked.id, operationKey, number: pr.number, headSha: pr.head.sha, title: pr.title, trigger: payload.action,
        settings: locked.settings, policyRevision: locked.executionRevision,
        status: reason && ['pipeline_binding_required', 'assistant_binding_required', 'assistant_execution_unavailable'].includes(reason) ? 'needs_configuration' : reason ? 'skipped' : 'queued', reason,
        notBefore: new Date(Date.now() + (payload.action === 'synchronize' ? 30000 : 0)), finishedAt: reason ? new Date() : null }))
      await manager.update(ReviewDelivery, { id: previous.id }, { runId: run.id, status: 'processed', payload: null, errorCode: null })
      await manager.update(ReviewRepository, { id: locked.id }, { lastEventAt: new Date() })
    })
  }
}
