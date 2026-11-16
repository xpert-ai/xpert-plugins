import { Injectable, Inject } from '@nestjs/common'
import {
  ProjectPipelineRuntimeAdapterProvider as Adapter,
  type ProjectPipelineContext,
  type ProjectPipelineOperationContext,
  type ProjectPipelineAssistantContext,
} from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef, ProjectPipelineSubjectVersion } from '@xpert-ai/contracts'
import { flow, type RouterKey, type StepKey } from './process.js'
import { nodeWorkbenches } from './node-workbench.js'
import { MotorRuntime, receiptSchema } from './runtime.js'
import { subject, schema, resolver, ref } from './configuration.js'
@Injectable()
@Adapter('subject', subject)
export class Subject {
  readonly kind = 'subject'
  readonly nodeWorkbenches = nodeWorkbenches
  readonly ref = subject
  constructor(readonly api: MotorRuntime) {}
  async resolve(c: ProjectPipelineContext, id: string) {
    return this.api.version(await this.api.root(c, id))
  }
  async checkCurrent(c: ProjectPipelineContext, v: ProjectPipelineSubjectVersion) {
    return this.api.matches(await this.api.root(c, v.objectKey), v)
  }
  async resolveEntry(c: ProjectPipelineContext, id: string, hostXpertId?: string, nodeTarget?: { executorXpertId?: string }) {
    return this.api.entry(await this.api.root(c, id), hostXpertId, nodeTarget)
  }
}
@Injectable()
@Adapter('schema', schema)
export class ReceiptSchema {
  readonly kind = 'schema'
  readonly ref = schema
  parse = receiptSchema.parse
}
@Injectable()
@Adapter('evidence', resolver)
export class Evidence {
  readonly kind = 'evidence'
  readonly ref = resolver
  constructor(readonly api: MotorRuntime) {}
  read(c: ProjectPipelineContext, v: ProjectPipelineEvidenceRef) {
    return this.api.read(c, v)
  }
}
function work(key: StepKey) {
  @Injectable()
  @Adapter('assistant_operation', ref(key))
  class MotorAssistantOperation {
    readonly kind = 'assistant_operation'
    readonly ref = ref(key)
    constructor(@Inject(MotorRuntime) readonly api: MotorRuntime) {}
    prepare(c: ProjectPipelineAssistantContext) {
      return this.api.prepare(c, key)
    }
    collect(c: ProjectPipelineAssistantContext) {
      return this.api.collect(c, key)
    }
  }
  return MotorAssistantOperation
}
function decision(key: StepKey) {
  @Injectable()
  @Adapter('policy', ref(key))
  class MotorDecision {
    readonly kind = 'policy'
    readonly ref = ref(key)
    constructor(@Inject(MotorRuntime) readonly api: MotorRuntime) {}
    async evaluate() {
      return { status: 'blocked' as const, code: 'human_decision_required' }
    }
    authorizeDecision(
      c: ProjectPipelineOperationContext,
      i: { candidateSelectionKey: string; outcome: string },
    ) {
      return this.api.authorize(c, key, i.candidateSelectionKey, i.outcome)
    }
  }
  @Injectable()
  @Adapter('operation', ref('record-' + key))
  class MotorDecisionReceipt {
    readonly kind = 'operation'
    readonly ref = ref('record-' + key)
    constructor(@Inject(MotorRuntime) readonly api: MotorRuntime) {}
    execute(c: ProjectPipelineOperationContext) {
      return this.api.record(c, key, true)
    }
    inspect(c: ProjectPipelineOperationContext) {
      return this.api.record(c, key, false)
    }
  }
  return [MotorDecision, MotorDecisionReceipt]
}
function routing(key: RouterKey) {
  @Injectable()
  @Adapter('policy', ref(key))
  class MotorRoutingPolicy {
    readonly kind = 'policy'
    readonly ref = ref(key)
    constructor(@Inject(MotorRuntime) readonly api: MotorRuntime) {}
    evaluate(c: ProjectPipelineOperationContext) {
      return this.api.route(c, key)
    }
  }
  return MotorRoutingPolicy
}
export const adapters = [
  routing('materialRoute'),
  routing('traceRoute'),
  Subject,
  ReceiptSchema,
  Evidence,
  ...flow.filter((s) => s.kind === 'assistant').map((s) => work(s.key)),
  ...flow.filter((s) => s.kind === 'human').flatMap((s) => decision(s.key)),
]
