import { Injectable } from '@nestjs/common'
import { ProjectPipelineRuntimeAdapterProvider as Adapter, type ProjectPipelineContext,
  type ProjectPipelineOperationContext, type ProjectPipelineAssistantContext } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef, ProjectPipelineSubjectVersion } from '@xpert-ai/contracts'
import { pipelineSnapshotSchema, pipelineFindingsSchema, pipelineChecksSchema, pipelineDeliverySchema, pipelineLocalDeliverySchema, refs } from './contract.js'
import { ReviewPipelineService } from './service.js'
import { ReviewPipelineOperations } from './operations.js'

@Injectable() @Adapter('schema', refs.snapshot)
export class ReviewSnapshotSchema { readonly kind = 'schema'; readonly ref = refs.snapshot; parse = (value: unknown) => pipelineSnapshotSchema.parse(value) }
@Injectable() @Adapter('schema', refs.findings)
export class ReviewFindingsSchema { readonly kind = 'schema'; readonly ref = refs.findings; parse = (value: unknown) => pipelineFindingsSchema.parse(value) }
@Injectable() @Adapter('schema', refs.checks)
export class ReviewChecksSchema { readonly kind = 'schema'; readonly ref = refs.checks; parse = (value: unknown) => pipelineChecksSchema.parse(value) }
@Injectable() @Adapter('schema', refs.delivery)
export class ReviewDeliverySchema { readonly kind = 'schema'; readonly ref = refs.delivery; parse = (value: unknown) => pipelineDeliverySchema.parse(value) }

@Injectable() @Adapter('schema', refs.localDelivery)
export class ReviewLocalDeliverySchema { readonly kind = 'schema'; readonly ref = refs.localDelivery; parse = (value: unknown) => pipelineLocalDeliverySchema.parse(value) }
@Injectable() @Adapter('subject', refs.localSubject)
export class LocalReviewSubjectAdapter {
  readonly kind = 'subject'; readonly ref = refs.localSubject
  constructor(private readonly service: ReviewPipelineService) {}
  async resolve(c: ProjectPipelineContext, key: string) {
    const subject = await this.service.subject(c, key)
    if (subject.resolverRef !== refs.localSubject) throw new Error('local_snapshot_required')
    return subject
  }
  checkCurrent(c: ProjectPipelineContext, version: ProjectPipelineSubjectVersion) { return this.service.current(c, version) }
}
@Injectable() @Adapter('operation', refs.archive)
export class ReviewArchiveAdapter {
  readonly kind = 'operation'; readonly ref = refs.archive
  constructor(private readonly operations: ReviewPipelineOperations) {}
  execute(c: ProjectPipelineOperationContext) { return this.operations.archive(c, true) }
  inspect(c: ProjectPipelineOperationContext) { return this.operations.archive(c, false) }
}
@Injectable() @Adapter('subject', refs.subject)
export class ReviewSubjectAdapter {
  readonly kind = 'subject'; readonly ref = refs.subject
  constructor(private readonly service: ReviewPipelineService) {}
  resolve(c: ProjectPipelineContext, key: string) { return this.service.subject(c, key) }
  checkCurrent(c: ProjectPipelineContext, version: ProjectPipelineSubjectVersion) { return this.service.current(c, version) }
}
@Injectable() @Adapter('evidence', refs.evidence)
export class ReviewEvidenceAdapter {
  readonly kind = 'evidence'; readonly ref = refs.evidence
  constructor(private readonly service: ReviewPipelineService) {}
  read(c: ProjectPipelineContext, ref: ProjectPipelineEvidenceRef) { return this.service.read(c, ref) }
}
@Injectable() @Adapter('operation', refs.prepare)
export class ReviewPreparationAdapter {
  readonly kind = 'operation'; readonly ref = refs.prepare
  constructor(private readonly service: ReviewPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.prepare(c) }
  inspect(c: ProjectPipelineOperationContext) { return this.service.prepare(c) }
}
@Injectable() @Adapter('assistant_operation', refs.correctness)
export class ReviewCorrectnessAdapter {
  readonly kind = 'assistant_operation'; readonly ref = refs.correctness
  constructor(private readonly service: ReviewPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepareAssistant(c, 'correctness') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'correctness') }
}
@Injectable() @Adapter('assistant_operation', refs.security)
export class ReviewSecurityAdapter {
  readonly kind = 'assistant_operation'; readonly ref = refs.security
  constructor(private readonly service: ReviewPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepareAssistant(c, 'security') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'security') }
}
@Injectable() @Adapter('assistant_operation', refs.verify)
export class ReviewVerificationAdapter {
  readonly kind = 'assistant_operation'; readonly ref = refs.verify
  constructor(private readonly service: ReviewPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepareAssistant(c, 'verify') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'verify') }
}
@Injectable() @Adapter('subscription', refs.ci)
export class ReviewChecksAdapter {
  readonly kind = 'subscription'; readonly ref = refs.ci
  constructor(private readonly operations: ReviewPipelineOperations) {}
  execute(c: ProjectPipelineOperationContext) { return this.operations.checks(c) }
  inspect(c: ProjectPipelineOperationContext) { return this.operations.checks(c) }
}
@Injectable() @Adapter('policy', refs.readiness)
export class ReviewReadinessAdapter {
  readonly kind = 'policy'; readonly ref = refs.readiness
  constructor(private readonly operations: ReviewPipelineOperations) {}
  evaluate(c: ProjectPipelineOperationContext) { return this.operations.readiness(c) }
}
@Injectable() @Adapter('policy', refs.approval)
export class ReviewApprovalAdapter {
  readonly kind = 'policy'; readonly ref = refs.approval
  constructor(private readonly operations: ReviewPipelineOperations) {}
  async evaluate() { return { status: 'blocked' as const, code: 'human_decision_required' } }
  authorizeDecision(c: ProjectPipelineOperationContext, input: { candidateSelectionKey: string; outcome: string }) {
    return this.operations.authorize(c, input.candidateSelectionKey, input.outcome)
  }
}
@Injectable() @Adapter('operation', refs.publish)
export class ReviewPublishAdapter {
  readonly kind = 'operation'; readonly ref = refs.publish
  constructor(private readonly operations: ReviewPipelineOperations) {}
  execute(c: ProjectPipelineOperationContext) { return this.operations.publish(c, true) }
  inspect(c: ProjectPipelineOperationContext) { return this.operations.inspect(c) }
}
@Injectable() @Adapter('subscription', refs.confirmed)
export class ReviewConfirmationAdapter {
  readonly kind = 'subscription'; readonly ref = refs.confirmed
  constructor(private readonly operations: ReviewPipelineOperations) {}
  execute(c: ProjectPipelineOperationContext) { return this.operations.confirmed(c) }
  inspect(c: ProjectPipelineOperationContext) { return this.operations.confirmed(c) }
}
export const reviewPipelineAdapters = [ReviewSnapshotSchema, ReviewFindingsSchema, ReviewChecksSchema, ReviewDeliverySchema,
  ReviewLocalDeliverySchema, LocalReviewSubjectAdapter, ReviewArchiveAdapter, ReviewSubjectAdapter, ReviewEvidenceAdapter, ReviewPreparationAdapter, ReviewCorrectnessAdapter, ReviewSecurityAdapter,
  ReviewVerificationAdapter, ReviewChecksAdapter, ReviewReadinessAdapter, ReviewApprovalAdapter, ReviewPublishAdapter, ReviewConfirmationAdapter]
