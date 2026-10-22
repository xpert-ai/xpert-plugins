import { Injectable, Inject } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { z } from 'zod/v3'
import { ProjectAccessRuntimeCapability, ProjectPipelineEvidenceRuntimeCapability, type ProjectPipelineOperationContext,
  XPERT_RUNTIME_CAPABILITIES_TOKEN, type RuntimeCapabilityRegistry } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineOperationReceipt, ProjectPipelinePolicyReceipt } from '@xpert-ai/contracts'
import { ReviewPipelineService } from './service.js'
import { Reviews } from '../backend.js'
import { ReviewError } from '../domain.js'
import { ReviewRun } from '../automation-entities.js'
import { Review } from '../entity.js'
import { ReviewPipelineEvidence } from './entity.js'
import { ReviewPipelineDelivery } from './entity.js'
import { pipelineOwner, sourceVersion } from './access.js'
import { digest, evidenceId, pipelineLocalDeliverySchema, pipelineChecksSchema, pipelineDeliverySchema, pipelineFindingsSchema, pipelineParametersSchema, refs } from './contract.js'

@Injectable()
export class ReviewPipelineOperations {
  constructor(private readonly pipeline: ReviewPipelineService, private readonly reviews: Reviews,
    @InjectRepository(ReviewPipelineDelivery) private readonly deliveries: Repository<ReviewPipelineDelivery>,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN) private readonly capabilities: RuntimeCapabilityRegistry) {}

  async checks(context: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const { record, scope } = await this.pipeline.pinned(context)
    const saved = await this.pipeline.saved(context, 'checks')
    if (saved) return { status: 'succeeded', receiptKey: context.work.operationId, outputs: { checks: saved } }
    const parameters = pipelineParametersSchema.parse(context.parameters)
    const result = record.ref.provider === 'local_git' ? { checks: record.snapshot.checks, truncated: false }
      : await (await this.reviews.recordGithub(scope, record)).checks(record.ref, record.snapshot.headSha)
    const relevant = parameters.requiredChecks.length ? result.checks.filter(check => parameters.requiredChecks.includes(check.name)) : result.checks
    if (relevant.some(check => check.status !== 'completed') || parameters.requiredChecks.some(name => !result.checks.some(check => check.name === name)))
      return { status: 'pending', receiptKey: context.work.operationId }
    const state = !parameters.requireChecks && !relevant.length ? 'not_required' : result.truncated || (parameters.requireChecks && !relevant.length) ? 'unavailable'
      : relevant.every(check => check.conclusion === 'success' || check.conclusion === 'neutral' || check.conclusion === 'skipped') ? 'passed' : 'failed'
    return { status: 'succeeded', receiptKey: context.work.operationId, outputs: { checks: await this.pipeline.write(context, 'checks', refs.checks,
      pipelineChecksSchema.parse({ headSha: record.snapshot.headSha, state, checks: relevant, warnings: result.truncated ? ['checks_truncated'] : [] })) } }
  }
  async readiness(context: ProjectPipelineOperationContext): Promise<ProjectPipelinePolicyReceipt> {
    await this.pipeline.pinned(context)
    const findings = pipelineFindingsSchema.parse(await this.pipeline.input(context, 'findings'))
    const checks = pipelineChecksSchema.parse(await this.pipeline.input(context, 'checks'))
    const parameters = pipelineParametersSchema.parse(context.parameters)
    if (!['verify', 'review'].includes(findings.pass) || findings.headSha !== checks.headSha || findings.inputDigest !== context.work.inputDigest)
      return { status: 'blocked', code: 'review_evidence_mismatch' }
    return { status: 'decided', outcome: (checks.state !== 'passed' && !(checks.state === 'not_required' && !parameters.requireChecks)) || findings.findings.some(finding => parameters.blockingPriorities.includes(finding.priority))
      ? 'rework' : 'human', evidence: Object.values(context.inputs).flatMap(input => input.kind === 'evidence' ? [input.value] : []) }
  }
  async authorize(context: ProjectPipelineOperationContext, candidate: string, outcome: string) {
    if (candidate !== 'project-managers' || !['accepted', 'rework'].includes(outcome)) return false
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage(context)
    const { record } = await this.pipeline.pinned(context)
    if (record.automationRunId && outcome === 'accepted') {
      const run = await this.deliveries.manager.findOneByOrFail(ReviewRun, { id: record.automationRunId })
      if (run.trigger === 'trial') throw new ReviewError('trial_cannot_publish')
    }
    return true
  }
  async publish(context: ProjectPipelineOperationContext, execute: boolean): Promise<ProjectPipelineOperationReceipt> {
    const { record, scope, binding } = await this.pipeline.pinned(context)
    if (record.automationRunId) {
      const run = await this.deliveries.manager.findOneByOrFail(ReviewRun, { id: record.automationRunId })
      if (run.trigger === 'trial') throw new ReviewError('trial_cannot_publish')
    }
    if (record.ref.provider !== 'github') throw new ReviewError('local_review_has_no_remote_delivery')
    const existing = await this.deliveries.findOneBy({ ...pipelineOwner(context), operationId: context.work.operationId })
    if (existing || !execute) return this.inspect(context)
    const report = await this.approvedReport(context, record.snapshot.headSha)
    const marker = `<!-- xpert-code-review-pipeline:${context.work.operationId} -->`
    const github = await this.reviews.recordGithub(scope, record), authorId = await github.identity()
    const body = `${report.summary}\n\n${marker}`
    // Committing the exact operation before POST makes unknown delivery inspect-only, including process loss.
    await this.deliveries.insert({ id: context.work.operationId, ...pipelineOwner(context), reviewId: binding.id,
      operationId: context.work.operationId, headSha: report.headSha, marker, authorId, body, status: 'sending', receipt: null })
    try {
      const result = await github.submit(record.ref, report.headSha, body, 'COMMENT', report.findings)
      const receipt = pipelineDeliverySchema.parse({ headSha: report.headSha, reviewId: result.id, url: result.html_url, marker, event: 'COMMENT' })
      await this.deliveries.update({ ...pipelineOwner(context), id: context.work.operationId }, { status: 'confirmed', receipt })
      return { status: 'succeeded', receiptKey: context.work.operationId,
        outputs: { receipt: await this.pipeline.write(context, 'receipt', refs.delivery, receipt) } }
    } catch {
      await this.deliveries.update({ ...pipelineOwner(context), id: context.work.operationId, status: 'sending' }, { status: 'unknown' })
      return { status: 'unknown', receiptKey: context.work.operationId }
    }
  }
  private async approvedReport(context: ProjectPipelineOperationContext, headSha: string) {
    const approval = context.inputs.approval
    if (approval?.kind !== 'evidence' || approval.value.schemaRef !== 'platform.human-decision@1') throw new ReviewError('approval_required')
    const value = await this.capabilities.require(ProjectPipelineEvidenceRuntimeCapability).read(context, approval.value)
    const decision = z.object({ kind: z.literal('human'), outcome: z.literal('accepted'), actorId: z.string().uuid(),
      inputDigest: z.literal(context.work.inputDigest), generation: z.literal(context.work.generation) }).parse(value)
    if (digest(value) !== approval.value.digest) throw new ReviewError('approval_required')
    await this.capabilities.require(ProjectAccessRuntimeCapability).assertManage({ ...context, actor: { ...context.actor, userId: decision.actorId } })
    const report = pipelineFindingsSchema.parse(await this.pipeline.input(context, 'findings'))
    if (!['verify', 'review'].includes(report.pass) || report.headSha !== headSha || report.inputDigest !== context.work.inputDigest)
      throw new ReviewError('stale_revision')
    return report
  }
  async archive(context: ProjectPipelineOperationContext, execute: boolean): Promise<ProjectPipelineOperationReceipt> {
    const { record } = await this.pipeline.pinned(context)
    if (record.ref.provider !== 'local_git') throw new ReviewError('local_snapshot_required')
    const saved = await this.pipeline.saved(context, 'receipt')
    if (saved) return { status: 'succeeded', receiptKey: context.work.operationId, outputs: { receipt: saved } }
    if (!execute) return { status: 'unknown', receiptKey: context.work.operationId }
    const report = await this.approvedReport(context, record.snapshot.headSha)
    const receipt = pipelineLocalDeliverySchema.parse({ kind: 'platform', headSha: report.headSha,
      reviewId: record.id, findingsDigest: digest(report) })
    const id = evidenceId(context.work.operationId, 'receipt'), hash = digest(receipt)
    await this.deliveries.manager.transaction(async manager => {
      const root = await manager.findOneOrFail(Review, { where: { id: record.id, tenantId: context.actor.tenantId,
        organizationId: context.actor.organizationId!, userId: context.actor.userId }, lock: { mode: 'pessimistic_write' } })
      if (sourceVersion(root).digest !== sourceVersion(record).digest) throw new ReviewError('stale_revision')
      const prior = await manager.findOneBy(ReviewPipelineEvidence, { ...pipelineOwner(context), id })
      if (prior) {
        if (prior.digest !== hash) throw new ReviewError('pipeline_evidence_immutable')
        return
      }
      root.summary = report.summary; root.findings = report.findings; root.status = 'reviewed'; root.revision++
      await manager.save(root)
      await manager.insert(ReviewPipelineEvidence, { id, ...pipelineOwner(context), operationId: context.work.operationId,
        reviewId: root.id, port: 'receipt', schemaRef: refs.localDelivery, digest: hash, content: receipt })
    })
    const persisted = await this.pipeline.saved(context, 'receipt')
    if (!persisted) throw new ReviewError('pipeline_evidence_unavailable')
    return { status: 'succeeded', receiptKey: context.work.operationId, outputs: { receipt: persisted } }
  }
  async inspect(context: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const { record, scope } = await this.pipeline.root(context, context.subjects[0].objectKey)
    if (record.ref.provider !== 'github') throw new ReviewError('local_review_has_no_remote_delivery')
    const row = await this.deliveries.findOneBy({ ...pipelineOwner(context), operationId: context.work.operationId })
    if (!row) return { status: 'unknown', receiptKey: context.work.operationId }
    let receipt = row.receipt ? pipelineDeliverySchema.parse(row.receipt) : null
    if (!receipt) {
      const found = await (await this.reviews.recordGithub(scope, record)).findReview(record.ref, row.headSha, row.marker, row)
      if (!found) return { status: 'unknown', receiptKey: context.work.operationId }
      receipt = pipelineDeliverySchema.parse({ headSha: row.headSha, reviewId: found.id, url: found.html_url, marker: row.marker, event: 'COMMENT' })
      await this.deliveries.update({ ...pipelineOwner(context), id: row.id }, { status: 'confirmed', receipt })
    }
    return { status: 'succeeded', receiptKey: context.work.operationId,
      outputs: { receipt: await this.pipeline.write(context, 'receipt', refs.delivery, receipt) } }
  }
  async confirmed(context: ProjectPipelineOperationContext): Promise<ProjectPipelineOperationReceipt> {
    const { record, scope } = await this.pipeline.root(context, context.subjects[0].objectKey)
    if (record.ref.provider !== 'github') throw new ReviewError('local_review_has_no_remote_delivery')
    const receipt = pipelineDeliverySchema.parse(await this.pipeline.input(context, 'receipt'))
    const input = context.inputs.receipt
    if (input?.kind !== 'evidence' || !input.value.producerOperationId) throw new ReviewError('pipeline_input_missing')
    const delivery = await this.deliveries.findOneByOrFail({ ...pipelineOwner(context), operationId: input.value.producerOperationId })
    const found = await (await this.reviews.recordGithub(scope, record)).findReview(record.ref, receipt.headSha, receipt.marker, delivery)
    if (!found || found.id !== receipt.reviewId || found.html_url !== receipt.url) return { status: 'pending', receiptKey: context.work.operationId }
    return { status: 'succeeded', receiptKey: context.work.operationId,
      outputs: { receipt: await this.pipeline.write(context, 'receipt', refs.delivery, receipt) } }
  }
}
