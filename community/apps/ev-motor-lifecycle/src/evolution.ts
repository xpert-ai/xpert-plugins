import { Injectable, ConflictException, ForbiddenException } from '@nestjs/common'
import { EvolutionTargetProviderStrategy, EvolutionChangeRuntimeCapability } from '@xpert-ai/plugin-sdk'
import {
  evidenceDrivenStrategy,
  type EvolutionTargetDescriptor,
  type EvolutionChangeProvider,
  type EvolutionChangeOperation,
  type EvolutionTargetProvider,
  type EvolutionChangeEvaluation,
} from '@xpert-ai/contracts'
import { MotorRuntime } from './runtime.js'
import { MotorOrder } from './entity.js'
import { owned, tenant, stableId, type Scope } from './store.js'
import { replay, ruleText, score } from './sample.js'
import { digest } from './digest.js'
import { t, views, provider } from './process.js'
const targetId = 'ev_motor.contract_requirement'
const strategy = evidenceDrivenStrategy({
  version: 'motor/1',
  evidenceKinds: ['artifact'],
  requiredChecks: [{ kind: 'regression', origin: 'motor_samples', blocking: true }],
})
const baseline = (e: MotorOrder) => ({
  resourceId: e.id,
  version: e.data.rule,
  hash: digest({ rule: e.data.rule, grammar: e.data.rule === 'R1' ? 'first_ip' : ruleText }),
})
const candidateHash = digest({ rule: 'R2', grammar: ruleText, dataset: replay() })
function material(e: MotorOrder) {
  const event = e.data.events.find((x) => x.node === 'replay')
  if (!event) throw new ConflictException('expert_replay_required')
  return {
    kind: 'artifact' as const,
    subjectKey: e.id,
    uri: 'motor-order:' + e.id + '/replay',
    version: event.operation,
    hash: digest(event.facts.map((x) => [x.label, x.value])),
  }
}
@Injectable()
@EvolutionTargetProviderStrategy(targetId)
export class MotorEvolution implements EvolutionTargetProvider, EvolutionChangeProvider {
  readonly descriptor: EvolutionTargetDescriptor = {
    targetId,
    targetType: 'motor.contract_rule',
    displayName: '驱动电机合同提取规则',
    providerKey: targetId,
    providerVersion: '1.0.0',
    artifactSchemaVersion: '1',
    supportedScopes: ['organization'],
    riskLevel: 'R2',
    metricSetId: 'motor.requirement_accuracy',
    status: 'active',
    strategies: [strategy],
    capabilities: {
      candidateBuild: true,
      replay: false,
      shadow: false,
      canary: false,
      install: false,
      rollback: false,
    },
  }
  readonly draftBuilder = this
  readonly checkEvaluator = this
  readonly versionPublisher = this
  readonly presenter = this
  constructor(private readonly runtime: MotorRuntime) {}
  private async order(op: EvolutionChangeOperation) {
    const { context, change } = op
    if (
      !context.organizationId ||
      context.targetId !== targetId ||
      change.targetId !== targetId ||
      change.scope.key !== context.organizationId ||
      change.scope.type !== 'organization'
    )
      throw new ForbiddenException('evolution_scope_mismatch')
    const e = await this.runtime.store.db
      .getRepository(MotorOrder)
      .findOneByOrFail({
        tenantId: context.tenantId,
        organizationId: context.organizationId,
        id: change.requestId,
      })
    if (
      e.ownerId !== change.createdBy ||
      change.scope.dimensions?.order !== e.id ||
      change.baseline.hash !== baseline(e).hash ||
      change.evidence.length !== 1 ||
      digest(change.evidence[0]!) !== digest(material(e))
    )
      throw new ConflictException('evolution_evidence_mismatch')
    return e
  }
  async prepare(op: EvolutionChangeOperation) {
    const e = await this.order(op)
    return {
      artifact: {
        uri: 'motor-rule:' + e.id + '/R2',
        hash: candidateHash,
        schemaVersion: '1',
        mediaType: 'application/json' as const,
      },
      baseline: baseline(e),
      changes: [
        {
          path: 'contract.assemblyProtection',
          operation: 'replace',
          summary: '按明确的总成范围提取',
          before: '首个防护等级',
          after: ruleText,
        },
      ],
      warnings: [],
      summary: ruleText,
    }
  }
  async evaluate(op: EvolutionChangeOperation): Promise<EvolutionChangeEvaluation> {
    const e = await this.order(op),
      rows = replay(),
      checks = rows.map((x, i) => ({
        checkId: 'clause-' + i,
        title: x.input,
        origin: 'motor_samples',
        kind: 'regression',
        passed: x.after === x.expected,
        blocking: true,
        details: (x.after ?? '转人工') + ' / ' + (x.expected ?? '转人工'),
        evidenceRefs: [material(e).uri],
      }))
    return {
      runId: 'MOTOR-EVAL-' + e.id,
      candidateHash,
      baselineHash: baseline(e).hash,
      evidenceHash: op.change.evidenceHash,
      datasetVersion: 'motor-clauses/v1',
      datasetHash: digest(rows),
      checks,
      readiness: [
        { key: 'assembly_scope', label: t('Assembly scope', '总成适用范围'), status: 'passed', reasons: [] },
      ],
      passed: score(rows, 'after') === rows.length,
      completedAt: e.data.events.find((x) => x.node === 'replay')!.at,
    }
  }
  async validateCurrent(op: EvolutionChangeOperation) {
    const e = await this.order(op)
    const valid =
      op.change.candidate?.artifact.hash === candidateHash && e.data.events.at(-1)?.decision !== 'reject'
    return { valid, reasons: valid ? [] : ['candidate_or_order_changed'] }
  }
  async authorizePublication(op: EvolutionChangeOperation) {
    const e = await this.order(op)
    if (op.context.actor.actorType !== 'human' || op.context.actor.actorId !== e.ownerId)
      throw new ForbiddenException('order_reviewer_required')
  }
  async publish(op: EvolutionChangeOperation) {
    await this.authorizePublication(op)
    const { change } = op,
      e = await this.order(op),
      a = change.approval
    if (
      !a ||
      a.decision !== 'approved' ||
      a.candidateHash !== candidateHash ||
      change.candidate?.artifact.hash !== candidateHash ||
      !change.evaluation?.passed ||
      change.evaluation.runId !== a.evaluationRunId ||
      change.evaluation.datasetHash !== digest(replay())
    )
      throw new ConflictException('tested_approval_required')
    const receipt = {
      receiptId: stableId('rule-publication', change.changeId),
      changeId: change.changeId,
      candidateHash,
      approvalId: a.approvalId,
      resource: { resourceId: e.id, version: 'R2', hash: candidateHash },
      completedAt: a.decidedAt,
    }
    await this.runtime.store.db
      .getRepository(MotorOrder)
      .update(
        { id: e.id, tenantId: e.tenantId, organizationId: e.organizationId },
        { evolutionReceipt: receipt },
      )
    return receipt
  }
  async describe(op: EvolutionChangeOperation) {
    const e = await this.order(op)
    return {
      title: '总成与组件防护等级 · ' + e.data.code,
      resourceLabel: '驱动电机合同规则',
      metrics: [
        {
          key: 'sample_accuracy',
          label: t('Clause replay', '样例回放'),
          value: score(replay(), 'after'),
          total: replay().length,
        },
      ],
      workbench: {
        xpertId: e.coordinatorId,
        viewKey: provider + '__' + views.workspace,
        selectionId: e.id,
        parameters: {},
      },
    }
  }
  private api() {
    return this.runtime.caps.require(EvolutionChangeRuntimeCapability)
  }
  async propose(s: Scope, id: string) {
    const e = await this.runtime.store.get(s, id),
      identity = tenant(s),
      api = this.api()
    const change = e.changeId
      ? await api.get({ ...identity, changeId: e.changeId })
      : await api.prepare({
          ...identity,
          targetId,
          strategyId: strategy.id,
          sourceKind: 'business_evidence',
          requestId: e.id,
          scope: { type: 'organization', key: s.organizationId, dimensions: { order: e.id } },
          baseline: baseline(e),
          evidence: [material(e)],
        })
    await this.runtime.store.db
      .getRepository(MotorOrder)
      .update({ ...owned(s), id }, { changeId: change.changeId })
    return change
  }
  async decide(s: Scope, id: string, approve: boolean, reason: string) {
    const change = await this.propose(s, id),
      api = this.api(),
      identity = { ...tenant(s), changeId: change.changeId }
    if (change.status === 'published' && approve) return change.receipt
    if (change.status === 'rejected' && !approve) return
    if (!change.candidate || !change.evaluation)
      throw new ConflictException(
        'Agent Evolution 尚未完成回放。请打开评估记录查看状态，评估完成后再次确认。',
      )
    if (change.status !== 'approved')
      await api.decide({
        ...identity,
        candidateHash: change.candidate.artifact.hash,
        evaluationRunId: change.evaluation.runId,
        decision: approve ? 'approved' : 'rejected',
        reason,
      })
    if (approve) {
      const published = await api.publish(identity)
      if (!published.receipt) throw new ConflictException('evolution_publication_pending')
      return published.receipt
    }
  }
}
