import { visibleReviewRuns } from './review-run-visibility.js'
import { Injectable, ForbiddenException } from '@nestjs/common'
import {
  type AgentOutputSource,
  type AgentEventContext,
  type AgentEventDelivery,
  type AgentEventPublisher,
  type PluginAgentEventSource,
  type EventDecision
} from '@xpert-ai/plugin-sdk'
import { IsNull, LessThanOrEqual, Not } from 'typeorm'
import { z } from 'zod/v3'
import { Reviews } from './backend.js'
import { ReviewDelivery, ReviewRun } from './automation-entities.js'
import { WorkflowDiagnosis } from './workflow-entity.js'
import { ReviewWebhookInbox } from './webhook-inbox.js'
import { Repositories } from './repositories.js'
import { digestSnapshot, eventSource, journal } from './event-journal.js'

const key = 'code_review.github'
export const reviewEventTypes = {
  pull_request: 'code_review.pull_request',
  workflow_run: 'code_review.workflow_run'
} as const
const reference = z.object({ id: z.string().uuid(), digest: z.string().length(64), payload: z.unknown() }).strict()

const category = {
  key: 'github',
  label: { en_US: 'GitHub events', zh_Hans: 'GitHub 事件' },
  icon: { type: 'font', value: 'git-branch' }
} as const

@Injectable()
@eventSource(key)
export class ReviewEventSource implements PluginAgentEventSource {
  readonly protocolVersion = 1
  readonly key = key
  readonly eventTypes = [
    {
      type: reviewEventTypes.pull_request,
      schemaVersion: 1,
      display: {
        category,
        label: { en_US: 'Pull request', zh_Hans: '拉取请求' },
        icon: { type: 'font', value: 'git-pull-request' }
      }
    },
    {
      type: reviewEventTypes.workflow_run,
      schemaVersion: 1,
      display: {
        category,
        label: { en_US: 'Workflow run', zh_Hans: '工作流运行' },
        icon: { type: 'font', value: 'workflow' }
      }
    }
  ] as const
  constructor(
    private readonly repositories: Repositories,
    private readonly inbox: ReviewWebhookInbox,
    private readonly reviews: Reviews
  ) {}
  private async repository(ctx: AgentEventContext) {
    const p = await this.repositories.records.findOneBy({
      id: ctx.sourceBindingRef,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      workspaceId: ctx.workspaceId,
      assistantId: ctx.xpertId
    })
    if (
      !p ||
      ![p.configuredById, p.responsibleUserId, p.userId].includes(ctx.userId) ||
      (p.settings.pipeline?.projectId ?? undefined) !== ctx.projectId
    )
      throw new ForbiddenException('review_source_access')
    return p
  }
  async configure(ctx: AgentEventContext, enabled: boolean) {
    await this.repository(ctx)
    await this.repositories.records.manager.transaction((tx) => journal!.configure(tx, ctx, enabled))
  }
  async drain(ctx: AgentEventContext, publisher: AgentEventPublisher, limit: number) {
    await this.repository(ctx)
    return journal!.drain(this.repositories.records.manager, ctx, publisher, limit)
  }
  private async results(ctx: AgentEventContext) {
    const p = await this.repository(ctx)
    const scope = {
      repositoryPolicyId: p.id,
      tenantId: ctx.tenantId,
      organizationId: ctx.organizationId,
      assistantId: ctx.xpertId
    }
    const runs = visibleReviewRuns(
      this.repositories.records.manager.getRepository(ReviewRun),
      {
        ...scope,
        userId: ctx.userId,
        projectId: ctx.projectId
      },
      [p]
    )
      .andWhere({ assistantId: ctx.xpertId })
      .setParameter('organizationEvidence', true)
    const workflows = this.repositories.records.manager
      .createQueryBuilder(WorkflowDiagnosis, 'w')
      .where(scope)
      .andWhere('(w."userId" = :actor OR w."organizationShared")', { actor: ctx.userId })
    return { runs, workflows }
  }
  get outputs(): AgentOutputSource {
    return {
      kinds: [{ key: 'code_review.result', label: { en_US: 'Code review result', zh_Hans: '代码评审结果' } }],
      listPending: async (ctx, limit) => {
        const { runs } = await this.results(ctx)
        const rows = await runs.andWhere({ evidenceUserId: ctx.userId, outputPending: true, outputAvailableAt: LessThanOrEqual(new Date()) })
          .andWhere("run.status IN ('completed','published') AND run.\"finishedAt\" IS NOT NULL")
          .orderBy('run.finishedAt', 'ASC').addOrderBy('run.id', 'ASC').take(limit).getMany()
        return rows.map(r => ({ schemaVersion: 1, kind: 'code_review.result', key: r.id,
          revision: r.headSha, recipientId: ctx.userId, publishedAt: r.finishedAt!.toISOString() }))
      },
      acknowledge: async (ctx, ref, messageId) => {
        const policy = await this.repository(ctx)
        const where = { id: ref.key, tenantId: ctx.tenantId, organizationId: ctx.organizationId,
          evidenceUserId: ctx.userId, repositoryPolicyId: policy.id, headSha: ref.revision }
        const repo = this.repositories.records.manager.getRepository(ReviewRun)
        const result = await repo.update({ ...where, outputPending: true }, { outputPending: false, outputMessageId: messageId })
        if (!result.affected && !(await repo.existsBy({ ...where, outputMessageId: messageId }))) return 'conflict'
      },
      defer: async (ctx, ref, retryAt) => {
        const policy = await this.repository(ctx)
        await this.repositories.records.manager.update(ReviewRun, {
          id: ref.key, tenantId: ctx.tenantId, organizationId: ctx.organizationId, repositoryPolicyId: policy.id,
          headSha: ref.revision, evidenceUserId: ctx.userId, outputPending: true,
          outputAvailableAt: retryAt ? LessThanOrEqual(new Date()) : Not(IsNull())
        }, { outputAvailableAt: retryAt ? new Date(retryAt) : null })
      },
      resolveForRecipient: async (ctx, ref) => {
        if (ref.kind !== 'code_review.result' || ref.recipientId !== ctx.userId) return { status: 'forbidden' }
        const { runs } = await this.results(ctx)
        const run = await runs.andWhere({ id: ref.key, evidenceUserId: ctx.userId, headSha: ref.revision }).getOne()
        if (!run) return { status: 'forbidden' }
        if (!['completed','published'].includes(run.status)) return { status: 'superseded' }
        const presentation = await this.presentDecision(ctx, { status: 'handled', operationKey: run.operationKey,
          resultRef: { kind: 'review-run', key: run.id } }, { includeConversation: true })
        return { status: 'visible', title: ('PR #' + run.number + ' · ' + run.title).slice(0,240),
          fields: presentation?.result?.fields.map(({ label, value }) => ({ label, value: value.slice(0, 4000) })),
          ...(presentation?.conversation ? { conversation: presentation.conversation } : {}) }
      }
    }
  }

  async searchTitles(ctx: AgentEventContext, term: string) {
    const { runs, workflows } = await this.results(ctx)
    const [pr, wf] = await Promise.all([
      runs
        .select('run.id', 'id')
        .andWhere("strpos(lower(concat('PR #',run.number,' · ',run.title)),lower(:term)) > 0", { term })
        .getRawMany<{ id: string }>(),
      workflows
        .select('w.id', 'id')
        .andWhere("strpos(lower(w.ref->>'name'),lower(:term)) > 0", { term })
        .getRawMany<{ id: string }>()
    ])
    return [
      ...pr.map((r) => ({ result: { kind: 'review-run', key: r.id } })),
      ...wf.map((w) => ({ result: { kind: 'workflow-diagnosis', key: w.id } }))
    ]
  }
  async describe(
    ctx: AgentEventContext,
    _event: AgentEventDelivery['event'],
    decision: EventDecision | null,
    options?: { includeConversation: boolean }
  ) {
    return this.presentDecision(ctx, decision, options)
  }
  private async presentDecision(ctx: AgentEventContext, decision: EventDecision | null, options?: { includeConversation: boolean }) {
    if (decision?.status !== 'handled' || !decision.resultRef) return null
    const { runs, workflows } = await this.results(ctx)
    const target = { id: decision.resultRef.key, operationKey: decision.operationKey }
    const status = { en_US: 'Status', zh_Hans: '状态' }
    const commit = { en_US: 'Commit', zh_Hans: '提交' }
    if (decision.resultRef.kind === 'workflow-diagnosis') {
      const workflow = await workflows.andWhere(target).getOne()
      return workflow
        ? {
            title: workflow.ref.name,
            conversation: options?.includeConversation && workflow.conversationId ? { conversationId: workflow.conversationId } : undefined,
            result: {
              action: { en_US: 'Open workflow diagnosis', zh_Hans: '查看工作流诊断' },
              fields: [
                { label: status, value: workflow.status },
                { label: commit, value: workflow.ref.headSha }
              ]
            }
          }
        : null
    }
    if (decision.resultRef.kind !== 'review-run') return null
    const run = await runs.andWhere(target).getOne()
    if (!run) return null
    const fields = [
      { label: status, value: run.status },
      { label: commit, value: run.headSha },
      { label: { en_US: 'Trigger', zh_Hans: '触发方式' }, value: run.trigger }
    ]
    let conversation: { conversationId: string } | undefined
    let action = { en_US: 'View review run', zh_Hans: '查看评审运行' }
    if (run.reviewId) {
      const record = await this.reviews
        .get(
          {
            tenantId: ctx.tenantId,
            organizationId: ctx.organizationId,
            assistantId: ctx.xpertId,
            userId: ctx.userId,
            workspaceId: ctx.workspaceId
          },
          run.reviewId
        )
        .catch(() => null)
      if (record?.automationRunId === run.id && record.assistantId === ctx.xpertId) {
        if (options?.includeConversation && record.conversationId) conversation = { conversationId: record.conversationId }
        action = { en_US: 'Open review', zh_Hans: '打开评审' }
        fields.push({ label: { en_US: 'Review status', zh_Hans: '评审状态' }, value: record.status })
        if (record.summary)
          fields.push({ label: { en_US: 'Review summary', zh_Hans: '评审摘要' }, value: record.summary })
      }
    }
    return { title: `PR #${run.number} · ${run.title}`, conversation, result: { action, fields } }
  }
  async handle(ctx: AgentEventContext, delivery: AgentEventDelivery): Promise<EventDecision> {
    const p = await this.repository(ctx)
    return this.repositories.records.manager.transaction((tx) =>
      journal!.decide(tx, ctx, delivery, async (data) => {
        const ref = reference.parse(data)
        const where = {
          id: ref.id,
          repositoryPolicyId: p.id,
          deliveryId: delivery.event.sourceEventId,
          digest: ref.digest
        }
        const initial = await tx.findOneByOrFail(ReviewDelivery, where)
        if (initial.status === 'received') return { status: 'blocked', reasonCode: 'legacy_delivery' }
        if (digestSnapshot(initial.payload) !== digestSnapshot(ref.payload))
          return { status: 'blocked', reasonCode: 'review_snapshot_changed' }
        await this.inbox.process(p, ref.id, async () => ctx.signal.throwIfAborted(), tx)
        const row = await tx.findOneByOrFail(ReviewDelivery, where)
        if (row.status !== 'processed') throw new Error('review_delivery_pending')
        if (!row.runId) return { status: 'ignored', reasonCode: 'webhook_binding_changed' }
        const workflow = row.event === 'workflow_run'
        const run = workflow
          ? await tx.findOneByOrFail(WorkflowDiagnosis, { id: row.runId, repositoryPolicyId: p.id })
          : await tx.findOneByOrFail(ReviewRun, { id: row.runId, repositoryPolicyId: p.id })
        return {
          status: 'handled',
          operationKey: run.operationKey,
          resultRef: { kind: workflow ? 'workflow-diagnosis' : 'review-run', key: row.runId }
        }
      })
    )
  }
}
