import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { createHash } from 'node:crypto'
import { DataSource, EntityManager, Repository, SelectQueryBuilder, type ObjectLiteral } from 'typeorm'
import {
  MeetingActionItem,
  MeetingDecision,
  MeetingExecutionReview,
  MeetingOperation,
  MeetingRecord,
  MeetingRiskSignal
} from './entities'
import type {
  ActionPriority,
  ActionStatus,
  ExecutionActionDto,
  ExecutionContextDto,
  ExecutionReviewDto,
  JsonObject,
  MeetingDetailDto,
  MeetingScope,
  MeetingStatus,
  MeetingSummaryDto,
  MeetingWorkbenchDto,
  RiskReviewStatus,
  RiskSeverity,
  RiskSignalDto,
  RiskType,
  ReviewStatus
} from './types'
import { MeetingDomainError } from './types'

interface BeginExtractionInput {
  operationId: string
  meetingId?: string
  title?: string
  sourceText?: string
  baseRevision?: number
}

interface UpsertDecisionInput {
  operationId: string
  meetingId: string
  itemKey: string
  statement: string
  evidenceQuote: string
  confidence: number
  sortOrder: number
  baseRevision?: number
}

interface UpsertActionInput {
  operationId: string
  meetingId: string
  itemKey: string
  task: string
  owner?: string
  dueDate?: string
  priority: ActionPriority
  evidenceQuote: string
  confidence: number
  sortOrder: number
  baseRevision?: number
}

interface WorkbenchQuery {
  meetingId?: string
  search?: string
  status?: MeetingStatus
  page?: number
  pageSize?: number
  executionPage?: number
  executionPageSize?: number
  executionStatus?: ActionStatus
  executionOwner?: string
}

interface UpdateDecisionInput {
  decisionId: string
  expectedRevision: number
  statement: string
  reviewStatus: ReviewStatus
}

interface UpdateActionInput {
  actionItemId: string
  expectedRevision: number
  task: string
  owner?: string | null
  dueDate?: string | null
  priority: ActionPriority
  status: ActionStatus
  reviewStatus: ReviewStatus
}

interface ExecutionContextQuery {
  page?: number
  pageSize?: number
  status?: ActionStatus
  owner?: string
  includeCompleted?: boolean
}

interface UpsertRiskSignalInput {
  operationId: string
  reviewId: string
  signalKey: string
  riskType: RiskType
  severity: RiskSeverity
  title: string
  rationale: string
  evidenceQuote: string
  recommendation: string
  meetingId?: string
  actionItemId?: string
  confidence: number
  baseRevision?: number
}

@Injectable()
export class MeetingService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(MeetingRecord) private readonly meetingRepository: Repository<MeetingRecord>,
    @InjectRepository(MeetingDecision) private readonly decisionRepository: Repository<MeetingDecision>,
    @InjectRepository(MeetingActionItem) private readonly actionRepository: Repository<MeetingActionItem>,
    @InjectRepository(MeetingExecutionReview) private readonly executionReviewRepository: Repository<MeetingExecutionReview>,
    @InjectRepository(MeetingRiskSignal) private readonly riskSignalRepository: Repository<MeetingRiskSignal>
  ) {}

  async beginExtraction(scope: MeetingScope, input: BeginExtractionInput) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOperation(manager, scope, input.operationId)
      if (existing) return this.replayOperation(existing, 'begin_extraction', input)

      let meeting: MeetingRecord
      if (input.meetingId) {
        meeting = await this.requireMeeting(manager, scope, input.meetingId, true)
        this.assertRevision(meeting, input.baseRevision)
        if (meeting.status !== 'failed') {
          throw new MeetingDomainError('MEETING_RETRY_NOT_ALLOWED', 'Only a failed meeting extraction can be retried.')
        }
        await manager.getRepository(MeetingDecision).delete({ meetingId: meeting.id, reviewStatus: 'pending' })
        await manager.getRepository(MeetingActionItem).delete({ meetingId: meeting.id, reviewStatus: 'pending' })
        meeting.status = 'processing'
        meeting.extractionAttempt += 1
        meeting.errorCode = null
        meeting.errorMessage = null
        meeting.revision += 1
        meeting = await manager.save(meeting)
      } else {
        if (!input.title?.trim() || !input.sourceText?.trim()) {
          throw new MeetingDomainError('MEETING_SOURCE_REQUIRED', 'A title and meeting source text are required.')
        }
        meeting = manager.create(MeetingRecord, {
          ...scopeColumns(scope),
          title: input.title.trim(),
          sourceText: input.sourceText.trim(),
          status: 'processing',
          revision: 1,
          extractionAttempt: 1,
          errorCode: null,
          errorMessage: null,
          createdById: scope.userId ?? null,
          assistantId: scope.assistantId ?? null,
          conversationId: scope.conversationId ?? null,
          reviewedById: null,
          reviewedAt: null
        })
        meeting = await manager.save(meeting)
      }

      const receipt = {
        meetingId: meeting.id,
        status: meeting.status,
        revision: meeting.revision,
        extractionAttempt: meeting.extractionAttempt,
        nextAction: 'upsert_decisions_and_action_items'
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'begin_extraction', input, meeting.id, receipt)
      return receipt
    })
  }

  async getContext(scope: MeetingScope, meetingId: string): Promise<MeetingDetailDto> {
    const meeting = await this.requireMeeting(this.dataSource.manager, scope, meetingId)
    return this.toDetail(scope, meeting)
  }

  async upsertDecision(scope: MeetingScope, input: UpsertDecisionInput) {
    return this.dataSource.transaction(async (manager) => {
      const existingOperation = await this.findOperation(manager, scope, input.operationId)
      if (existingOperation) return this.replayOperation(existingOperation, 'upsert_decision', input)
      const meeting = await this.requireMeeting(manager, scope, input.meetingId, true)
      this.assertProcessing(meeting)
      this.assertRevision(meeting, input.baseRevision)
      const repository = manager.getRepository(MeetingDecision)
      const existing = await this.scopedChildQuery(repository, 'decision', scope)
        .andWhere('decision.meetingId = :meetingId', { meetingId: meeting.id })
        .andWhere('decision.itemKey = :itemKey', { itemKey: input.itemKey })
        .getOne()
      const decision = repository.create({
        ...(existing ?? {}),
        ...scopeColumns(scope),
        meetingId: meeting.id,
        itemKey: input.itemKey,
        statement: input.statement,
        evidenceQuote: input.evidenceQuote,
        confidence: input.confidence,
        reviewStatus: 'pending',
        sortOrder: input.sortOrder
      })
      const saved = await repository.save(decision)
      meeting.revision += 1
      await manager.save(meeting)
      const receipt = {
        meetingId: meeting.id,
        decisionId: saved.id,
        itemKey: saved.itemKey,
        status: meeting.status,
        revision: meeting.revision
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'upsert_decision', input, meeting.id, receipt)
      return receipt
    })
  }

  async upsertActionItem(scope: MeetingScope, input: UpsertActionInput) {
    return this.dataSource.transaction(async (manager) => {
      const existingOperation = await this.findOperation(manager, scope, input.operationId)
      if (existingOperation) return this.replayOperation(existingOperation, 'upsert_action_item', input)
      const meeting = await this.requireMeeting(manager, scope, input.meetingId, true)
      this.assertProcessing(meeting)
      this.assertRevision(meeting, input.baseRevision)
      const repository = manager.getRepository(MeetingActionItem)
      const existing = await this.scopedChildQuery(repository, 'action', scope)
        .andWhere('action.meetingId = :meetingId', { meetingId: meeting.id })
        .andWhere('action.itemKey = :itemKey', { itemKey: input.itemKey })
        .getOne()
      const action = repository.create({
        ...(existing ?? {}),
        ...scopeColumns(scope),
        meetingId: meeting.id,
        itemKey: input.itemKey,
        task: input.task,
        owner: input.owner?.trim() || null,
        dueDate: input.dueDate ?? null,
        priority: input.priority,
        status: 'pending_confirmation',
        evidenceQuote: input.evidenceQuote,
        confidence: input.confidence,
        reviewStatus: 'pending',
        sortOrder: input.sortOrder
      })
      const saved = await repository.save(action)
      meeting.revision += 1
      await manager.save(meeting)
      const receipt = {
        meetingId: meeting.id,
        actionItemId: saved.id,
        itemKey: saved.itemKey,
        status: meeting.status,
        revision: meeting.revision
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'upsert_action_item', input, meeting.id, receipt)
      return receipt
    })
  }

  async finalizeExtraction(scope: MeetingScope, input: { operationId: string; meetingId: string; baseRevision?: number }) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOperation(manager, scope, input.operationId)
      if (existing) return this.replayOperation(existing, 'finalize_extraction', input)
      const meeting = await this.requireMeeting(manager, scope, input.meetingId, true)
      this.assertProcessing(meeting)
      this.assertRevision(meeting, input.baseRevision)
      const [decisionCount, actionItemCount] = await Promise.all([
        this.scopedChildQuery(manager.getRepository(MeetingDecision), 'decision', scope)
          .andWhere('decision.meetingId = :meetingId', { meetingId: meeting.id }).getCount(),
        this.scopedChildQuery(manager.getRepository(MeetingActionItem), 'action', scope)
          .andWhere('action.meetingId = :meetingId', { meetingId: meeting.id }).getCount()
      ])
      if (decisionCount + actionItemCount === 0) {
        throw new MeetingDomainError('MEETING_EMPTY_EXTRACTION', 'At least one decision or action item is required.')
      }
      meeting.status = 'review_required'
      meeting.errorCode = null
      meeting.errorMessage = null
      meeting.revision += 1
      await manager.save(meeting)
      const receipt = {
        meetingId: meeting.id,
        status: meeting.status,
        revision: meeting.revision,
        decisionCount,
        actionItemCount,
        nextAction: 'human_review_required'
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'finalize_extraction', input, meeting.id, receipt)
      return receipt
    })
  }

  async reportFailure(scope: MeetingScope, input: {
    operationId: string
    meetingId: string
    failureCode: string
    summary: string
    baseRevision?: number
  }) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOperation(manager, scope, input.operationId)
      if (existing) return this.replayOperation(existing, 'report_failure', input)
      const meeting = await this.requireMeeting(manager, scope, input.meetingId, true)
      this.assertRevision(meeting, input.baseRevision)
      if (meeting.status === 'confirmed') {
        throw new MeetingDomainError('MEETING_ALREADY_CONFIRMED', 'A confirmed meeting cannot be marked as failed.')
      }
      meeting.status = 'failed'
      meeting.errorCode = input.failureCode
      meeting.errorMessage = input.summary
      meeting.revision += 1
      await manager.save(meeting)
      const receipt = {
        meetingId: meeting.id,
        status: meeting.status,
        revision: meeting.revision,
        failureCode: meeting.errorCode,
        retryable: true,
        nextAction: 'retry_with_meeting_id'
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'report_failure', input, meeting.id, receipt)
      return receipt
    })
  }

  async getWorkbench(scope: MeetingScope, query: WorkbenchQuery): Promise<MeetingWorkbenchDto> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20))
    const listQuery = this.scopedMeetingQuery(this.meetingRepository, 'meeting', scope)
      .orderBy('meeting.updatedAt', 'DESC')
      .addOrderBy('meeting.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    if (query.search?.trim()) {
      listQuery.andWhere('(meeting.title ILIKE :search OR meeting.sourceText ILIKE :search)', {
        search: `%${query.search.trim()}%`
      })
    }
    if (query.status) listQuery.andWhere('meeting.status = :status', { status: query.status })
    const [[meetings, total], statusRows] = await Promise.all([
      listQuery.getManyAndCount(),
      this.scopedMeetingQuery(this.meetingRepository, 'meeting', scope)
        .select('meeting.status', 'status')
        .addSelect('COUNT(meeting.id)', 'count')
        .groupBy('meeting.status')
        .getRawMany<{ status: MeetingStatus; count: string }>()
    ])
    const summaries = await Promise.all(meetings.map((meeting) => this.toSummary(scope, meeting)))
    const selectedId = query.meetingId ?? meetings[0]?.id
    const selectedMeeting = selectedId
      ? await this.getContext(scope, selectedId).catch((error: Error) => {
          if (error instanceof MeetingDomainError && error.code === 'MEETING_NOT_FOUND') return null
          throw error
        })
      : null
    const counts = new Map(statusRows.map((row) => [row.status, Number(row.count)]))
    const execution = await this.getExecutionContext(scope, {
      page: query.executionPage,
      pageSize: query.executionPageSize,
      status: query.executionStatus,
      owner: query.executionOwner,
      includeCompleted: true
    })
    return {
      summary: {
        total: [...counts.values()].reduce((sum, count) => sum + count, 0),
        processing: counts.get('processing') ?? 0,
        reviewRequired: counts.get('review_required') ?? 0,
        confirmed: counts.get('confirmed') ?? 0,
        failed: counts.get('failed') ?? 0
      },
      meetings: summaries,
      selectedMeeting,
      page,
      pageSize,
      total,
      execution
    }
  }

  async getExecutionContext(scope: MeetingScope, query: ExecutionContextQuery = {}): Promise<ExecutionContextDto> {
    const page = Math.max(1, query.page ?? 1)
    const pageSize = Math.min(50, Math.max(1, query.pageSize ?? 20))
    const baseQuery = () => this.scopedChildQuery(this.actionRepository, 'action', scope)
      .andWhere('action.status <> :pendingConfirmation', { pendingConfirmation: 'pending_confirmation' })
      .andWhere('action.reviewStatus <> :rejected', { rejected: 'rejected' })

    const actionQuery = baseQuery()
      .orderBy('action.dueDate', 'ASC', 'NULLS LAST')
      .addOrderBy('action.updatedAt', 'DESC')
      .addOrderBy('action.id', 'ASC')
      .skip((page - 1) * pageSize)
      .take(pageSize)
    if (query.status) actionQuery.andWhere('action.status = :executionStatus', { executionStatus: query.status })
    if (query.owner?.trim()) actionQuery.andWhere('action.owner ILIKE :executionOwner', { executionOwner: `%${query.owner.trim()}%` })
    if (!query.includeCompleted) actionQuery.andWhere('action.status NOT IN (:...closedStatuses)', { closedStatuses: ['completed', 'cancelled'] })

    const aggregateQuery = baseQuery()
      .select('COUNT(action.id)', 'total')
      .addSelect("COUNT(action.id) FILTER (WHERE action.status = 'pending')", 'pending')
      .addSelect("COUNT(action.id) FILTER (WHERE action.status = 'in_progress')", 'inProgress')
      .addSelect("COUNT(action.id) FILTER (WHERE action.status = 'completed')", 'completed')
      .addSelect("COUNT(action.id) FILTER (WHERE action.status = 'cancelled')", 'cancelled')
      .addSelect("COUNT(action.id) FILTER (WHERE action.dueDate < CURRENT_DATE AND action.status NOT IN ('completed', 'cancelled'))", 'overdue')
      .addSelect("COUNT(action.id) FILTER (WHERE action.dueDate >= CURRENT_DATE AND action.dueDate <= CURRENT_DATE + INTERVAL '3 days' AND action.status NOT IN ('completed', 'cancelled'))", 'dueSoon')
      .addSelect("COUNT(action.id) FILTER (WHERE action.owner IS NULL AND action.status NOT IN ('completed', 'cancelled'))", 'missingOwner')
      .addSelect("COUNT(action.id) FILTER (WHERE action.dueDate IS NULL AND action.status NOT IN ('completed', 'cancelled'))", 'missingDueDate')

    const [[actions, total], aggregate, decisions, latestReview] = await Promise.all([
      actionQuery.getManyAndCount(),
      aggregateQuery.getRawOne<Record<string, string>>(),
      this.scopedChildQuery(this.decisionRepository, 'decision', scope)
        .andWhere('decision.reviewStatus <> :rejectedDecision', { rejectedDecision: 'rejected' })
        .orderBy('decision.updatedAt', 'DESC')
        .addOrderBy('decision.id', 'ASC')
        .take(50)
        .getMany(),
      this.scopedChildQuery(this.executionReviewRepository, 'review', scope)
        .orderBy('review.updatedAt', 'DESC')
        .addOrderBy('review.id', 'ASC')
        .getOne()
    ])

    const meetingIds = [...new Set([...actions.map((item) => item.meetingId), ...decisions.map((item) => item.meetingId)])]
    const meetings = meetingIds.length
      ? await this.scopedMeetingQuery(this.meetingRepository, 'meeting', scope)
        .andWhere('meeting.id IN (:...executionMeetingIds)', { executionMeetingIds: meetingIds })
        .getMany()
      : []
    const meetingMap = new Map(meetings.map((meeting) => [meeting.id, meeting]))
    const actionDtos = actions.map((action) => {
      const meeting = meetingMap.get(action.meetingId)
      return {
        ...this.toActionDto(action),
        meetingId: action.meetingId,
        meetingTitle: meeting?.title ?? 'Unknown meeting',
        meetingRevision: meeting?.revision ?? 0,
        ruleFlags: ruleFlags(action)
      }
    })
    const ruleSignals = actionDtos.flatMap((action) => action.ruleFlags.map((flag) => ruleRiskSignal(action, flag)))
    const agentSignals = latestReview
      ? await this.scopedChildQuery(this.riskSignalRepository, 'risk', scope)
        .andWhere('risk.reviewId = :reviewId', { reviewId: latestReview.id })
        .orderBy('risk.severity', 'DESC')
        .addOrderBy('risk.createdAt', 'ASC')
        .take(100)
        .getMany()
      : []

    return {
      summary: {
        total: numberValue(aggregate?.total),
        pending: numberValue(aggregate?.pending),
        inProgress: numberValue(aggregate?.inProgress),
        completed: numberValue(aggregate?.completed),
        cancelled: numberValue(aggregate?.cancelled),
        overdue: numberValue(aggregate?.overdue),
        dueSoon: numberValue(aggregate?.dueSoon),
        missingOwner: numberValue(aggregate?.missingOwner),
        missingDueDate: numberValue(aggregate?.missingDueDate)
      },
      actions: actionDtos,
      decisions: decisions.map((decision) => ({
        id: decision.id,
        meetingId: decision.meetingId,
        meetingTitle: meetingMap.get(decision.meetingId)?.title ?? 'Unknown meeting',
        statement: decision.statement,
        evidenceQuote: decision.evidenceQuote,
        confidence: decision.confidence
      })),
      ruleSignals,
      agentSignals: agentSignals.map((risk) => this.toRiskSignalDto(risk)),
      latestReview: latestReview ? this.toExecutionReviewDto(latestReview) : null,
      page,
      pageSize,
      total,
      hasMore: page * pageSize < total
    }
  }

  async beginExecutionReview(scope: MeetingScope, input: { operationId: string; focus: string }) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOperation(manager, scope, input.operationId)
      if (existing) return this.replayOperation(existing, 'begin_execution_review', input)
      let review = manager.create(MeetingExecutionReview, {
        ...scopeColumns(scope),
        status: 'processing',
        revision: 1,
        focus: input.focus,
        summary: null,
        followUpBrief: null,
        riskCount: 0,
        errorCode: null,
        errorMessage: null,
        createdById: scope.userId ?? null,
        assistantId: scope.assistantId ?? null,
        conversationId: scope.conversationId ?? null,
        completedAt: null
      })
      review = await manager.save(review)
      const receipt = {
        reviewId: review.id,
        status: review.status,
        revision: review.revision,
        nextAction: 'inspect_execution_context_and_upsert_risks'
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'begin_execution_review', input, null, receipt)
      return receipt
    })
  }

  async upsertRiskSignal(scope: MeetingScope, input: UpsertRiskSignalInput) {
    return this.dataSource.transaction(async (manager) => {
      const existingOperation = await this.findOperation(manager, scope, input.operationId)
      if (existingOperation) return this.replayOperation(existingOperation, 'upsert_risk_signal', input)
      const review = await this.requireExecutionReview(manager, scope, input.reviewId, true)
      this.assertExecutionReviewProcessing(review)
      this.assertExecutionRevision(review, input.baseRevision)

      if (input.meetingId) await this.requireMeeting(manager, scope, input.meetingId)
      if (input.actionItemId) {
        if (!input.meetingId) throw new MeetingDomainError('RISK_MEETING_REQUIRED', 'meetingId is required when actionItemId is provided.')
        const action = await this.scopedChildQuery(manager.getRepository(MeetingActionItem), 'action', scope)
          .andWhere('action.id = :riskActionItemId', { riskActionItemId: input.actionItemId })
          .andWhere('action.meetingId = :riskMeetingId', { riskMeetingId: input.meetingId })
          .getOne()
        if (!action) throw new MeetingDomainError('RISK_ACTION_NOT_FOUND', 'The referenced action item was not found.')
      }

      const repository = manager.getRepository(MeetingRiskSignal)
      const existing = await this.scopedChildQuery(repository, 'risk', scope)
        .andWhere('risk.reviewId = :reviewId', { reviewId: review.id })
        .andWhere('risk.signalKey = :signalKey', { signalKey: input.signalKey })
        .getOne()
      const risk = repository.create({
        ...(existing ?? {}),
        ...scopeColumns(scope),
        reviewId: review.id,
        signalKey: input.signalKey,
        source: 'agent',
        riskType: input.riskType,
        severity: input.severity,
        title: input.title,
        rationale: input.rationale,
        evidenceQuote: input.evidenceQuote,
        recommendation: input.recommendation,
        meetingId: input.meetingId ?? null,
        actionItemId: input.actionItemId ?? null,
        confidence: input.confidence,
        reviewStatus: existing?.reviewStatus ?? 'open',
        reviewedById: existing?.reviewedById ?? null,
        reviewedAt: existing?.reviewedAt ?? null
      })
      const saved = await repository.save(risk)
      review.revision += 1
      await manager.save(review)
      const receipt = {
        reviewId: review.id,
        riskSignalId: saved.id,
        signalKey: saved.signalKey,
        status: review.status,
        revision: review.revision
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'upsert_risk_signal', input, input.meetingId ?? null, receipt)
      return receipt
    })
  }

  async finalizeExecutionReview(scope: MeetingScope, input: {
    operationId: string
    reviewId: string
    summary: string
    followUpBrief: string
    baseRevision?: number
  }) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOperation(manager, scope, input.operationId)
      if (existing) return this.replayOperation(existing, 'finalize_execution_review', input)
      const review = await this.requireExecutionReview(manager, scope, input.reviewId, true)
      this.assertExecutionReviewProcessing(review)
      this.assertExecutionRevision(review, input.baseRevision)
      const riskCount = await this.scopedChildQuery(manager.getRepository(MeetingRiskSignal), 'risk', scope)
        .andWhere('risk.reviewId = :reviewId', { reviewId: review.id })
        .getCount()
      review.status = 'ready'
      review.summary = input.summary
      review.followUpBrief = input.followUpBrief
      review.riskCount = riskCount
      review.errorCode = null
      review.errorMessage = null
      review.completedAt = new Date()
      review.revision += 1
      await manager.save(review)
      const receipt = {
        reviewId: review.id,
        status: review.status,
        revision: review.revision,
        riskCount,
        nextAction: 'human_inspection_available'
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'finalize_execution_review', input, null, receipt)
      return receipt
    })
  }

  async reportExecutionReviewFailure(scope: MeetingScope, input: {
    operationId: string
    reviewId: string
    failureCode: string
    summary: string
    baseRevision?: number
  }) {
    return this.dataSource.transaction(async (manager) => {
      const existing = await this.findOperation(manager, scope, input.operationId)
      if (existing) return this.replayOperation(existing, 'report_execution_review_failure', input)
      const review = await this.requireExecutionReview(manager, scope, input.reviewId, true)
      this.assertExecutionRevision(review, input.baseRevision)
      if (review.status === 'ready') throw new MeetingDomainError('EXECUTION_REVIEW_ALREADY_READY', 'A completed execution review cannot be marked as failed.')
      review.status = 'failed'
      review.errorCode = input.failureCode
      review.errorMessage = input.summary
      review.completedAt = new Date()
      review.revision += 1
      await manager.save(review)
      const receipt = {
        reviewId: review.id,
        status: review.status,
        revision: review.revision,
        failureCode: review.errorCode,
        retryable: true
      } satisfies JsonObject
      await this.saveOperation(manager, scope, input.operationId, 'report_execution_review_failure', input, null, receipt)
      return receipt
    })
  }

  async updateExecutionAction(scope: MeetingScope, meetingId: string, input: {
    actionItemId: string
    expectedRevision: number
    status: Exclude<ActionStatus, 'pending_confirmation'>
  }) {
    let revision = input.expectedRevision
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.requireMeeting(manager, scope, meetingId, true)
      if (meeting.status !== 'confirmed') throw new MeetingDomainError('MEETING_NOT_CONFIRMED', 'Only confirmed meeting actions can be tracked.')
      this.assertExpectedRevision(meeting, input.expectedRevision)
      const repository = manager.getRepository(MeetingActionItem)
      const action = await this.scopedChildQuery(repository, 'action', scope)
        .andWhere('action.meetingId = :meetingId', { meetingId })
        .andWhere('action.id = :actionItemId', { actionItemId: input.actionItemId })
        .getOne()
      if (!action || action.reviewStatus === 'rejected') throw new MeetingDomainError('ACTION_ITEM_NOT_FOUND', 'Action item was not found.')
      action.status = input.status
      await repository.save(action)
      meeting.revision += 1
      revision = meeting.revision
      await manager.save(meeting)
    })
    return { meetingId, actionItemId: input.actionItemId, status: input.status, revision }
  }

  async updateRiskSignalStatus(scope: MeetingScope, reviewId: string, input: {
    riskSignalId: string
    expectedRevision: number
    reviewStatus: Exclude<RiskReviewStatus, 'open'>
  }) {
    return this.dataSource.transaction(async (manager) => {
      const review = await this.requireExecutionReview(manager, scope, reviewId, true)
      if (review.status !== 'ready') throw new MeetingDomainError('EXECUTION_REVIEW_NOT_READY', 'Risk signals can be reviewed only after the Agent review is ready.')
      this.assertExecutionExpectedRevision(review, input.expectedRevision)
      const repository = manager.getRepository(MeetingRiskSignal)
      const risk = await this.scopedChildQuery(repository, 'risk', scope)
        .andWhere('risk.reviewId = :reviewId', { reviewId })
        .andWhere('risk.id = :riskSignalId', { riskSignalId: input.riskSignalId })
        .getOne()
      if (!risk) throw new MeetingDomainError('RISK_SIGNAL_NOT_FOUND', 'Risk signal was not found.')
      risk.reviewStatus = input.reviewStatus
      risk.reviewedById = scope.userId ?? null
      risk.reviewedAt = new Date()
      await repository.save(risk)
      review.revision += 1
      await manager.save(review)
      return { reviewId, riskSignalId: risk.id, reviewStatus: risk.reviewStatus, revision: review.revision }
    })
  }

  async updateDecision(scope: MeetingScope, meetingId: string, input: UpdateDecisionInput): Promise<MeetingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.requireMeeting(manager, scope, meetingId, true)
      this.assertReviewable(meeting)
      this.assertExpectedRevision(meeting, input.expectedRevision)
      const repository = manager.getRepository(MeetingDecision)
      const decision = await this.scopedChildQuery(repository, 'decision', scope)
        .andWhere('decision.meetingId = :meetingId', { meetingId })
        .andWhere('decision.id = :decisionId', { decisionId: input.decisionId })
        .getOne()
      if (!decision) throw new MeetingDomainError('DECISION_NOT_FOUND', 'Decision was not found.')
      decision.statement = input.statement
      decision.reviewStatus = input.reviewStatus
      await repository.save(decision)
      meeting.revision += 1
      await manager.save(meeting)
    })
    return this.getContext(scope, meetingId)
  }

  async updateActionItem(scope: MeetingScope, meetingId: string, input: UpdateActionInput): Promise<MeetingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.requireMeeting(manager, scope, meetingId, true)
      this.assertReviewable(meeting)
      this.assertExpectedRevision(meeting, input.expectedRevision)
      const repository = manager.getRepository(MeetingActionItem)
      const action = await this.scopedChildQuery(repository, 'action', scope)
        .andWhere('action.meetingId = :meetingId', { meetingId })
        .andWhere('action.id = :actionItemId', { actionItemId: input.actionItemId })
        .getOne()
      if (!action) throw new MeetingDomainError('ACTION_ITEM_NOT_FOUND', 'Action item was not found.')
      action.task = input.task
      action.owner = input.owner?.trim() || null
      action.dueDate = input.dueDate || null
      action.priority = input.priority
      action.status = input.status
      action.reviewStatus = input.reviewStatus
      await repository.save(action)
      meeting.revision += 1
      await manager.save(meeting)
    })
    return this.getContext(scope, meetingId)
  }

  async confirmMeeting(scope: MeetingScope, meetingId: string, expectedRevision: number): Promise<MeetingDetailDto> {
    await this.dataSource.transaction(async (manager) => {
      const meeting = await this.requireMeeting(manager, scope, meetingId, true)
      this.assertReviewable(meeting)
      this.assertExpectedRevision(meeting, expectedRevision)
      // The meeting was locked and scope-checked above. Update its children with
      // repository criteria so TypeORM does not carry SELECT aliases into an
      // UPDATE statement (PostgreSQL rejects alias-qualified UPDATE predicates).
      await manager.getRepository(MeetingDecision).update(
        { meetingId, reviewStatus: 'pending' },
        { reviewStatus: 'confirmed' }
      )
      await manager.getRepository(MeetingActionItem).update(
        { meetingId, reviewStatus: 'pending' },
        { reviewStatus: 'confirmed', status: 'pending' }
      )
      meeting.status = 'confirmed'
      meeting.reviewedById = scope.userId ?? null
      meeting.reviewedAt = new Date()
      meeting.revision += 1
      await manager.save(meeting)
    })
    return this.getContext(scope, meetingId)
  }

  private async toSummary(scope: MeetingScope, meeting: MeetingRecord): Promise<MeetingSummaryDto> {
    const [decisionCount, actionItemCount] = await Promise.all([
      this.scopedChildQuery(this.decisionRepository, 'decision', scope)
        .andWhere('decision.meetingId = :meetingId', { meetingId: meeting.id }).getCount(),
      this.scopedChildQuery(this.actionRepository, 'action', scope)
        .andWhere('action.meetingId = :meetingId', { meetingId: meeting.id }).getCount()
    ])
    return {
      id: meeting.id,
      title: meeting.title,
      status: meeting.status,
      revision: meeting.revision,
      extractionAttempt: meeting.extractionAttempt,
      decisionCount,
      actionItemCount,
      errorCode: meeting.errorCode,
      updatedAt: meeting.updatedAt.toISOString(),
      createdAt: meeting.createdAt.toISOString()
    }
  }

  private async toDetail(scope: MeetingScope, meeting: MeetingRecord): Promise<MeetingDetailDto> {
    const [summary, decisions, actions] = await Promise.all([
      this.toSummary(scope, meeting),
      this.scopedChildQuery(this.decisionRepository, 'decision', scope)
        .andWhere('decision.meetingId = :meetingId', { meetingId: meeting.id })
        .orderBy('decision.sortOrder', 'ASC').addOrderBy('decision.id', 'ASC').getMany(),
      this.scopedChildQuery(this.actionRepository, 'action', scope)
        .andWhere('action.meetingId = :meetingId', { meetingId: meeting.id })
        .orderBy('action.sortOrder', 'ASC').addOrderBy('action.id', 'ASC').getMany()
    ])
    return {
      ...summary,
      sourceText: meeting.sourceText,
      errorMessage: meeting.errorMessage,
      reviewedAt: meeting.reviewedAt?.toISOString() ?? null,
      decisions: decisions.map((decision) => ({
        id: decision.id,
        itemKey: decision.itemKey,
        statement: decision.statement,
        evidenceQuote: decision.evidenceQuote,
        confidence: decision.confidence,
        reviewStatus: decision.reviewStatus,
        sortOrder: decision.sortOrder
      })),
      actionItems: actions.map((action) => this.toActionDto(action))
    }
  }

  private toActionDto(action: MeetingActionItem) {
    return {
      id: action.id,
      itemKey: action.itemKey,
      task: action.task,
      owner: action.owner,
      dueDate: action.dueDate,
      priority: action.priority,
      status: action.status,
      evidenceQuote: action.evidenceQuote,
      confidence: action.confidence,
      reviewStatus: action.reviewStatus,
      sortOrder: action.sortOrder
    }
  }

  private toExecutionReviewDto(review: MeetingExecutionReview): ExecutionReviewDto {
    return {
      id: review.id,
      status: review.status,
      revision: review.revision,
      focus: review.focus,
      summary: review.summary,
      followUpBrief: review.followUpBrief,
      riskCount: review.riskCount,
      errorCode: review.errorCode,
      errorMessage: review.errorMessage,
      createdAt: review.createdAt.toISOString(),
      updatedAt: review.updatedAt.toISOString(),
      completedAt: review.completedAt?.toISOString() ?? null
    }
  }

  private toRiskSignalDto(risk: MeetingRiskSignal): RiskSignalDto {
    return {
      id: risk.id,
      reviewId: risk.reviewId,
      signalKey: risk.signalKey,
      source: risk.source,
      riskType: risk.riskType,
      severity: risk.severity,
      title: risk.title,
      rationale: risk.rationale,
      evidenceQuote: risk.evidenceQuote,
      recommendation: risk.recommendation,
      meetingId: risk.meetingId,
      actionItemId: risk.actionItemId,
      confidence: risk.confidence,
      reviewStatus: risk.reviewStatus,
      createdAt: risk.createdAt.toISOString()
    }
  }

  private async requireMeeting(manager: EntityManager, scope: MeetingScope, meetingId: string, lock = false) {
    const query = this.scopedMeetingQuery(manager.getRepository(MeetingRecord), 'meeting', scope)
      .andWhere('meeting.id = :meetingId', { meetingId })
    if (lock) query.setLock('pessimistic_write')
    const meeting = await query.getOne()
    if (!meeting) throw new MeetingDomainError('MEETING_NOT_FOUND', 'Meeting record was not found.')
    return meeting
  }

  private async requireExecutionReview(manager: EntityManager, scope: MeetingScope, reviewId: string, lock = false) {
    const query = this.scopedChildQuery(manager.getRepository(MeetingExecutionReview), 'review', scope)
      .andWhere('review.id = :executionReviewId', { executionReviewId: reviewId })
    if (lock) query.setLock('pessimistic_write')
    const review = await query.getOne()
    if (!review) throw new MeetingDomainError('EXECUTION_REVIEW_NOT_FOUND', 'Execution review was not found.')
    return review
  }

  private scopedMeetingQuery(repository: Repository<MeetingRecord>, alias: string, scope: MeetingScope) {
    return applyScope(repository.createQueryBuilder(alias), alias, scope)
  }

  private scopedChildQuery<T extends ObjectLiteral & { tenantId: string | null; organizationId: string | null }>(
    repository: Repository<T>,
    alias: string,
    scope: MeetingScope
  ) {
    return applyScope(repository.createQueryBuilder(alias), alias, scope)
  }

  private assertProcessing(meeting: MeetingRecord) {
    if (meeting.status !== 'processing') {
      throw new MeetingDomainError('MEETING_NOT_PROCESSING', 'The meeting is not accepting AI extraction items.')
    }
  }

  private assertReviewable(meeting: MeetingRecord) {
    if (meeting.status !== 'review_required') {
      throw new MeetingDomainError('MEETING_NOT_REVIEWABLE', 'The meeting is not waiting for human review.')
    }
  }

  private assertExecutionReviewProcessing(review: MeetingExecutionReview) {
    if (review.status !== 'processing') {
      throw new MeetingDomainError('EXECUTION_REVIEW_NOT_PROCESSING', 'The execution review is not accepting Agent findings.')
    }
  }

  private assertRevision(meeting: MeetingRecord, baseRevision?: number) {
    if (baseRevision != null && meeting.revision !== baseRevision) {
      throw new MeetingDomainError('MEETING_REVISION_CONFLICT', `Expected revision ${baseRevision}, current revision is ${meeting.revision}.`)
    }
  }

  private assertExpectedRevision(meeting: MeetingRecord, expectedRevision: number) {
    if (meeting.revision !== expectedRevision) {
      throw new MeetingDomainError('MEETING_REVISION_CONFLICT', `Expected revision ${expectedRevision}, current revision is ${meeting.revision}.`)
    }
  }

  private assertExecutionRevision(review: MeetingExecutionReview, baseRevision?: number) {
    if (baseRevision != null && review.revision !== baseRevision) {
      throw new MeetingDomainError('EXECUTION_REVIEW_REVISION_CONFLICT', `Expected revision ${baseRevision}, current revision is ${review.revision}.`)
    }
  }

  private assertExecutionExpectedRevision(review: MeetingExecutionReview, expectedRevision: number) {
    if (review.revision !== expectedRevision) {
      throw new MeetingDomainError('EXECUTION_REVIEW_REVISION_CONFLICT', `Expected revision ${expectedRevision}, current revision is ${review.revision}.`)
    }
  }

  private async findOperation(manager: EntityManager, scope: MeetingScope, operationId: string) {
    return manager.getRepository(MeetingOperation).findOneBy({ scopeKey: scopeKey(scope), operationId })
  }

  private replayOperation(operation: MeetingOperation, expectedType: string, input: object) {
    if (operation.operationType !== expectedType || operation.requestHash !== requestHash(input)) {
      throw new MeetingDomainError('OPERATION_ID_REUSED', 'The operationId was already used with different input.')
    }
    return operation.receipt
  }

  private async saveOperation(
    manager: EntityManager,
    scope: MeetingScope,
    operationId: string,
    operationType: string,
    input: object,
    meetingId: string | null,
    receipt: JsonObject
  ) {
    await manager.getRepository(MeetingOperation).save(
      manager.create(MeetingOperation, {
        scopeKey: scopeKey(scope),
        operationId,
        operationType,
        requestHash: requestHash(input),
        meetingId,
        receipt
      })
    )
  }
}

function scopeColumns(scope: MeetingScope) {
  return { tenantId: scope.tenantId ?? null, organizationId: scope.organizationId ?? null }
}

function scopeKey(scope: MeetingScope) {
  return `${scope.tenantId ?? '_'}:${scope.organizationId ?? '_'}`
}

function requestHash(value: object) {
  return createHash('sha256').update(JSON.stringify(value)).digest('hex')
}

function applyScope<T extends ObjectLiteral>(query: SelectQueryBuilder<T>, alias: string, scope: MeetingScope) {
  if (scope.tenantId) query.where(`${alias}.tenantId = :tenantId`, { tenantId: scope.tenantId })
  else query.where(`${alias}.tenantId IS NULL`)
  if (scope.organizationId) query.andWhere(`${alias}.organizationId = :organizationId`, { organizationId: scope.organizationId })
  else query.andWhere(`${alias}.organizationId IS NULL`)
  return query
}

function numberValue(value?: string | number | null) {
  const result = Number(value ?? 0)
  return Number.isFinite(result) ? result : 0
}

type RuleFlag = ExecutionActionDto['ruleFlags'][number]

function ruleFlags(action: MeetingActionItem): RuleFlag[] {
  if (action.status === 'completed' || action.status === 'cancelled') return []
  const flags: RuleFlag[] = []
  const today = new Date().toISOString().slice(0, 10)
  const dueSoon = new Date()
  dueSoon.setUTCDate(dueSoon.getUTCDate() + 3)
  const dueSoonDate = dueSoon.toISOString().slice(0, 10)
  if (!action.owner) flags.push('missing_owner')
  if (!action.dueDate) flags.push('missing_due_date')
  else if (action.dueDate < today) flags.push('overdue')
  else if (action.dueDate <= dueSoonDate) flags.push('due_soon')
  return flags
}

function ruleRiskSignal(action: ExecutionActionDto, flag: RuleFlag): RiskSignalDto {
  const severity: RiskSeverity = flag === 'overdue' ? 'high' : flag === 'due_soon' ? 'medium' : 'medium'
  const detail = flag === 'overdue' || flag === 'due_soon' ? `dueDate:${action.dueDate ?? 'null'}` : `field:${flag === 'missing_owner' ? 'owner' : 'dueDate'}`
  return {
    id: `rule:${flag}:${action.id}`,
    reviewId: null,
    signalKey: `${flag}-${action.itemKey}`,
    source: 'rule',
    riskType: flag,
    severity,
    title: flag,
    rationale: detail,
    evidenceQuote: action.task,
    recommendation: flag === 'missing_owner' ? 'assign_owner' : flag === 'missing_due_date' ? 'assign_due_date' : flag === 'overdue' ? 'review_overdue_action' : 'confirm_due_date',
    meetingId: action.meetingId,
    actionItemId: action.id,
    confidence: 1,
    reviewStatus: 'open',
    createdAt: new Date().toISOString()
  }
}
