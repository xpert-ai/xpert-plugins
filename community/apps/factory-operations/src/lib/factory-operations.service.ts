import { FactoryApprovalPolicy } from './factory-approval-policy.service.js'
import { duplicateMutation,writeAudit,requireCase,writeSucceededExecution,writeFailedExecutionSafely,kpi,buildRecoveryTrend,executionFailureSummary,toExecutionRecordSummary,countLaneStatus,isNumber,average,sum,currentRevision,caseWhere,executionWhere,scopeColumns,scopeKey,actorId,requireCreator,validateScope,revisionConflict,operationFingerprint,assertFingerprint,anomalyEvidence,compactDate } from './factory-operations.persistence.js'
import {
	ConflictException,
	ForbiddenException,Inject,
	Injectable
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { EntityManager,FindOptionsWhere,ILike,Repository } from 'typeorm'
import { AGENT_KEYS } from './constants.js'
import { FACTORY_CONFIG,type FactoryConfig } from './config.js'
import {
	applyFactoryCommand,
	artifactForCommand,
	createDemoFactoryCase,
	isSafeParallelFinding,
	projectFactoryCase,
	type FactoryCommand
} from './domain/flow.js'
import { projectFactoryPipeline } from './domain/pipeline.js'
import { FactoryCaseProjectService } from './factory-case-project.service.js'
import { projectFactoryWorkspace } from './factory-case-workspace.js'
import type {
	FactoryCaseState,
	FactoryCaseSummary,FactoryFindingKind,
	FactoryManagementDashboard,
	FactoryMutationReceipt,
	FactoryPipelineProjection,
	FactoryScope
} from './domain/types.js'
import {
	FactoryArtifactEntity,
	FactoryAuditEntity,
	FactoryCaseEntity,
	FactoryExecutionRecordEntity
} from './entities/index.js'
import type {
	ApproveRecoveryPlanInput,
	CreateDemoIncidentInput,
	ExecuteRecoveryPlanInput,
	GenerateRecoveryPlanInput,
	GetFactoryCaseInput,
	RecordEquipmentFindingInput,
	RecordProductionFindingInput,
	RecordQualityFindingInput,
	RecordResourceFindingInput,
	RecordTriageInput,
	RejectRecoveryPlanInput,
	RunSpecialistAnalysisInput,
	VerifyRecoveryInput
} from './tool-schemas.js'

export interface FactoryCaseListResult {
  items: FactoryCaseSummary[]
  total: number
  page: number
  pageSize: number
}

export interface FactoryMutationResult {
  receipt: FactoryMutationReceipt
  summary: FactoryCaseSummary
}

class RetryableFactoryConflict extends Error {}

@Injectable()
export class FactoryOperationsService {
  constructor(
    @InjectRepository(FactoryCaseEntity)
    private readonly cases: Repository<FactoryCaseEntity>,
    @InjectRepository(FactoryArtifactEntity)
    private readonly artifacts: Repository<FactoryArtifactEntity>,
    @InjectRepository(FactoryAuditEntity)
    private readonly audits: Repository<FactoryAuditEntity>,
    @InjectRepository(FactoryExecutionRecordEntity)
    private readonly executionRecords: Repository<FactoryExecutionRecordEntity>,
    private readonly caseProjects: FactoryCaseProjectService,
    @Inject(FACTORY_CONFIG)
    private readonly config: FactoryConfig,
    private readonly approvalPolicy: FactoryApprovalPolicy
  ) {}

  get runtimeMode() {
    return this.config.mode
  }

  async createDemoIncident(
    scope: FactoryScope,
    input: CreateDemoIncidentInput
  ): Promise<FactoryMutationResult> {
    validateScope(scope)
    const createdById = requireCreator(scope)
    const fingerprint = operationFingerprint('anomaly_event_created', input)
    const persisted = await this.cases.manager.transaction(async (manager) => {
      const caseRepository = manager.getRepository(FactoryCaseEntity)
      const existing = await caseRepository.findOne({
        where: caseWhere(scope, { creationOperationId: input.operationId })
      })
      if (existing) {
        assertFingerprint(existing.creationFingerprint, fingerprint)
        if (existing.createdById !== createdById) {
          throw new ForbiddenException({
            errorCode: 'factory_case_creator_required',
            message: 'Only the Factory Case creator can retry its creation operation.'
          })
        }
        return {
          entity: existing,
          receipt: {
            success: true as const,
            duplicate: true,
            operationId: input.operationId,
            caseId: existing.id,
            previousRevision: null,
            revision: existing.revision,
            status: existing.status,
            changedArtifact: 'anomaly-event',
            rebasedFromRevision: null,
            nextAction: projectFactoryCase(existing.snapshot, projectFactoryWorkspace(existing))
              .nextAction
          }
        }
      }

      const id = randomUUID()
      const workspaceProjectId = randomUUID()
      const now = new Date().toISOString()
      const caseKey = `FAC-${compactDate(now)}-${id.slice(0, 6).toUpperCase()}`
      const snapshot = createDemoFactoryCase(id, caseKey, now)
      const entity = await caseRepository.save(
        caseRepository.create({
          id,
          ...scopeColumns(scope),
          scopeKey: scopeKey(scope),
          caseKey,
          creationOperationId: input.operationId,
          creationFingerprint: fingerprint,
          status: snapshot.status,
          createdById,
          workspaceProjectId,
          workspaceProjectSyncStatus: 'provisioning',
          workspaceProjectSyncedAt: new Date(),
          workspaceProjectErrorCode: null,
          workspaceProjectErrorSummary: null,
          currentStage: snapshot.currentStage,
          deviceId: snapshot.event.deviceId,
          revision: snapshot.revision,
          snapshot,
          lastEditedById: actorId(scope)
        })
      )
      const receipt: FactoryMutationReceipt = {
        success: true,
        duplicate: false,
        operationId: input.operationId,
        caseId: id,
        previousRevision: null,
        revision: 1,
        status: snapshot.status,
        changedArtifact: 'anomaly-event',
        rebasedFromRevision: null,
        nextAction: projectFactoryCase(snapshot, projectFactoryWorkspace(entity)).nextAction
      }
      await manager.getRepository(FactoryArtifactEntity).save({
        ...scopeColumns(scope),
        caseId: id,
        artifactKey: 'anomaly-event',
        artifactRevision: 1,
        status: snapshot.event.status,
        payload: snapshot.event,
        evidence: anomalyEvidence(snapshot),
        confidence: 1,
        createdByAgentKey: null,
        operationId: input.operationId
      })
      await writeAudit(manager, scope, {
        caseId: id,
        operationId: input.operationId,
        fingerprint,
        eventType: 'anomaly_event_created',
        previousRevision: null,
        resultingRevision: 1,
        changeSummary: input.changeSummary,
        receipt
      })
      return { entity, receipt }
    })
    const entity =
      persisted.entity.workspaceProjectSyncStatus === 'ready'
        ? persisted.entity
        : await this.caseProjects.synchronize(scope, persisted.entity)
    return {
      receipt: persisted.receipt,
      summary: projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
    }
  }

  async listCases(
    scope: FactoryScope,
    query: { page?: number; pageSize?: number; search?: string } = {}
  ): Promise<FactoryCaseListResult> {
    validateScope(scope)
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.max(1, Math.min(query.pageSize ?? 20, 50))
    const search = query.search?.trim() ?? ''
    const base = caseWhere(scope)
    const where: FindOptionsWhere<FactoryCaseEntity>[] | FindOptionsWhere<FactoryCaseEntity> =
      search
        ? [
            { ...base, caseKey: ILike(`%${search}%`) },
            { ...base, deviceId: ILike(`%${search}%`) }
          ]
        : base
    const [entities, total] = await this.cases.findAndCount({
      where,
      order: { updatedAt: 'DESC', id: 'ASC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return {
      items: entities.map((entity) =>
        projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
      ),
      total,
      page,
      pageSize
    }
  }

  async getCaseSummary(scope: FactoryScope, input: GetFactoryCaseInput) {
    const entity = await this.requireCase(scope, input.caseId)
    if (input.expectedRevision !== undefined && entity.revision !== input.expectedRevision) {
      throw revisionConflict(entity.revision)
    }
    return projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
  }

  async findCaseSummaryByWorkspaceProject(scope: FactoryScope, workspaceProjectId: string) {
    validateScope(scope)
    const entity = await this.cases.findOne({
      where: caseWhere(scope, { workspaceProjectId })
    })
    return entity ? projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity)) : null
  }

  async getCaseProjection(
    scope: FactoryScope,
    input: GetFactoryCaseInput
  ): Promise<FactoryPipelineProjection> {
    const entity = await this.requireCase(scope, input.caseId)
    if (input.expectedRevision !== undefined && entity.revision !== input.expectedRevision) {
      throw revisionConflict(entity.revision)
    }
    const records = await this.executionRecords.find({
      where: executionWhere(scope, { caseId: entity.id }),
      order: { startedAt: 'DESC', sequence: 'DESC' },
      take: 200
    })
    return projectFactoryPipeline(entity.snapshot, records.map(toExecutionRecordSummary))
  }

  async listExecutionRecords(
    scope: FactoryScope,
    input: {
      caseId: string
      nodeKey?: string
      page?: number
      pageSize?: number
    }
  ) {
    await this.requireCase(scope, input.caseId)
    const page = Math.max(1, input.page ?? 1)
    const pageSize = Math.max(1, Math.min(input.pageSize ?? 20, 100))
    const where = executionWhere(scope, {
      caseId: input.caseId,
      ...(input.nodeKey ? { nodeKey: input.nodeKey } : {})
    })
    const [records, total] = await this.executionRecords.findAndCount({
      where,
      order: { startedAt: 'DESC', sequence: 'DESC' },
      skip: (page - 1) * pageSize,
      take: pageSize
    })
    return {
      items: records.map(toExecutionRecordSummary),
      total,
      page,
      pageSize
    }
  }

  async getManagementDashboard(scope: FactoryScope): Promise<FactoryManagementDashboard> {
    validateScope(scope)
    const refreshedAt = new Date().toISOString()
    const [entities, totalCases, recordEntities] = await Promise.all([
      this.cases.find({
        where: caseWhere(scope),
        order: { updatedAt: 'DESC', id: 'ASC' },
        take: 100
      }),
      this.cases.count({ where: caseWhere(scope) }),
      this.executionRecords.find({
        where: executionWhere(scope),
        order: { startedAt: 'DESC', sequence: 'DESC' },
        take: 500
      })
    ])
    const summaries = entities.map((entity) =>
      projectFactoryCase(entity.snapshot, projectFactoryWorkspace(entity))
    )
    const records = recordEntities.map(toExecutionRecordSummary)
    const projections = entities.map((entity) =>
      projectFactoryPipeline(
        entity.snapshot,
        records.filter((record) => record.caseId === entity.id),
        refreshedAt
      )
    )
    const pipelineHealth =
      projections[0]?.lanes.map((lane) => ({
        laneKey: lane.key,
        laneTitle: lane.title,
        ready: countLaneStatus(projections, lane.key, 'ready'),
        active: countLaneStatus(projections, lane.key, 'active'),
        blocked: countLaneStatus(projections, lane.key, 'blocked'),
        completed:
          countLaneStatus(projections, lane.key, 'completed') +
          countLaneStatus(projections, lane.key, 'satisfied_externally')
      })) ?? []
    const responseValues = summaries.map((item) => item.metrics.responseSeconds).filter(isNumber)
    const recoveryValues = summaries.map((item) => item.metrics.recoveryMinutes).filter(isNumber)
    const terminal = new Set(['recovered', 'rejected'])
    const summary = {
      totalCases,
      activeCases: summaries.filter((item) => !terminal.has(item.status)).length,
      criticalCases: summaries.filter(
        (item) => item.event.severity === 'critical' && !terminal.has(item.status)
      ).length,
      awaitingApproval: summaries.filter((item) => item.status === 'awaiting_approval').length,
      recoveredCases: summaries.filter((item) => item.status === 'recovered').length,
      failedExecutions: records.filter((item) => item.status === 'failed').length,
      averageResponseSeconds: average(responseValues),
      averageRecoveryMinutes: average(recoveryValues),
      avoidedDowntimeMinutes: sum(summaries.map((item) => item.metrics.avoidedDowntimeMinutes)),
      avoidedLossCny: sum(summaries.map((item) => item.metrics.avoidedLossCny))
    }
    const statusRows = Array.from(new Set(summaries.map((item) => item.status)))
      .sort()
      .map((status) => ({
        status,
        count: summaries.filter((item) => item.status === status).length
      }))
    const trendRows = buildRecoveryTrend(entities, recordEntities, refreshedAt)
    return {
      generatedAt: refreshedAt,
      revision: entities[0]?.updatedAt?.toISOString() ?? refreshedAt,
      kpis: [
        kpi(
          'active-cases',
          'Active cases',
          summary.activeCases,
          null,
          summary.criticalCases ? 'critical' : 'info',
          'Non-terminal Factory Cases in the authorized projection.'
        ),
        kpi(
          'critical-cases',
          'Critical active',
          summary.criticalCases,
          null,
          summary.criticalCases ? 'critical' : 'neutral',
          'Critical-severity non-terminal Factory Cases.'
        ),
        kpi(
          'awaiting-approval',
          'Awaiting approval',
          summary.awaitingApproval,
          null,
          summary.awaitingApproval ? 'warning' : 'neutral',
          'Cases waiting for a revision-bound human decision.'
        ),
        kpi(
          'average-recovery',
          'Average recovery',
          summary.averageRecoveryMinutes,
          'min',
          'info',
          'Mean measured recovery time for Cases with a persisted value.'
        ),
        kpi(
          'avoided-loss',
          'Avoided loss',
          summary.avoidedLossCny,
          'CNY',
          'success',
          'Persisted avoided-loss estimate across the authorized projection.'
        )
      ],
      series: [
        {
          key: 'recovery-throughput-trend',
          chartIntent: 'trend',
          dimensions: ['date', 'opened', 'recovered', 'failedExecutions'],
          rows: trendRows
        },
        {
          key: 'lane-bottlenecks',
          chartIntent: 'bottleneck',
          dimensions: ['lane', 'ready', 'active', 'blocked', 'completed'],
          rows: pipelineHealth.map((lane) => ({
            lane: lane.laneTitle,
            ready: lane.ready,
            active: lane.active,
            blocked: lane.blocked,
            completed: lane.completed
          }))
        },
        {
          key: 'case-status-composition',
          chartIntent: 'composition',
          dimensions: ['status', 'count'],
          rows: statusRows
        }
      ],
      summary,
      pipelineHealth,
      cases: summaries.slice(0, 20),
      recentExecutions: records.slice(0, 20),
      simulation: this.runtimeMode === 'simulation',
      truncated: totalCases > entities.length || recordEntities.length === 500,
      refreshedAt
    }
  }

  async recordTriage(scope: FactoryScope, input: RecordTriageInput) {
    return this.mutate(scope, input, 'triage_assessment_recorded', () => ({
      type: 'triage',
      agentKey: AGENT_KEYS.triage,
      at: new Date().toISOString(),
      severity: input.severity,
      summary: input.summary,
      confidence: input.confidence,
      evidence: input.evidence
    }))
  }

  async recordEquipmentFinding(scope: FactoryScope, input: RecordEquipmentFindingInput) {
    return this.mutate(
      scope,
      input,
      'equipment_finding_recorded',
      () => ({
        type: 'finding',
        kind: 'equipment',
        agentKey: AGENT_KEYS.equipment,
        at: new Date().toISOString(),
        failureMode: input.failureMode,
        remainingSafeMinutes: input.remainingSafeMinutes,
        recommendation: input.recommendation,
        summary: input.summary,
        confidence: input.confidence,
        evidence: input.evidence
      }),
      'equipment'
    )
  }

  async recordQualityFinding(scope: FactoryScope, input: RecordQualityFindingInput) {
    return this.mutate(
      scope,
      input,
      'quality_finding_recorded',
      () => ({
        type: 'finding',
        kind: 'quality',
        agentKey: AGENT_KEYS.quality,
        at: new Date().toISOString(),
        affectedQuantity: input.affectedQuantity,
        isolationWindowMinutes: input.isolationWindowMinutes,
        recommendation: input.recommendation,
        summary: input.summary,
        confidence: input.confidence,
        evidence: input.evidence
      }),
      'quality'
    )
  }

  async recordProductionFinding(scope: FactoryScope, input: RecordProductionFindingInput) {
    return this.mutate(
      scope,
      input,
      'production_finding_recorded',
      () => ({
        type: 'finding',
        kind: 'production',
        agentKey: AGENT_KEYS.production,
        at: new Date().toISOString(),
        impactedWorkOrderCount: input.impactedWorkOrderCount,
        riskOrderCount: input.riskOrderCount,
        estimatedDelayMinutes: input.estimatedDelayMinutes,
        alternateLineId: input.alternateLineId,
        changeoverMinutes: input.changeoverMinutes,
        incrementalCostCny: input.incrementalCostCny,
        summary: input.summary,
        confidence: input.confidence,
        evidence: input.evidence
      }),
      'production'
    )
  }

  async recordResourceFinding(scope: FactoryScope, input: RecordResourceFindingInput) {
    return this.mutate(
      scope,
      input,
      'resource_finding_recorded',
      () => ({
        type: 'finding',
        kind: 'resources',
        agentKey: AGENT_KEYS.resources,
        at: new Date().toISOString(),
        spareSku: input.spareSku,
        spareAvailability: input.spareAvailability,
        spareQuantity: input.spareQuantity,
        deliveryMinutes: input.deliveryMinutes,
        qualifiedEngineerAvailable: input.qualifiedEngineerAvailable,
        summary: input.summary,
        confidence: input.confidence,
        evidence: input.evidence
      }),
      'resources'
    )
  }

  async generateRecoveryPlan(scope: FactoryScope, input: GenerateRecoveryPlanInput) {
    return this.mutate(scope, input, 'recovery_plan_generated', () => ({
      type: 'generate_plan',
      agentKey: AGENT_KEYS.planning,
      at: new Date().toISOString()
    }))
  }

  async approveRecoveryPlan(scope: FactoryScope, input: ApproveRecoveryPlanInput, afterMutation?: (manager: EntityManager, entity: FactoryCaseEntity, next: FactoryCaseState) => Promise<void>) {
    await this.approvalPolicy.assertHumanApprover(scope, await this.requireCase(scope, input.caseId))
    return this.mutate(scope, input, afterMutation ? 'recovery_plan_approved_and_continue' : 'recovery_plan_approved', () => ({
      type: 'approve_plan',
      actorId: actorId(scope),
      at: new Date().toISOString(),
      reason: input.reason
    }), undefined, afterMutation)
  }

  async rejectRecoveryPlan(scope: FactoryScope, input: RejectRecoveryPlanInput) {
    await this.approvalPolicy.assertHumanApprover(scope, await this.requireCase(scope, input.caseId))
    return this.mutate(scope, input, 'recovery_plan_rejected', () => ({
      type: 'reject_plan',
      actorId: actorId(scope),
      at: new Date().toISOString(),
      reason: input.reason
    }))
  }

  async executeRecoveryPlan(scope: FactoryScope, input: ExecuteRecoveryPlanInput) {
    return this.mutate(scope, input, 'recovery_plan_executed', () => ({
      type: 'execute_plan',
      at: new Date().toISOString(),
      mode: this.config.mode
    }))
  }

  async verifyRecovery(scope: FactoryScope, input: VerifyRecoveryInput) {
    return this.mutate(scope, input, 'recovery_verified', () => ({
      type: 'verify_recovery',
      agentKey: AGENT_KEYS.verification,
      at: new Date().toISOString()
    }))
  }

  async getExecutionStatus(scope: FactoryScope, input: GetFactoryCaseInput) {
    const summary = await this.getCaseSummary(scope, input)
    return {
      caseId: summary.id,
      revision: summary.revision,
      status: summary.execution?.status ?? 'not_started',
      actionCount: summary.execution?.actions.length ?? 0,
      confirmedCount:
        summary.execution?.actions.filter((action) => action.status === 'confirmed').length ?? 0,
      failedActionKeys:
        summary.execution?.actions
          .filter((action) => action.status === 'failed')
          .map((action) => action.key) ?? [],
      nextAction: summary.nextAction
    }
  }

  async runDemoAnalysis(
    scope: FactoryScope,
    input: RunSpecialistAnalysisInput
  ): Promise<FactoryMutationResult> {
    let revision = input.baseRevision
    const prefix = input.operationId
    let summary = await this.getCaseSummary(scope, {
      caseId: input.caseId,
      expectedRevision: revision
    })
    const facts = summary.analysisFacts
    if (!summary.triage) {
      const result = await this.recordTriage(scope, {
        caseId: input.caseId,
        baseRevision: revision,
        operationId: `${prefix}:triage`,
        changeSummary: 'Recorded M-07 anomaly triage',
        ...facts.triage
      })
      revision = result.receipt.revision
    }

    const operations: Array<() => Promise<FactoryMutationResult>> = []
    summary = await this.getCaseSummary(scope, { caseId: input.caseId })
    if (!summary.findings.equipment) {
      operations.push(() =>
        this.recordEquipmentFinding(scope, {
          caseId: input.caseId,
          baseRevision: revision,
          operationId: `${prefix}:equipment`,
          changeSummary: 'Recorded equipment diagnosis',
          ...facts.equipment
        })
      )
    }
    if (!summary.findings.quality) {
      operations.push(() =>
        this.recordQualityFinding(scope, {
          caseId: input.caseId,
          baseRevision: revision,
          operationId: `${prefix}:quality`,
          changeSummary: 'Recorded quality impact',
          ...facts.quality
        })
      )
    }
    if (!summary.findings.production) {
      operations.push(() =>
        this.recordProductionFinding(scope, {
          caseId: input.caseId,
          baseRevision: revision,
          operationId: `${prefix}:production`,
          changeSummary: 'Recorded production impact',
          ...facts.production
        })
      )
    }
    if (!summary.findings.resources) {
      operations.push(() =>
        this.recordResourceFinding(scope, {
          caseId: input.caseId,
          baseRevision: revision,
          operationId: `${prefix}:resources`,
          changeSummary: 'Recorded resource readiness',
          ...facts.resources
        })
      )
    }
    if (operations.length) {
      await Promise.all(operations.map((operation) => operation()))
    }
    summary = await this.getCaseSummary(scope, { caseId: input.caseId })
    if (!summary.plan) {
      const result = await this.generateRecoveryPlan(scope, {
        caseId: input.caseId,
        baseRevision: summary.revision,
        operationId: `${prefix}:plan`,
        changeSummary: 'Generated three recovery options'
      })
      return result
    }
    return {
      receipt: {
        success: true,
        duplicate: true,
        operationId: input.operationId,
        caseId: summary.id,
        previousRevision: summary.revision,
        revision: summary.revision,
        status: summary.status,
        changedArtifact: 'recovery-plan',
        rebasedFromRevision: null,
        nextAction: summary.nextAction
      },
      summary
    }
  }

  private async mutate(
    scope: FactoryScope,
    input: {
      caseId: string
      operationId: string
      baseRevision: number
      changeSummary: string
    },
    eventType: string,
    commandFactory: () => FactoryCommand,
    safeParallelKind?: FactoryFindingKind,
    afterMutation?: (manager: EntityManager, entity: FactoryCaseEntity, next: FactoryCaseState) => Promise<void>
  ): Promise<FactoryMutationResult> {
    validateScope(scope)
    const fingerprint = operationFingerprint(eventType, input)
    for (let attempt = 0; attempt < 4; attempt += 1) {
      try {
        return await this.cases.manager.transaction(async (manager) => {
          const duplicate = await duplicateMutation(
            manager,
            scope,
            input.caseId,
            input.operationId,
            fingerprint
          )
          if (duplicate) return duplicate

          const repository = manager.getRepository(FactoryCaseEntity)
          const entity = await requireCase(repository, scope, input.caseId)
          const canRebase =
            safeParallelKind !== undefined &&
            input.baseRevision < entity.revision &&
            isSafeParallelFinding(entity.snapshot, safeParallelKind)
          if (entity.revision !== input.baseRevision && !canRebase) {
            throw revisionConflict(entity.revision)
          }
          if (eventType.startsWith('recovery_plan_approved') || eventType === 'recovery_plan_rejected') {
            await this.approvalPolicy.assertHumanApprover(scope, entity)
          }
          if (eventType === 'recovery_plan_executed' || eventType === 'recovery_verified') {
            await this.approvalPolicy.assertContinuationStep(manager, scope, entity, input.operationId, eventType === 'recovery_plan_executed' ? 'execute' : 'verify')
          }
          const command = commandFactory()
          const previousRevision = entity.revision
          const next = applyFactoryCommand(entity.snapshot, command)
          const update = await repository.update(
            caseWhere(scope, { id: entity.id, revision: previousRevision }),
            {
              revision: next.revision,
              status: next.status,
              currentStage: next.currentStage,
              snapshot: next,
              lastEditedById: actorId(scope),
              failureCode: null,
              failureMessage: null
            }
          )
          if (update.affected !== 1) {
            if (safeParallelKind !== undefined) throw new RetryableFactoryConflict()
            throw revisionConflict(await currentRevision(manager, scope, entity.id))
          }
          const artifact = artifactForCommand(next, command)
          const receipt: FactoryMutationReceipt = {
            success: true,
            duplicate: false,
            operationId: input.operationId,
            caseId: entity.id,
            previousRevision,
            revision: next.revision,
            status: next.status,
            changedArtifact: artifact.key,
            rebasedFromRevision: canRebase ? input.baseRevision : null,
            nextAction: projectFactoryCase(next, projectFactoryWorkspace(entity)).nextAction
          }
          await manager.getRepository(FactoryArtifactEntity).save({
            ...scopeColumns(scope),
            caseId: entity.id,
            artifactKey: artifact.key,
            artifactRevision: artifact.revision,
            status: artifact.status,
            payload: artifact.payload,
            evidence: artifact.evidence,
            confidence: artifact.confidence,
            createdByAgentKey: artifact.agentKey,
            operationId: input.operationId
          })
          await writeAudit(manager, scope, {
            caseId: entity.id,
            operationId: input.operationId,
            fingerprint,
            eventType,
            previousRevision,
            resultingRevision: next.revision,
            changeSummary: input.changeSummary,
            receipt
          })
          await writeSucceededExecution(manager, scope, {
            caseId: entity.id,
            workspaceProjectId: entity.workspaceProjectId,
            operationId: input.operationId,
            eventType,
            inputRevision: previousRevision,
            outputRevision: next.revision,
            safeSummary: input.changeSummary
          })
          await afterMutation?.(manager, entity, next)
          return {
            receipt,
            summary: projectFactoryCase(next, projectFactoryWorkspace(entity))
          }
        })
      } catch (error) {
        if (error instanceof RetryableFactoryConflict && attempt < 3) continue
        await writeFailedExecutionSafely(this.cases.manager, scope, {
          caseId: input.caseId,
          operationId: input.operationId,
          eventType,
          inputRevision: input.baseRevision,
          safeSummary: executionFailureSummary(error)
        })
        throw error
      }
    }
    throw new ConflictException({
      errorCode: 'factory_concurrent_update',
      message: 'The Factory Case changed concurrently. Refresh and retry.'
    })
  }

  private async requireCase(scope: FactoryScope, caseId: string) {
    validateScope(scope)
    return requireCase(this.cases, scope, caseId)
  }
}
