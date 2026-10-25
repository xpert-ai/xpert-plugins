import { Injectable } from '@nestjs/common'
import { ProjectPipelineRuntimeAdapterProvider as Adapter, type ProjectPipelineContext, type ProjectPipelineOperationContext, type ProjectPipelineAssistantContext } from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef, ProjectPipelineSubjectVersion } from '@xpert-ai/contracts'
import { FactoryPipelineService } from './service.js'
import { refs } from './configuration.js'
import { resultSchema } from './entity.js'
@Injectable() @Adapter('schema', refs.result)
export class FactoryResultSchema { readonly kind = 'schema'; readonly ref = refs.result; parse = (value: unknown) => resultSchema.parse(value) }
@Injectable() @Adapter('subject', refs.subject)
export class FactorySubjectAdapter {
  readonly kind = 'subject'; readonly ref = refs.subject
  constructor(private readonly service: FactoryPipelineService) {}
  resolve(c: ProjectPipelineContext, id: string) { return this.service.subject(c, id) }
  checkCurrent(c: ProjectPipelineContext, v: ProjectPipelineSubjectVersion) { return this.service.current(c, v) }
  resolveEntry(c: ProjectPipelineContext, id: string) { return this.service.entry(c, id) }
}
@Injectable() @Adapter('evidence', refs.evidence)
export class FactoryEvidenceAdapter {
  readonly kind = 'evidence'; readonly ref = refs.evidence
  constructor(private readonly service: FactoryPipelineService) {}
  read(c: ProjectPipelineContext, ref: ProjectPipelineEvidenceRef) { return this.service.read(c, ref) }
}
@Injectable() @Adapter('policy', refs.approval)
export class FactoryApprovalAdapter {
  readonly kind = 'policy'; readonly ref = refs.approval
  constructor(private readonly service: FactoryPipelineService) {}
  async evaluate() { return { status: 'blocked' as const, code: 'human_decision_required' } }
  authorizeDecision(c: ProjectPipelineOperationContext, i: { candidateSelectionKey: string; outcome: string }) { return this.service.authorize(c, i.candidateSelectionKey, i.outcome) }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.triage-event@1')
export class FactoryTriageEventAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.triage-event@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'triage-event') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'triage-event') }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.diagnose-equipment@1')
export class FactoryDiagnoseEquipmentAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.diagnose-equipment@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'diagnose-equipment') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'diagnose-equipment') }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.assess-quality-impact@1')
export class FactoryAssessQualityImpactAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.assess-quality-impact@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'assess-quality-impact') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'assess-quality-impact') }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.assess-production-impact@1')
export class FactoryAssessProductionImpactAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.assess-production-impact@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'assess-production-impact') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'assess-production-impact') }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.check-resource-readiness@1')
export class FactoryCheckResourceReadinessAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.check-resource-readiness@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'check-resource-readiness') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'check-resource-readiness') }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.generate-recovery-plan@1')
export class FactoryGenerateRecoveryPlanAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.generate-recovery-plan@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'generate-recovery-plan') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'generate-recovery-plan') }
}
@Injectable() @Adapter('assistant_operation', 'factory_ops.verify-recovery@1')
export class FactoryVerifyRecoveryAdapter {
  readonly kind = 'assistant_operation'; readonly ref = 'factory_ops.verify-recovery@1'
  constructor(private readonly service: FactoryPipelineService) {}
  prepare(c: ProjectPipelineAssistantContext) { return this.service.prepare(c, 'verify-recovery') }
  collect(c: ProjectPipelineAssistantContext) { return this.service.collect(c, 'verify-recovery') }
}
@Injectable() @Adapter('operation', 'factory_ops.detect-anomaly@1')
export class FactoryDetectAnomalyAdapter {
  readonly kind = 'operation'; readonly ref = 'factory_ops.detect-anomaly@1'
  constructor(private readonly service: FactoryPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.service(c, 'detect-anomaly') }
  inspect(c: ProjectPipelineOperationContext) { return this.service.service(c, 'detect-anomaly') }
}
@Injectable() @Adapter('operation', 'factory_ops.record-approval@1')
export class FactoryRecordApprovalAdapter {
  readonly kind = 'operation'; readonly ref = 'factory_ops.record-approval@1'
  constructor(private readonly service: FactoryPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.service(c, 'record-approval') }
  inspect(c: ProjectPipelineOperationContext) { return this.service.service(c, 'record-approval') }
}
@Injectable() @Adapter('operation', 'factory_ops.record-rejection@1')
export class FactoryRecordRejectionAdapter {
  readonly kind = 'operation'; readonly ref = 'factory_ops.record-rejection@1'
  constructor(private readonly service: FactoryPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.service(c, 'record-rejection') }
  inspect(c: ProjectPipelineOperationContext) { return this.service.service(c, 'record-rejection') }
}
@Injectable() @Adapter('operation', 'factory_ops.execute-recovery-plan@1')
export class FactoryExecuteRecoveryPlanAdapter {
  readonly kind = 'operation'; readonly ref = 'factory_ops.execute-recovery-plan@1'
  constructor(private readonly service: FactoryPipelineService) {}
  execute(c: ProjectPipelineOperationContext) { return this.service.service(c, 'execute-recovery-plan') }
  inspect(c: ProjectPipelineOperationContext) { return this.service.service(c, 'execute-recovery-plan') }
}
@Injectable() @Adapter('policy', 'factory_ops.execution-outcome@1')
export class FactoryExecutionOutcomeAdapter {
  readonly kind = 'policy'; readonly ref = 'factory_ops.execution-outcome@1'
  constructor(private readonly service: FactoryPipelineService) {}
  evaluate(c: ProjectPipelineOperationContext) { return this.service.route(c) }
}
@Injectable() @Adapter('policy', 'factory_ops.recovery-outcome@1')
export class FactoryRecoveryOutcomeAdapter {
  readonly kind = 'policy'; readonly ref = 'factory_ops.recovery-outcome@1'
  constructor(private readonly service: FactoryPipelineService) {}
  evaluate(c: ProjectPipelineOperationContext) { return this.service.route(c) }
}
export const factoryPipelineAdapters = [FactoryResultSchema, FactorySubjectAdapter, FactoryEvidenceAdapter, FactoryApprovalAdapter, FactoryTriageEventAdapter, FactoryDiagnoseEquipmentAdapter, FactoryAssessQualityImpactAdapter, FactoryAssessProductionImpactAdapter, FactoryCheckResourceReadinessAdapter, FactoryGenerateRecoveryPlanAdapter, FactoryVerifyRecoveryAdapter, FactoryDetectAnomalyAdapter, FactoryRecordApprovalAdapter, FactoryRecordRejectionAdapter, FactoryExecuteRecoveryPlanAdapter, FactoryExecutionOutcomeAdapter, FactoryRecoveryOutcomeAdapter]
