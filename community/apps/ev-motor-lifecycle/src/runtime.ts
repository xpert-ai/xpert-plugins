import { Inject, Injectable, ConflictException, ForbiddenException } from '@nestjs/common'
import { digest as hash } from './digest.js'
import { z } from 'zod/v3'
import {
  ProjectPipelineCommandsRuntimeCapability,
  ProjectPipelineEvidenceRuntimeCapability,
  ProjectAccessRuntimeCapability,
  XPERT_RUNTIME_CAPABILITIES_TOKEN,
  type RuntimeCapabilityRegistry,
  type ProjectPipelineContext,
  type ProjectPipelineAssistantContext,
  type ProjectPipelineOperationContext,
  type XpertBusinessToolContext,
} from '@xpert-ai/plugin-sdk'
import type { ProjectPipelineEvidenceRef, ProjectPipelineSubjectVersion } from '@xpert-ai/contracts'
import { MotorStore, scope, tenant, type Scope } from './store.js'
import { MotorOrder, MotorWork } from './entity.js'
import {
  routers,
  type RouterKey,
  legacyVersion,
  processVersion,
  type StepKey,
  type Role,
  agentKey,
  provider,
  views,
} from './process.js'
import { routeOutcome, readySteps, evidence, advance, type Event } from './domain.js'
import { configuration, subject, resolver, schema, ref, outcomes, humanSchema } from './configuration.js'
export const receiptSchema = z.object({
  caseId: z.string().uuid(),
  node: z.string(),
  actor: z.string(),
  routeRecord: z
    .discriminatedUnion('kind', [
      z.object({
        kind: z.literal('inventory'),
        required: z.number().int().positive(),
        available: z.number().int().nonnegative(),
      }),
      z.object({
        kind: z.literal('assembly'),
        serial: z.string().min(1),
        lot: z.string().min(1),
      }),
      z.object({
        kind: z.literal('report'),
        serial: z.string().min(1).nullable(),
        report: z.string().min(1).nullable(),
      }),
    ])
    .optional(),
  facts: z.array(z.object({ label: z.string(), value: z.string() })),
})
function receipt(id: string, e: Event) {
  return {
    caseId: id,
    node: e.node,
    actor: e.actor,
    facts: e.facts,
    ...(e.routeRecord ? { routeRecord: e.routeRecord } : {}),
  }
}
function evidenceRef(id: string, e: Event) {
  const digest = hash(receipt(id, e))
  return {
    resolverRef: resolver,
    schemaRef: schema,
    objectKey: id + '/' + e.operation,
    producerOperationId: e.operation,
    version: digest,
    digest,
  }
}
@Injectable()
export class MotorRuntime {
  constructor(
    readonly store: MotorStore,
    @Inject(XPERT_RUNTIME_CAPABILITIES_TOKEN)
    readonly caps: RuntimeCapabilityRegistry,
  ) {}
  async root(c: ProjectPipelineContext, id: string) {
    const s = scope(c)
    const list = await this.caps
      .require(ProjectAccessRuntimeCapability)
      .listReadable({ actor: c.actor, projectIds: [c.projectId] })
    if (!list.some((p) => p.projectId === c.projectId))
      throw new ForbiddenException('project_access_required')
    return this.store.db
      .getRepository(MotorOrder)
      .findOneByOrFail({ ...tenant(s), id, projectId: c.projectId })
  }
  version(e: MotorOrder) {
    const version = hash({
      id: e.id,
      rule: e.data.rule,
      parent: e.data.parent ?? null,
      ...(e.data.variant ? { version: processVersion, variant: e.data.variant } : {}),
    })
    return { resolverRef: subject, objectKey: e.id, version, digest: version }
  }
  async pinned(c: ProjectPipelineOperationContext) {
    const v = c.subjects[0]
    if (!v || c.subjects.length !== 1) throw new ConflictException('subject_required')
    const e = await this.root(c, v.objectKey)
    if (!this.matches(e, v) || e.data.mode !== 'pipeline') throw new ConflictException('stale_subject')
    return e
  }
  matches(e: MotorOrder, v: ProjectPipelineSubjectVersion) {
    const x = this.version(e)
    return x.version === v.version && x.digest === v.digest && x.resolverRef === v.resolverRef
  }
  async start(s: Scope, id: string) {
    const e = await this.store.get(s, id)
    if (e.data.mode !== 'pipeline') throw new ConflictException('pipeline_mode_required')
    if (e.instanceId) return e.instanceId
    const roles = await this.store.provision(s, e),
      c = { actor: s, projectId: e.projectId }
    const api = this.caps.require(ProjectPipelineCommandsRuntimeCapability)
    const b = await api.configure(c, {
      requestId: e.id,
      configuration: configuration(roles, e.data.variant ? processVersion : legacyVersion),
    })
    const result = await api.start(c, {
      bindingId: b.bindingId,
      objectKey: e.id,
      triggerKey: e.id,
      title: e.data.code + ' · 驱动电机',
    })
    await this.store.db
      .getRepository(MotorOrder)
      .update({ ...tenant(s), id: e.id }, { instanceId: result.instanceId })
    return result.instanceId
  }
  async read(c: ProjectPipelineContext, v: ProjectPipelineEvidenceRef) {
    const [id, operation] = v.objectKey.split('/')
    const e = await this.root(c, z.string().uuid().parse(id))
    const record = e.data.events.find((x) => x.operation === operation)
    if (
      !record ||
      Object.entries(evidenceRef(e.id, record)).some(([key, value]) => Reflect.get(v, key) !== value)
    )
      throw new ConflictException('evidence_mismatch')
    return receipt(e.id, record)
  }
  async route(c: ProjectPipelineOperationContext, key: RouterKey) {
    const order = await this.pinned(c)
    const refs: ProjectPipelineEvidenceRef[] = []
    for (const source of routers[key].sources) {
      const input = c.inputs[source],
        event = order.data.events.find((e) => e.node === source)
      if (
        input?.kind !== 'evidence' ||
        !event ||
        !event.routeRecord ||
        Object.entries(evidenceRef(order.id, event)).some(([k, v]) => Reflect.get(input.value, k) !== v)
      )
        return { status: 'blocked' as const, code: 'missing_route_evidence' }
      refs.push(input.value)
    }
    const outcome = routeOutcome(order.data, key)
    return outcome
      ? { status: 'decided' as const, outcome, evidence: refs }
      : { status: 'blocked' as const, code: 'invalid_route_evidence' }
  }
  async prepare(c: ProjectPipelineAssistantContext, key: StepKey) {
    const e = await this.pinned(c),
      node = readySteps(e.data).find((s) => s.key === key)
    if (node?.key !== key || node.kind !== 'assistant' || e.assistants[node.role] !== c.executor.xpertId)
      throw new ConflictException('executor_mismatch')
    const repo = this.store.db.getRepository(MotorWork)
    const row = {
      id: c.work.operationId,
      caseId: e.id,
      ...tenant(scope(c)),
      node: key,
      assistantId: c.executor.xpertId,
      executionId: c.executor.executionId,
      conversationId: c.executor.conversationId,
      inputDigest: c.work.inputDigest,
      roundId: c.work.roundId,
      generation: c.work.generation,
    }
    await repo.createQueryBuilder().insert().values(row).orIgnore().execute()
    const saved = await repo.findOneByOrFail(row)
    return {
      prompt: `你负责「${node.title}」。核对下列样例证据，调用 ev_motor_${
        node.role
      }_submit 一次，传 operationId 和你的中文 assessment。不要审批，不要编造客户系统动作。\noperationId=${
        saved.id
      }\n${JSON.stringify(evidence(e.data, key))}`,
      context: { motorOperationId: saved.id },
    }
  }
  async submit(role: Role, id: string, assessment: string, c: XpertBusinessToolContext) {
    const { organizationId, projectId, executionId, xpertId, conversationId } = c
    if (
      !organizationId ||
      !projectId ||
      !executionId ||
      !xpertId ||
      !conversationId ||
      c.agentKey !== agentKey(role)
    )
      throw new ForbiddenException('role_execution_required')
    return this.store.db.transaction(async (m) => {
      const row = await m.getRepository(MotorWork).findOneOrFail({
        where: {
          id,
          tenantId: c.tenantId,
          organizationId,
          assistantId: xpertId,
          executionId,
          conversationId,
        },
        lock: { mode: 'pessimistic_write' },
      })
      const e = await m.getRepository(MotorOrder).findOneByOrFail({
        id: row.caseId,
        projectId,
        tenantId: c.tenantId,
        organizationId,
      })
      const active = readySteps(e.data).find((s) => s.key === row.node)
      if (active?.key !== row.node || active.kind !== 'assistant' || active.role !== role)
        throw new ConflictException('stale_role_operation')
      if (row.assessment && row.assessment !== assessment) throw new ConflictException('immutable_assessment')
      row.assessment = assessment
      await m.save(row)
      return { accepted: true }
    })
  }
  async collect(c: ProjectPipelineAssistantContext, key: StepKey) {
    const e = await this.pinned(c),
      w = await this.store.db.getRepository(MotorWork).findOneByOrFail({
        ...tenant(scope(c)),
        caseId: e.id,
        id: c.work.operationId,
        node: key,
        executionId: c.executor.executionId,
        assistantId: c.executor.xpertId,
        roundId: c.work.roundId,
        inputDigest: c.work.inputDigest,
        generation: c.work.generation,
      })
    if (!w.assessment) throw new ConflictException('assistant_submission_required')
    const snapshot = await this.store.db.transaction(async (m) => {
      const r = m.getRepository(MotorOrder),
        order = await r.findOneOrFail({
          where: { ...tenant(scope(c)), id: e.id },
          lock: { mode: 'pessimistic_write' },
        })
      const next = advance(
        order.data,
        { node: key, operation: w.id },
        {
          id: w.assistantId,
          kind: 'published_assistant',
          assistantId: w.assistantId,
          conversationId: w.conversationId,
          executionId: w.executionId,
        },
        new Date().toISOString(),
      )
      if (next !== order.data) {
        next.events.at(-1)!.facts.push({ label: '智能体研判', value: w.assessment! })
        order.data = next
        await r.save(order)
      }
      return order.data.events.find((x) => x.operation === w.id)!
    })
    return { result: evidenceRef(e.id, snapshot) }
  }
  async authorize(c: ProjectPipelineOperationContext, key: StepKey, selector: string, outcome: string) {
    const e = await this.pinned(c),
      node = readySteps(e.data).find((s) => s.key === key)
    if (
      e.ownerId !== c.actor.userId ||
      node?.key !== key ||
      node.kind !== 'human' ||
      selector !== 'review-' + node.reviewer ||
      !outcomes(key).includes(outcome)
    )
      return false
    if (key === 'publish' && outcome !== 'reject' && e.data.rule === 'R1' && !e.evolutionReceipt) return false
    const access = await this.caps.require(ProjectAccessRuntimeCapability).assertManage(c)
    return access.role === 'owner' || access.role === 'manager'
  }
  async record(c: ProjectPipelineOperationContext, key: StepKey, execute: boolean) {
    const e = await this.pinned(c),
      prior = e.data.events.find((x) => x.operation === c.work.operationId)
    const done = (x: Event) => ({
      status: 'succeeded' as const,
      receiptKey: c.work.operationId,
      outputs: { result: evidenceRef(e.id, x) },
    })
    if (prior) return done(prior)
    if (!execute) return { status: 'unknown' as const, receiptKey: c.work.operationId }
    const d = c.inputs.decision
    if (
      d?.kind !== 'evidence' ||
      d.value.schemaRef !== humanSchema ||
      d.value.resolverRef !== 'platform.pipeline-decision@1'
    )
      throw new ConflictException('human_evidence_required')
    const input = z
      .object({
        kind: z.literal('human'),
        actorId: z.literal(e.ownerId),
        policyRef: z.literal(ref(key)),
        outcome: z.string(),
        roundId: z.literal(c.work.roundId),
        generation: z.literal(c.work.generation),
        inputDigest: z.literal(c.work.inputDigest),
      })
      .parse(await this.caps.require(ProjectPipelineEvidenceRuntimeCapability).read(c, d.value))
    if (key === 'publish' && input.outcome !== 'reject' && e.data.rule === 'R1' && !e.evolutionReceipt)
      throw new ConflictException('rule_receipt_required')
    if (!outcomes(key).includes(input.outcome)) throw new ConflictException('invalid_outcome')
    const plan = z.enum(['expedite', 'split', 'original']).safeParse(input.outcome)
    const result = await this.store.apply(
      { ...scope(c), userId: input.actorId },
      e.id,
      {
        node: key,
        operation: c.work.operationId,
        decision: input.outcome === 'reject' ? 'reject' : 'approve',
        reason: '项目人工审批 · ' + d.value.objectKey,
        ...(plan.success ? { plan: plan.data } : {}),
      },
      { kind: 'human', id: input.actorId },
    )
    return done(result.data.events.find((x) => x.operation === c.work.operationId)!)
  }
  entry(e: MotorOrder, hostXpertId = e.coordinatorId, nodeTarget?: { executorXpertId?: string }) {
    const xpertId = nodeTarget ? nodeTarget.executorXpertId ?? e.coordinatorId : hostXpertId
    const assigned = new Set([e.coordinatorId, ...Object.values(e.assistants)])
    if (!assigned.has(hostXpertId) || !assigned.has(xpertId))
      throw new ForbiddenException('assistant_not_in_order')
    return {
      xpertId,
      viewKey: provider + '__' + views.workspace,
      selectionId: e.id,
    }
  }
}
