import { Injectable } from '@nestjs/common'
import { ProjectPipelineRuntimeAdapterProvider as Adapter, type ProjectPipelineContext, type ProjectPipelineOperationContext, type ProjectPipelineAssistantContext } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef, ProjectPipelineSubjectVersion } from '@xpert-ai/contracts'
import { MaterialPipelineService } from './service.js'
import { refs, operationRef } from './configuration.js'
import { resultSchema } from './entity.js'
@Injectable() @Adapter('schema', refs.result)
export class MaterialResultSchema { readonly kind = 'schema'; readonly ref = refs.result; parse = (value: unknown) => resultSchema.parse(value) }
@Injectable() @Adapter('subject', refs.subject)
export class MaterialSubjectAdapter {
  readonly kind = 'subject'; readonly ref = refs.subject
  constructor(private readonly service: MaterialPipelineService) {}
  resolve(c: ProjectPipelineContext, id: string) { return this.service.subject(c, id) }
  checkCurrent(c: ProjectPipelineContext, v: ProjectPipelineSubjectVersion) { return this.service.current(c, v) }
  resolveEntry(c: ProjectPipelineContext, id: string) { return this.service.entry(c, id) }
}
@Injectable() @Adapter('evidence', refs.evidence)
export class MaterialEvidenceAdapter {
  readonly kind = 'evidence'; readonly ref = refs.evidence
  constructor(private readonly service: MaterialPipelineService) {}
  read(c: ProjectPipelineContext, ref: ProjectPipelineEvidenceRef) { return this.service.read(c, ref) }
}
@Injectable() @Adapter('policy', refs.route)
export class MaterialConflictAdapter {
  readonly kind = 'policy'; readonly ref = refs.route
  constructor(private readonly service: MaterialPipelineService) {}
  evaluate(c: ProjectPipelineOperationContext) { return this.service.route(c) }
}
@Injectable() @Adapter('policy', refs.approval)
export class MaterialApprovalAdapter {
  readonly kind = 'policy'; readonly ref = refs.approval
  constructor(private readonly service: MaterialPipelineService) {}
  async evaluate() { return { status: 'blocked' as const, code: 'human_decision_required' } }
  authorizeDecision(c: ProjectPipelineOperationContext, i: { candidateSelectionKey: string; outcome: string }) { return this.service.authorize(c, i.candidateSelectionKey, i.outcome) }
}
@Injectable() @Adapter('operation', refs.decision)
export class MaterialDecisionAdapter {
  readonly kind = 'operation'; readonly ref = refs.decision
  constructor(private readonly service: MaterialPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.recordDecision(c, true) }
  inspect(c: ProjectPipelineOperationContext) { return this.service.recordDecision(c, true) }
}
@Injectable() @Adapter('operation', refs.containment)
export class MaterialContainmentAdapter {
  readonly kind = 'operation'; readonly ref = refs.containment
  constructor(private readonly service: MaterialPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.contain(c) }
  inspect(c: ProjectPipelineOperationContext) { return this.service.contain(c) }
}
@Injectable() @Adapter('assistant_operation', operationRef('collect-evidence'))
export class MaterialCollectEvidenceAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('collect-evidence')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'collect-evidence') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'collect-evidence') }
}
@Injectable() @Adapter('assistant_operation', operationRef('extract-drawing'))
export class MaterialExtractDrawingAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('extract-drawing')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'extract-drawing') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'extract-drawing') }
}
@Injectable() @Adapter('assistant_operation', operationRef('normalize-material'))
export class MaterialNormalizeMaterialAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('normalize-material')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'normalize-material') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'normalize-material') }
}
@Injectable() @Adapter('assistant_operation', operationRef('match-identity'))
export class MaterialMatchIdentityAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('match-identity')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'match-identity') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'match-identity') }
}
@Injectable() @Adapter('assistant_operation', operationRef('audit-conflicts'))
export class MaterialAuditConflictsAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('audit-conflicts')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'audit-conflicts') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'audit-conflicts') }
}
@Injectable() @Adapter('assistant_operation', operationRef('assess-impact'))
export class MaterialAssessImpactAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('assess-impact')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'assess-impact') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'assess-impact') }
}
@Injectable() @Adapter('assistant_operation', operationRef('propose-governance'))
export class MaterialProposeGovernanceAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('propose-governance')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'propose-governance') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'propose-governance') }
}
@Injectable() @Adapter('assistant_operation', operationRef('publish-records'))
export class MaterialPublishRecordsAdapter {
  readonly kind = 'assistant_operation'; readonly ref = operationRef('publish-records')
  constructor(private readonly service: MaterialPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'publish-records') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'publish-records') }
}
export const materialPipelineAdapters = [MaterialResultSchema, MaterialSubjectAdapter, MaterialEvidenceAdapter, MaterialConflictAdapter, MaterialApprovalAdapter, MaterialDecisionAdapter, MaterialContainmentAdapter, MaterialCollectEvidenceAdapter, MaterialExtractDrawingAdapter, MaterialNormalizeMaterialAdapter, MaterialMatchIdentityAdapter, MaterialAuditConflictsAdapter, MaterialAssessImpactAdapter, MaterialProposeGovernanceAdapter, MaterialPublishRecordsAdapter]
