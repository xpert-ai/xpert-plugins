import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { createHash, randomUUID } from 'node:crypto'
import { InjectRepository } from '@nestjs/typeorm'
import { DataSource, Repository } from 'typeorm'
import { ValveDataXpertClient } from './data-xpert-client.service'
import { ValveActionEvent, ValveActionProposal } from './entities'
import type {
  ValveActionProposalDto,
  ValveActionDescriptor,
  ValveActionPreflight,
  ValveActorScope,
  ValveCreateProposalInput,
  ValveDecisionAuditEventDto,
  ValveDemoExecutionReceipt,
  ValveJsonObject,
  ValveObject360,
  ValveProposalStatus
} from './types'
import { buildValveActionDescriptors, normalizeActionInput } from './valve-demo-actions'

const TRANSITIONS: Record<ValveProposalStatus, ValveProposalStatus[]> = {
  pending_review: ['approved', 'rejected'],
  approved: ['completed', 'failed'],
  rejected: [],
  completed: [],
  failed: []
}

@Injectable()
export class ValveBusinessService {
  constructor(
    private readonly client: ValveDataXpertClient,
    private readonly dataSource: DataSource,
    @InjectRepository(ValveActionProposal)
    private readonly proposals: Repository<ValveActionProposal>,
    @InjectRepository(ValveActionEvent)
    private readonly events: Repository<ValveActionEvent>
  ) {}

  listResources(scope: ValveActorScope) {
    return this.client.listResources(scope)
  }

  getOntologyInitializationStatus(scope: ValveActorScope) {
    return this.client.getOntologyInitializationStatus(scope)
  }

  initializeOntology(scope: ValveActorScope, input: { confirmOverwrite: boolean }) {
    return this.client.initializeOntology(scope, input)
  }

  defaultResourceId() {
    return this.client.getConfig().dataXpert.resourceIds?.[0]
  }

  getSchema(scope: ValveActorScope, resourceId: string) {
    return this.client.getSchema(scope, resourceId)
  }

  searchObjects(
    scope: ValveActorScope,
    input: { resourceId: string; entityTypeCode?: string; query?: string; partitionKey?: string; limit?: number }
  ) {
    return this.client.searchObjects(scope, input)
  }

  getObject360(
    scope: ValveActorScope,
    input: {
      resourceId: string
      partitionKey?: string
      target: { entityId?: string; entityTypeCode?: string; entityRef?: string }
    }
  ) {
    return this.client.getObject360(scope, input)
  }

  async getAvailableActions(
    scope: ValveActorScope,
    input: {
      resourceId: string
      partitionKey?: string
      target: { entityId?: string; entityTypeCode?: string; entityRef?: string }
    }
  ) {
    const object = await this.client.getObject360(scope, input)
    return {
      resourceId: object.resourceId,
      snapshotId: object.snapshotId,
      graphVersion: object.graphVersion,
      entityId: object.entity.entityId,
      items: this.actionDescriptors(object)
    }
  }

  async preflightAction(
    scope: ValveActorScope,
    input: {
      resourceId: string
      partitionKey?: string
      target: { entityId?: string; entityTypeCode?: string; entityRef?: string }
      actionTypeCode: string
      actionInput?: ValveJsonObject
      expectedGraphVersion?: string
    }
  ): Promise<ValveActionPreflight> {
    const object = await this.client.getObject360(scope, input)
    return this.preflightForObject(scope, object, input.actionTypeCode, input.actionInput, input.expectedGraphVersion)
  }

  async listActionProposals(
    scope: ValveActorScope,
    input: { resourceId?: string; entityId?: string; status?: ValveProposalStatus; limit?: number }
  ): Promise<ValveActionProposalDto[]> {
    requirePersistenceScope(scope)
    const where = {
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      ...(input.resourceId ? { resourceId: input.resourceId } : {}),
      ...(input.entityId ? { entityId: input.entityId } : {}),
      ...(input.status ? { status: input.status } : {})
    }
    const items = await this.proposals.find({
      where,
      order: { createdAt: 'DESC' },
      take: Math.min(input.limit ?? 30, 100)
    })
    return items.map(toProposalDto)
  }

  async createActionProposal(scope: ValveActorScope, input: ValveCreateProposalInput): Promise<ValveActionProposalDto> {
    requirePersistenceScope(scope)
    const requestHash = hashRequest(input)
    const existing = await this.proposals.findOne({
      where: { tenantId: scope.tenantId, organizationId: scope.organizationId, operationId: input.operationId }
    })
    if (existing) {
      this.assertIdempotent(existing, requestHash)
      return toProposalDto(existing)
    }

    const object = await this.client.getObject360(scope, {
      resourceId: input.resourceId,
      partitionKey: input.partitionKey,
      target: input.target
    })
    let preflight: ValveActionPreflight | undefined
    if (input.kind === 'ontology_action') {
      if (!input.actionTypeCode) throw new BadRequestException('ACTION_TYPE_REQUIRED')
      preflight = await this.preflightForObject(
        scope,
        object,
        input.actionTypeCode,
        input.actionInput,
        input.expectedGraphVersion
      )
      if (!preflight.allowed) throw new BadRequestException(`ACTION_PREFLIGHT_FAILED:${preflight.blockingReasons.join(',')}`)
    } else if (input.actionTypeCode) {
      throw new BadRequestException('ENGINEERING_REVIEW_MUST_NOT_REFERENCE_ACTION')
    }

    const proposalEvidence: ValveJsonObject = {
      ...(input.evidence ?? object.evidence),
      actionInput: preflight?.normalizedInput ?? input.actionInput ?? {},
      ...(preflight
        ? {
            preflight: {
              checkedAt: preflight.checkedAt,
              graphVersion: preflight.graphVersion,
              warnings: preflight.warnings,
              predictedEffects: preflight.predictedEffects,
              actionSource: preflight.action.source,
              executionMode: preflight.action.executionMode,
              targetSystem: preflight.action.targetSystem
            }
          }
        : {})
    }

    try {
      const saved = await this.dataSource.transaction(async (manager) => {
        const proposalRepository = manager.getRepository(ValveActionProposal)
        const eventRepository = manager.getRepository(ValveActionEvent)
        const repeated = await proposalRepository.findOne({
          where: { tenantId: scope.tenantId, organizationId: scope.organizationId, operationId: input.operationId }
        })
        if (repeated) {
          this.assertIdempotent(repeated, requestHash)
          return repeated
        }
        const proposal = proposalRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          operationId: input.operationId,
          requestHash,
          resourceId: object.resourceId,
          snapshotId: object.snapshotId,
          graphVersion: object.graphVersion,
          partitionKey: object.partitionKey ?? null,
          entityId: object.entity.entityId,
          entityTypeCode: object.entity.entityTypeCode,
          externalKey: object.entity.externalKey,
          entityLabel: object.entity.label,
          kind: input.kind,
          actionTypeCode: input.actionTypeCode ?? null,
          title: input.title,
          summary: input.summary,
          expectedEffects: input.expectedEffects ?? preflight?.predictedEffects ?? [],
          evidence: proposalEvidence,
          status: 'pending_review',
          reviewComment: null,
          outcome: null,
          createdBy: scope.userId ?? null,
          reviewedBy: null,
          completedBy: null
        })
        const created = await proposalRepository.save(proposal)
        await eventRepository.save(
          eventRepository.create({
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            proposalId: created.id,
            eventType: 'proposal_created',
            fromStatus: null,
            toStatus: 'pending_review',
            actorId: scope.userId ?? null,
            comment: null,
            payload: { operationId: input.operationId, kind: input.kind }
          })
        )
        return created
      })
      return toProposalDto(saved)
    } catch (error) {
      const raced = await this.proposals.findOne({
        where: { tenantId: scope.tenantId, organizationId: scope.organizationId, operationId: input.operationId }
      })
      if (raced) {
        this.assertIdempotent(raced, requestHash)
        return toProposalDto(raced)
      }
      throw error
    }
  }

  async createDemoActionProposal(
    scope: ValveActorScope,
    input: {
      resourceId: string
      partitionKey?: string
      target: { entityId?: string; entityTypeCode?: string; entityRef?: string }
      actionTypeCode: string
      actionInput?: ValveJsonObject
    }
  ) {
    const preflight = await this.preflightAction(scope, input)
    if (!preflight.allowed) throw new BadRequestException(`ACTION_PREFLIGHT_FAILED:${preflight.blockingReasons.join(',')}`)
    return this.createActionProposal(scope, {
      operationId: `demo:${randomUUID()}`,
      resourceId: input.resourceId,
      partitionKey: input.partitionKey,
      target: input.target,
      kind: 'ontology_action',
      actionTypeCode: input.actionTypeCode,
      title: `Demo · ${preflight.action.name}`,
      summary: preflight.action.scenario,
      expectedEffects: preflight.predictedEffects,
      actionInput: preflight.normalizedInput,
      expectedGraphVersion: preflight.graphVersion,
      evidence: {
        demoMode: true,
        actionSource: preflight.action.source,
        targetSystem: preflight.action.targetSystem
      }
    })
  }

  async executeDemoAction(
    scope: ValveActorScope,
    proposalId: string,
    input: { comment?: string; demoOutcome?: 'success' | 'failure' }
  ): Promise<{ proposal: ValveActionProposalDto; receipt: ValveDemoExecutionReceipt }> {
    requirePersistenceScope(scope)
    if (!this.client.getConfig().demo.enabled) throw new BadRequestException('DEMO_EXECUTION_DISABLED')
    const current = await this.proposals.findOne({
      where: { id: proposalId, tenantId: scope.tenantId, organizationId: scope.organizationId }
    })
    if (!current) throw new NotFoundException('PROPOSAL_NOT_FOUND')
    if (current.status === 'completed' || current.status === 'failed') {
      return { proposal: toProposalDto(current), receipt: await this.replayedReceipt(current) }
    }
    if (current.status !== 'approved') throw new ConflictException(`PROPOSAL_NOT_APPROVED:${current.status}`)

    const object = await this.client.getObject360(scope, {
      resourceId: current.resourceId,
      partitionKey: current.partitionKey ?? undefined,
      target: { entityId: current.entityId, entityTypeCode: current.entityTypeCode, entityRef: current.externalKey }
    })
    if (object.graphVersion !== current.graphVersion) throw new ConflictException('STALE_GRAPH_VERSION_REQUIRES_NEW_PROPOSAL')
    const action = current.actionTypeCode
      ? this.actionDescriptors(object).find((item) => item.code === current.actionTypeCode)
      : engineeringReviewDescriptor()
    if (!action || !action.available) throw new BadRequestException('ACTION_EXECUTION_ADAPTER_NOT_AVAILABLE')

    const failed = input.demoOutcome === 'failure'
    const receipt = buildDemoReceipt(current, action, failed)
    const saved = await this.dataSource.transaction(async (manager) => {
      const proposalRepository = manager.getRepository(ValveActionProposal)
      const eventRepository = manager.getRepository(ValveActionEvent)
      const proposal = await proposalRepository
        .createQueryBuilder('proposal')
        .setLock('pessimistic_write')
        .where('proposal.id = :proposalId', { proposalId })
        .andWhere('proposal.tenantId = :tenantId', { tenantId: scope.tenantId })
        .andWhere('proposal.organizationId = :organizationId', { organizationId: scope.organizationId })
        .getOne()
      if (!proposal) throw new NotFoundException('PROPOSAL_NOT_FOUND')
      if (proposal.status === 'completed' || proposal.status === 'failed') return proposal
      if (proposal.status !== 'approved') throw new ConflictException(`PROPOSAL_NOT_APPROVED:${proposal.status}`)

      await eventRepository.save([
        eventRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          proposalId,
          eventType: 'execution_queued',
          fromStatus: 'approved',
          toStatus: 'approved',
          actorId: scope.userId ?? null,
          comment: input.comment ?? null,
          payload: executionPayload(receipt, { phase: 'queued' })
        }),
        eventRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          proposalId,
          eventType: 'execution_started',
          fromStatus: 'approved',
          toStatus: 'approved',
          actorId: scope.userId ?? null,
          comment: `Demo adapter: ${action.targetSystem}`,
          payload: executionPayload(receipt, { phase: 'executing' })
        })
      ])

      proposal.status = failed ? 'failed' : 'completed'
      proposal.completedBy = scope.userId ?? null
      proposal.outcome = receipt.message
      const result = await proposalRepository.save(proposal)
      await eventRepository.save(
        eventRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          proposalId,
          eventType: failed ? 'execution_failed' : 'execution_completed',
          fromStatus: 'approved',
          toStatus: proposal.status,
          actorId: scope.userId ?? null,
          comment: receipt.message,
          payload: executionPayload(receipt, { phase: proposal.status })
        })
      )
      return result
    })
    return { proposal: toProposalDto(saved), receipt }
  }

  async transitionProposal(
    scope: ValveActorScope,
    proposalId: string,
    toStatus: Exclude<ValveProposalStatus, 'pending_review'>,
    input: { comment?: string; outcome?: string }
  ): Promise<ValveActionProposalDto> {
    requirePersistenceScope(scope)
    const result = await this.dataSource.transaction(async (manager) => {
      const proposalRepository = manager.getRepository(ValveActionProposal)
      const eventRepository = manager.getRepository(ValveActionEvent)
      const proposal = await proposalRepository
        .createQueryBuilder('proposal')
        .setLock('pessimistic_write')
        .where('proposal.id = :proposalId', { proposalId })
        .andWhere('proposal.tenantId = :tenantId', { tenantId: scope.tenantId })
        .andWhere('proposal.organizationId = :organizationId', { organizationId: scope.organizationId })
        .getOne()
      if (!proposal) throw new NotFoundException('PROPOSAL_NOT_FOUND')
      if (!TRANSITIONS[proposal.status].includes(toStatus)) {
        throw new ConflictException(`INVALID_STATUS_TRANSITION:${proposal.status}:${toStatus}`)
      }
      const fromStatus = proposal.status
      proposal.status = toStatus
      if (toStatus === 'approved' || toStatus === 'rejected') {
        proposal.reviewedBy = scope.userId ?? null
        proposal.reviewComment = input.comment ?? null
      }
      if (toStatus === 'completed' || toStatus === 'failed') {
        proposal.completedBy = scope.userId ?? null
        proposal.outcome = input.outcome ?? input.comment ?? null
      }
      const saved = await proposalRepository.save(proposal)
      await eventRepository.save(
        eventRepository.create({
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          proposalId: proposal.id,
          eventType: `proposal_${toStatus}`,
          fromStatus,
          toStatus,
          actorId: scope.userId ?? null,
          comment: input.comment ?? input.outcome ?? null,
          payload: null
        })
      )
      return saved
    })
    return toProposalDto(result)
  }

  async getAuditTrace(
    scope: ValveActorScope,
    input: { proposalId?: string; taskId?: string }
  ): Promise<ValveDecisionAuditEventDto[]> {
    requirePersistenceScope(scope)
    if (!input.proposalId && !input.taskId) throw new BadRequestException('AUDIT_TARGET_REQUIRED')
    const local = input.proposalId
      ? await this.events.find({
          where: {
            tenantId: scope.tenantId,
            organizationId: scope.organizationId,
            proposalId: input.proposalId
          },
          order: { createdAt: 'ASC' },
          take: 100
        })
      : []
    const remote = input.taskId ? await this.client.getAuditTrace(scope, input.taskId) : []
    return [
      ...local.map((event) => ({
        id: event.id,
        proposalId: event.proposalId,
        eventType: event.eventType,
        fromStatus: event.fromStatus,
        toStatus: event.toStatus,
        actorId: event.actorId,
        comment: event.comment,
        payload: event.payload,
        createdAt: event.createdAt.toISOString(),
        source: 'workbench' as const
      })),
      ...remote.map((event) => ({
        id: event.id,
        proposalId: null,
        eventType: `${event.toolName}:${event.status}`,
        fromStatus: null,
        toStatus: null,
        actorId: null,
        comment: event.decisionSummary,
        payload: event.evidenceRef,
        createdAt: event.executedAt,
        source: 'data-xpert' as const
      }))
    ].sort((left, right) => left.createdAt.localeCompare(right.createdAt))
  }

  private assertIdempotent(proposal: ValveActionProposal, requestHash: string): void {
    if (proposal.requestHash !== requestHash) {
      throw new ConflictException('OPERATION_ID_REUSED_WITH_DIFFERENT_INPUT')
    }
  }

  private actionDescriptors(object: ValveObject360) {
    const config = this.client.getConfig()
    return buildValveActionDescriptors(object, {
      demoEnabled: config.demo.enabled,
      includeFallbackActions: config.demo.includeFallbackActions
    })
  }

  private async preflightForObject(
    scope: ValveActorScope,
    object: ValveObject360,
    actionTypeCode: string,
    actionInput?: ValveJsonObject,
    expectedGraphVersion?: string
  ): Promise<ValveActionPreflight> {
    const action = this.actionDescriptors(object).find((item) => item.code === actionTypeCode)
    if (!action) throw new BadRequestException('ACTION_NOT_AVAILABLE_FOR_OBJECT')
    const normalized = normalizeActionInput(action, actionInput)
    const blockingReasons = [...action.blockingReasons, ...normalized.blockingReasons]
    if (expectedGraphVersion && expectedGraphVersion !== object.graphVersion) blockingReasons.push('STALE_GRAPH_VERSION')
    if (action.code === 'create_maintenance_work_order') {
      requirePersistenceScope(scope)
      const duplicate = await this.proposals
        .createQueryBuilder('proposal')
        .where('proposal.tenantId = :tenantId', { tenantId: scope.tenantId })
        .andWhere('proposal.organizationId = :organizationId', { organizationId: scope.organizationId })
        .andWhere('proposal.resourceId = :resourceId', { resourceId: object.resourceId })
        .andWhere('proposal.entityId = :entityId', { entityId: object.entity.entityId })
        .andWhere('proposal.actionTypeCode = :actionTypeCode', { actionTypeCode })
        .andWhere('proposal.status IN (:...statuses)', { statuses: ['pending_review', 'approved'] })
        .getCount()
      if (duplicate) blockingReasons.push('DUPLICATE_OPEN_WORK_ORDER_PROPOSAL')
    }
    const warnings = [
      ...(action.source === 'demo' ? ['ACTION_NOT_YET_DEFINED_IN_ONTOLOGY_USING_DEMO_FALLBACK'] : []),
      ...(action.executionMode === 'simulation_only' ? ['SIMULATION_ONLY_NO_CONTROL_COMMAND_WILL_BE_SENT'] : []),
      ...object.constraints.map((constraint) => `OBJECT_CONSTRAINT:${constraint.code}:${constraint.severity}`)
    ]
    return {
      resourceId: object.resourceId,
      snapshotId: object.snapshotId,
      graphVersion: object.graphVersion,
      entityId: object.entity.entityId,
      externalKey: object.entity.externalKey,
      action,
      allowed: blockingReasons.length === 0,
      blockingReasons: [...new Set(blockingReasons)],
      warnings,
      normalizedInput: normalized.normalized,
      predictedEffects: action.expectedEffects,
      checkedAt: new Date().toISOString()
    }
  }

  private async replayedReceipt(proposal: ValveActionProposal): Promise<ValveDemoExecutionReceipt> {
    const event = await this.events.findOne({
      where: {
        tenantId: proposal.tenantId,
        organizationId: proposal.organizationId,
        proposalId: proposal.id,
        eventType: proposal.status === 'completed' ? 'execution_completed' : 'execution_failed'
      },
      order: { createdAt: 'DESC' }
    })
    const payload = event?.payload ?? {}
    return {
      executionId: stringValue(payload['executionId']) ?? `replay:${proposal.id}`,
      proposalId: proposal.id,
      actionTypeCode: proposal.actionTypeCode ?? 'engineering_review',
      status: proposal.status === 'failed' ? 'failed' : 'completed',
      executionMode: executionModeValue(payload['executionMode']),
      targetSystem: stringValue(payload['targetSystem']) ?? 'Demo adapter',
      externalReference: stringValue(payload['externalReference']),
      message: proposal.outcome ?? 'Demo execution already recorded.',
      effects: stringArray(payload['effects']),
      simulationOnly: payload['simulationOnly'] === true,
      replayed: true,
      completedAt: stringValue(payload['completedAt']) ?? proposal.updatedAt.toISOString()
    }
  }
}

function requirePersistenceScope(
  scope: ValveActorScope
): asserts scope is ValveActorScope & { tenantId: string; organizationId: string } {
  if (!scope.tenantId || !scope.organizationId) throw new BadRequestException('TENANT_OR_ORGANIZATION_REQUIRED')
}

function hashRequest(input: ValveCreateProposalInput) {
  return createHash('sha256').update(stableStringify(input)).digest('hex')
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, nested]) => `${JSON.stringify(key)}:${stableStringify(nested)}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function toProposalDto(proposal: ValveActionProposal): ValveActionProposalDto {
  return {
    id: proposal.id,
    operationId: proposal.operationId,
    resourceId: proposal.resourceId,
    snapshotId: proposal.snapshotId,
    graphVersion: proposal.graphVersion,
    partitionKey: proposal.partitionKey,
    entityId: proposal.entityId,
    entityTypeCode: proposal.entityTypeCode,
    externalKey: proposal.externalKey,
    entityLabel: proposal.entityLabel,
    kind: proposal.kind,
    actionTypeCode: proposal.actionTypeCode,
    title: proposal.title,
    summary: proposal.summary,
    expectedEffects: proposal.expectedEffects,
    evidence: proposal.evidence,
    actionInput: valveJsonObject(proposal.evidence['actionInput']),
    status: proposal.status,
    reviewComment: proposal.reviewComment,
    outcome: proposal.outcome,
    createdBy: proposal.createdBy,
    reviewedBy: proposal.reviewedBy,
    completedBy: proposal.completedBy,
    createdAt: proposal.createdAt.toISOString(),
    updatedAt: proposal.updatedAt.toISOString()
  }
}

function engineeringReviewDescriptor(): ValveActionDescriptor {
  return {
    code: 'engineering_review',
    name: '工程复核',
    description: '内部工程复核任务。',
    scenario: '将建议转为可分派的内部工程复核任务。',
    source: 'demo',
    ontologyDefined: false,
    riskLevel: 'LOW',
    requiresApproval: true,
    executionMode: 'internal',
    targetSystem: 'Engineering Review',
    intentTags: ['review'],
    inputFields: [],
    preconditions: [],
    expectedEffects: ['生成工程复核任务', '保留阀门快照与审核记录'],
    available: true,
    blockingReasons: [],
    demoDefaults: {}
  }
}

function buildDemoReceipt(
  proposal: ValveActionProposal,
  action: ValveActionDescriptor,
  failed: boolean
): ValveDemoExecutionReceipt {
  const executionId = randomUUID()
  const prefixByCode: Record<string, string> = {
    create_maintenance_work_order: 'WO',
    schedule_valve_inspection: 'INS',
    raise_quality_deviation: 'NCR',
    request_spare_part: 'PR',
    request_valve_replacement: 'ENG',
    isolate_valve: 'SIM',
    request_engineering_review: 'ENG',
    engineering_review: 'ENG'
  }
  const externalReference = `${prefixByCode[action.code] ?? 'ACT'}-DEMO-${proposal.id.slice(0, 8).toUpperCase()}`
  const simulationOnly = action.executionMode === 'simulation_only'
  const status = failed ? 'failed' : 'completed'
  const message = failed
    ? `${action.targetSystem} Demo 适配器返回模拟失败；未写入真实外部系统。`
    : simulationOnly
      ? `已生成隔离模拟回执 ${externalReference}；未向 DCS/SIS 发送任何命令。`
      : `Demo 执行完成，生成回执 ${externalReference}；未写入真实 ${action.targetSystem}。`
  return {
    executionId,
    proposalId: proposal.id,
    actionTypeCode: action.code,
    status,
    executionMode: action.executionMode,
    targetSystem: action.targetSystem,
    externalReference,
    message,
    effects: failed ? ['记录可恢复的模拟失败', '保留输入、审批和错误审计'] : action.expectedEffects,
    simulationOnly,
    replayed: false,
    completedAt: new Date().toISOString()
  }
}

function executionPayload(receipt: ValveDemoExecutionReceipt, extra: ValveJsonObject): ValveJsonObject {
  return {
    executionId: receipt.executionId,
    actionTypeCode: receipt.actionTypeCode,
    executionMode: receipt.executionMode,
    targetSystem: receipt.targetSystem,
    externalReference: receipt.externalReference ?? null,
    message: receipt.message,
    effects: receipt.effects,
    simulationOnly: receipt.simulationOnly,
    completedAt: receipt.completedAt,
    demo: true,
    ...extra
  }
}

function valveJsonObject(value: unknown): ValveJsonObject {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as ValveJsonObject) : {}
}

function stringValue(value: unknown) {
  return typeof value === 'string' ? value : undefined
}

function stringArray(value: unknown) {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === 'string') : []
}

function executionModeValue(value: unknown): ValveDemoExecutionReceipt['executionMode'] {
  return value === 'mock_external' || value === 'simulation_only' ? value : 'internal'
}
