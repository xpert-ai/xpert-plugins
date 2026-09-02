import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  HttpException,
  Inject,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { EntityManager, FindOperator, FindOptionsWhere, ILike, IsNull, Repository } from 'typeorm'
import { AGENT_KEYS } from './constants.js'
import { FACTORY_CONFIG, type FactoryConfig } from './config.js'
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
  EvidenceRecord,
  FactoryCaseState,
  FactoryCaseSummary,
  FactoryExecutionRecordSummary,
  FactoryFindingKind,
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
    private readonly config: FactoryConfig
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

  async approveRecoveryPlan(scope: FactoryScope, input: ApproveRecoveryPlanInput) {
    return this.mutate(scope, input, 'recovery_plan_approved', () => ({
      type: 'approve_plan',
      actorId: actorId(scope),
      at: new Date().toISOString(),
      reason: input.reason
    }))
  }

  async rejectRecoveryPlan(scope: FactoryScope, input: RejectRecoveryPlanInput) {
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
    safeParallelKind?: FactoryFindingKind
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

async function duplicateMutation(
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

async function writeAudit(
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

async function requireCase(
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

async function writeSucceededExecution(
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

async function writeFailedExecutionSafely(
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

function executionDescriptor(eventType: string) {
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

function kpi(
  key: string,
  label: string,
  value: number | null,
  unit: string | null,
  status: FactoryManagementDashboard['kpis'][number]['status'],
  definition: string
): FactoryManagementDashboard['kpis'][number] {
  return { key, label, value, unit, status, definition }
}

function buildRecoveryTrend(
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

function boundedSummary(value: string) {
  const normalized = value.trim() || 'Agent execution completed without a display summary.'
  return normalized.slice(0, 500)
}

function executionFailureSummary(error: unknown) {
  if (error instanceof HttpException) {
    const response = error.getResponse()
    if (typeof response === 'object' && response) {
      const code = Reflect.get(response, 'errorCode')
      if (typeof code === 'string') return `Agent execution failed: ${code}`
    }
  }
  return 'Agent execution failed before the business completion predicate was satisfied.'
}

function toExecutionRecordSummary(
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

function countLaneStatus(
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

function isNumber(value: number | null): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

function average(values: number[]) {
  return values.length ? Math.round(sum(values) / values.length) : null
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0)
}

async function currentRevision(manager: EntityManager, scope: FactoryScope, caseId: string) {
  const entity = await manager.getRepository(FactoryCaseEntity).findOne({
    where: caseWhere(scope, { id: caseId })
  })
  return entity?.revision ?? 0
}

function caseWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryCaseEntity> = {}
): FindOptionsWhere<FactoryCaseEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: organizationFilter(scope.organizationId),
    ...extra
  }
}

function auditWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryAuditEntity> = {}
): FindOptionsWhere<FactoryAuditEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: organizationFilter(scope.organizationId),
    ...extra
  }
}

function executionWhere(
  scope: FactoryScope,
  extra: FindOptionsWhere<FactoryExecutionRecordEntity> = {}
): FindOptionsWhere<FactoryExecutionRecordEntity> {
  return {
    tenantId: scope.tenantId,
    organizationId: organizationFilter(scope.organizationId),
    ...extra
  }
}

function organizationFilter(organizationId?: string | null): string | FindOperator<string> {
  return organizationId ?? IsNull()
}

function scopeColumns(scope: FactoryScope) {
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId ?? null
  }
}

function scopeKey(scope: FactoryScope) {
  return `${scope.tenantId}:${scope.organizationId ?? 'tenant'}`
}

function actorId(scope: FactoryScope) {
  return scope.userId ?? scope.assistantId ?? 'factory-system'
}

function requireCreator(scope: FactoryScope) {
  const userId = scope.userId?.trim()
  if (!userId) {
    throw new BadRequestException({
      errorCode: 'factory_case_creator_required',
      message: 'An authenticated user is required to create a Factory Case.'
    })
  }
  return userId
}

function validateScope(scope: FactoryScope) {
  if (!scope.tenantId?.trim()) {
    throw new BadRequestException({
      errorCode: 'factory_tenant_scope_required',
      message: 'Tenant scope is required.'
    })
  }
}

function revisionConflict(currentRevisionValue: number) {
  return new ConflictException({
    errorCode: 'factory_revision_conflict',
    message: 'Factory Case changed. Refresh and retry.',
    currentRevision: currentRevisionValue
  })
}

function operationFingerprint(eventType: string, input: object) {
  return createHash('sha256').update(stableStringify({ eventType, input })).digest('hex')
}

function stableStringify(value: object) {
  return JSON.stringify(sortObject(value))
}

function sortObject(value: object): object {
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

function assertFingerprint(stored: string, requested: string) {
  if (stored !== requested) {
    throw new ConflictException({
      errorCode: 'factory_operation_payload_conflict',
      message: 'operationId was already used with a different payload.'
    })
  }
}

function parseReceipt(value: object): FactoryMutationReceipt {
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

function anomalyEvidence(state: FactoryCaseState): EvidenceRecord[] {
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

function evidence(
  source: EvidenceRecord['source'],
  reference: string,
  observedAt: string,
  summary: string,
  value?: number,
  unit?: string
): EvidenceRecord {
  return { source, reference, observedAt, summary, value, unit }
}

function compactDate(value: string) {
  return value.slice(2, 10).replaceAll('-', '')
}
