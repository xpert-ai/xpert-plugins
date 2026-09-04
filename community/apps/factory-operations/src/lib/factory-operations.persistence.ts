import {
	BadRequestException,
	ConflictException,HttpException,NotFoundException
} from '@nestjs/common'
import { createHash } from 'node:crypto'
import { EntityManager,FindOperator,FindOptionsWhere,IsNull,Repository } from 'typeorm'
import { AGENT_KEYS } from './constants.js'
import {
	projectFactoryCase
} from './domain/flow.js'
import { projectFactoryWorkspace } from './factory-case-workspace.js'
import type {
	EvidenceRecord,
	FactoryCaseState,FactoryExecutionRecordSummary,FactoryManagementDashboard,
	FactoryMutationReceipt,
	FactoryPipelineProjection,
	FactoryScope
} from './domain/types.js'
import {
	FactoryAuditEntity,
	FactoryCaseEntity,
	FactoryExecutionRecordEntity
} from './entities/index.js'

import type { FactoryMutationResult } from './factory-operations.service.js'

export async function duplicateMutation(
  manager: EntityManager,
  scope: FactoryScope,
  caseId: string,
  operationId: string,
  fingerprint: string
): Promise<FactoryMutationResult | null> {
  const audit = await manager.getRepository(FactoryAuditEntity).findOne({
    where: auditWhere(scope, { operationId })
  })
  if (!audit) return null
  if (audit.caseId !== caseId) {
    throw new ConflictException({
      errorCode: 'factory_operation_case_conflict',
      message: 'operationId belongs to another Factory Case.'
    })
  }
  assertFingerprint(audit.operationFingerprint, fingerprint)
  const entity = await requireCase(manager.getRepository(FactoryCaseEntity), scope, caseId)
  const stored = parseReceipt(audit.receipt)
  return {
    receipt: { ...stored, duplicate: true },
    summary: projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
  }
}

export async function writeAudit(
  manager: EntityManager,
  scope: FactoryScope,
  input: {
    caseId: string
    operationId: string
    fingerprint: string
    eventType: string
    previousRevision: number | null
    resultingRevision: number
    changeSummary: string
    receipt: FactoryMutationReceipt
  }
) {
  await manager.getRepository(FactoryAuditEntity).save({
    ...scopeColumns(scope),
    scopeKey: scopeKey(scope),
    caseId: input.caseId,
    operationId: input.operationId,
    operationFingerprint: input.fingerprint,
    eventType: input.eventType,
    actorType: scope.actorType,
    actorId: actorId(scope),
    previousRevision: input.previousRevision,
    resultingRevision: input.resultingRevision,
    changeSummary: input.changeSummary,
    receipt: input.receipt
  })
}

export async function requireCase(
  repository: Repository<FactoryCaseEntity>,
  scope: FactoryScope,
  caseId: string
) {
  const entity = await repository.findOne({
    where: caseWhere(scope, { id: caseId })
  })
  if (!entity) {
    throw new NotFoundException({
      errorCode: 'factory_case_not_found',
      message: 'Factory Case was not found.'
    })
  }
  return entity
}

interface ExecutionWriteInput {
  caseId: string
  workspaceProjectId?: string
  operationId: string
  eventType: string
  inputRevision: number
  outputRevision?: number | null
  safeSummary: string
}

export async function writeSucceededExecution(
  manager: EntityManager,
  scope: FactoryScope,
  input: ExecutionWriteInput
) {
  const descriptor = executionDescriptor(input.eventType)
  if (!descriptor || scope.actorType !== 'agent') return
  const repository = manager.getRepository(FactoryExecutionRecordEntity)
  const existing = await repository.findOne({
    where: executionWhere(scope, { operationId: input.operationId })
  })
  if (!existing || existing.caseId !== input.caseId) return
  if (input.workspaceProjectId && existing.workspaceProjectId !== input.workspaceProjectId) {
    throw new ConflictException({
      errorCode: 'factory_execution_project_mismatch',
      message: 'Assistant Task finalizer does not match the Factory Case Project.'
    })
  }
  const previousFailure = await repository.findOne({
    where: executionWhere(scope, {
      caseId: input.caseId,
      nodeKey: descriptor.nodeKey,
      status: 'failed'
    }),
    order: { sequence: 'DESC' }
  })
  const now = new Date()
  await repository.update(existing.id, {
    agentKey: scope.agentKey ?? descriptor.agentKey,
    status: 'succeeded',
    outputRevision: input.outputRevision ?? null,
    safeSummary: boundedSummary(input.safeSummary),
    conversationId: scope.conversationId ?? existing.conversationId,
    threadId: scope.threadId ?? existing.threadId,
    executionId: scope.executionId ?? existing.executionId,
    finishedAt: now
  })
  if (previousFailure && !previousFailure.supersededByRecordId) {
    await repository.update(previousFailure.id, {
      supersededByRecordId: existing.id
    })
  }
}

export async function writeFailedExecutionSafely(
  manager: EntityManager,
  scope: FactoryScope,
  input: ExecutionWriteInput
) {
  const descriptor = executionDescriptor(input.eventType)
  if (!descriptor || scope.actorType !== 'agent') return
  try {
    await manager.transaction(async (transaction) => {
      const repository = transaction.getRepository(FactoryExecutionRecordEntity)
      const existing = await repository.findOne({
        where: executionWhere(scope, { operationId: input.operationId })
      })
      if (!existing || existing.caseId !== input.caseId) return
      const now = new Date()
      await repository.update(existing.id, {
        agentKey: scope.agentKey ?? descriptor.agentKey,
        status: 'failed',
        safeSummary: boundedSummary(input.safeSummary),
        conversationId: scope.conversationId ?? existing.conversationId,
        threadId: scope.threadId ?? existing.threadId,
        executionId: scope.executionId ?? existing.executionId,
        finishedAt: now
      })
    })
  } catch {
    // Execution audit failure never replaces the original business error.
  }
}

export function executionDescriptor(eventType: string) {
  return {
    triage_assessment_recorded: {
      nodeKey: 'triage-event',
      roleKey: 'anomaly-triage-specialist',
      roleLabel: 'Anomaly Triage Agent',
      agentKey: AGENT_KEYS.triage
    },
    equipment_finding_recorded: {
      nodeKey: 'diagnose-equipment',
      roleKey: 'equipment-diagnostics-specialist',
      roleLabel: 'Equipment Diagnostics Agent',
      agentKey: AGENT_KEYS.equipment
    },
    quality_finding_recorded: {
      nodeKey: 'assess-quality-impact',
      roleKey: 'quality-risk-specialist',
      roleLabel: 'Quality Impact Agent',
      agentKey: AGENT_KEYS.quality
    },
    production_finding_recorded: {
      nodeKey: 'assess-production-impact',
      roleKey: 'production-impact-specialist',
      roleLabel: 'Production Impact Agent',
      agentKey: AGENT_KEYS.production
    },
    resource_finding_recorded: {
      nodeKey: 'check-resource-readiness',
      roleKey: 'resource-readiness-specialist',
      roleLabel: 'Resource Readiness Agent',
      agentKey: AGENT_KEYS.resources
    },
    recovery_plan_generated: {
      nodeKey: 'generate-recovery-plan',
      roleKey: 'recovery-planning-specialist',
      roleLabel: 'Recovery Planning Agent',
      agentKey: AGENT_KEYS.planning
    },
    recovery_verified: {
      nodeKey: 'verify-recovery',
      roleKey: 'recovery-verification-specialist',
      roleLabel: 'Recovery Verification Agent',
      agentKey: AGENT_KEYS.verification
    }
  }[eventType]
}

export function kpi(
  key: string,
  label: string,
  value: number | null,
  unit: string | null,
  status: FactoryManagementDashboard['kpis'][number]['status'],
  definition: string
): FactoryManagementDashboard['kpis'][number] {
  return { key, label, value, unit, status, definition }
}

export function buildRecoveryTrend(
  cases: FactoryCaseEntity[],
  records: FactoryExecutionRecordEntity[],
  refreshedAt: string
): Array<Record<string, string | number | null>> {
  const end = new Date(refreshedAt)
  const rows = Array.from({ length: 7 }, (_, index) => {
    const date = new Date(
      Date.UTC(end.getUTCFullYear(), end.getUTCMonth(), end.getUTCDate() - (6 - index))
    )
    return {
      date: date.toISOString().slice(0, 10),
      opened: 0,
      recovered: 0,
      failedExecutions: 0
    }
  })
  const byDate = new Map(rows.map((row) => [row.date, row]))
  for (const entity of cases) {
    const opened = byDate.get(entity.createdAt.toISOString().slice(0, 10))
    if (opened) opened.opened = Number(opened.opened) + 1
    if (entity.snapshot.status === 'recovered') {
      const recovered = byDate.get(entity.updatedAt.toISOString().slice(0, 10))
      if (recovered) recovered.recovered = Number(recovered.recovered) + 1
    }
  }
  for (const record of records) {
    if (record.status !== 'failed') continue
    const row = byDate.get(record.startedAt.toISOString().slice(0, 10))
    if (row) row.failedExecutions = Number(row.failedExecutions) + 1
  }
  return rows
}

export function boundedSummary(value: string) {
  const normalized = value.trim() || 'Agent execution completed without a display summary.'
  return normalized.slice(0, 500)
}

export function executionFailureSummary(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (typeof response === 'object' && response) {
      const code = Reflect.get(response, 'errorCode')
      if (typeof code === 'string') return `Agent execution failed: ${code}`
    }
  }
  return 'Agent execution failed before the business completion predicate was satisfied.'
}

export function toExecutionRecordSummary(
  entity: FactoryExecutionRecordEntity
): FactoryExecutionRecordSummary {
  return {
    recordId: entity.id,
    caseId: entity.caseId,
    sequence: entity.sequence,
    attemptNumber: entity.attemptNumber,
    nodeKey: entity.nodeKey,
    roleKey: entity.roleKey,
    roleLabel: entity.roleLabel,
    agentKey: entity.agentKey,
    status: entity.status,
    startedAt: entity.startedAt.toISOString(),
    finishedAt: entity.finishedAt?.toISOString() ?? null,
    inputRevision: entity.inputRevision,
    outputRevision: entity.outputRevision ?? null,
    safeSummary: entity.safeSummary,
    workspaceProjectId: entity.workspaceProjectId,
    queueJobId: entity.queueJobId ?? null,
    assistantTaskId: entity.assistantTaskId ?? null,
    conversationId: entity.conversationId ?? null,
    threadId: entity.threadId ?? null,
    executionId: entity.executionId ?? null,
    requesterXpertId: entity.requesterXpertId,
    executorXpertId: entity.executorXpertId ?? null,
    executorAgentKey: entity.executorAgentKey ?? null,
    executorAssistantTemplateKey: entity.executorAssistantTemplateKey ?? null,
    executorAssistantTitle: entity.executorAssistantTitle ?? null,
    executorPublishedVersion: entity.executorPublishedVersion ?? null,
    supersededByRecordId: entity.supersededByRecordId ?? null
  }
}

export function countLaneStatus(
  projections: FactoryPipelineProjection[],
  laneKey: string,
  status: FactoryPipelineProjection['nodes'][number]['status']
) {
  return projections.reduce(
    (count, projection) =>
      count +
      projection.nodes.filter((node) => node.laneKey === laneKey && node.status === status).length,
    0
  )
}

export function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export function average(values: number[]) {
  return values.length ? Math.round(sum(values) / values.length) : null
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

export async function currentRevision(manager: EntityManager, scope: FactoryScope, caseId: string) {
  const entity = await manager.getRepository(FactoryCaseEntity).findOne({
    where: caseWhere(scope, { id: caseId })
  })
  return entity?.revision ?? 0
}

export function caseWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryCaseEntity> = {}
): FindOptionsWhere<FactoryCaseEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: organizationFilter(scope.organizationId),
    ...extra
  }
}

export function auditWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryAuditEntity> = {}
): FindOptionsWhere<FactoryAuditEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: organizationFilter(scope.organizationId),
    ...extra
  }
}

export function executionWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryExecutionRecordEntity> = {}
): FindOptionsWhere<FactoryExecutionRecordEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: organizationFilter(scope.organizationId),
    ...extra
  }
}

export function organizationFilter(organizationId?: string | null): string | FindOperator<string> {
  return organizationId ?? IsNull()
}

export function scopeColumns(scope: FactoryScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null
  }
}

export function scopeKey(scope: FactoryScope) {
  return `${scope.tenantId}:${scope.organizationId ?? 'tenant'}`
}

export function actorId(scope: FactoryScope) {
  return scope.userId ?? scope.assistantId ?? 'factory-system'
}

export function requireCreator(scope: FactoryScope) {
  const userId = scope.userId?.trim()
  if (!userId) {
    throw new BadRequestException({
      errorCode: 'factory_case_creator_required',
      message: 'An authenticated user is required to create a Factory Case.'
    })
  }
  return userId
}

export function validateScope(scope: FactoryScope) {
  if (!scope.tenantId?.trim()) {
    throw new BadRequestException({
      errorCode: 'factory_tenant_scope_required',
      message: 'Tenant scope is required.'
    })
  }
}

export function revisionConflict(currentRevisionValue: number) {
  return new ConflictException({
    errorCode: 'factory_revision_conflict',
    message: 'Factory Case changed. Refresh and retry.',
    currentRevision: currentRevisionValue
  })
}

export function operationFingerprint(eventType: string, input: object) {
  return createHash('sha256').update(stableStringify({ eventType, input })).digest('hex')
}

export function stableStringify(value: object) {
  return JSON.stringify(sortObject(value))
}

export function sortObject(value: object): object {
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [
        key,
        Array.isArray(item)
          ? item.map((entry) => (entry && typeof entry === 'object' ? sortObject(entry) : entry))
          : item && typeof item === 'object'
            ? sortObject(item)
            : item
      ])
  )
}

export function assertFingerprint(stored: string, requested: string) {
  if (stored !== requested) {
    throw new ConflictException({
      errorCode: 'factory_operation_payload_conflict',
      message: 'operationId was already used with a different payload.'
    })
  }
}

export function parseReceipt(value: object): FactoryMutationReceipt {
  const read = (key: string) => Reflect.get(value, key)
  const success = read('success')
  const operationId = read('operationId')
  const caseId = read('caseId')
  const revision = read('revision')
  const status = read('status')
  const changedArtifact = read('changedArtifact')
  const nextAction = read('nextAction')
  if (
    success !== true ||
    typeof operationId !== 'string' ||
    typeof caseId !== 'string' ||
    typeof revision !== 'number' ||
    typeof status !== 'string' ||
    typeof changedArtifact !== 'string' ||
    typeof nextAction !== 'string'
  ) {
    throw new Error('Stored Factory mutation receipt is invalid.')
  }
  const previousRevision = read('previousRevision')
  const rebasedFromRevision = read('rebasedFromRevision')
  return {
    success: true,
    duplicate: false,
    operationId,
    caseId,
    previousRevision: typeof previousRevision === 'number' ? previousRevision : null,
    revision,
    status: status as FactoryMutationReceipt['status'],
    changedArtifact,
    rebasedFromRevision: typeof rebasedFromRevision === 'number' ? rebasedFromRevision : null,
    nextAction
  }
}

export function anomalyEvidence(state: FactoryCaseState): EvidenceRecord[] {
  return [
    evidence(
      'iot',
      'telemetry:M-07:vibration',
      state.event.occurredAt,
      '主轴振动持续上升',
      state.event.telemetry.vibrationMmS,
      'mm/s'
    ),
    evidence(
      'iot',
      'telemetry:M-07:bearing-temperature',
      state.event.occurredAt,
      '轴承温度异常',
      state.event.telemetry.bearingTemperatureC,
      '°C'
    )
  ]
}

export function evidence(
  source: EvidenceRecord['source'],
  reference: string,
  observedAt: string,
  summary: string,
  value?: number,
  unit?: string
): EvidenceRecord {
  return { source, reference, observedAt, summary, value, unit }
}

export function compactDate(value: string) {
  return value.slice(2, 10).replaceAll('-', '')
}
