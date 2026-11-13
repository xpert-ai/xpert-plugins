import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException
} from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { randomUUID } from 'node:crypto'
import { ILike, type FindOptionsWhere, type Repository } from 'typeorm'
import {
  complaintTriageResultSchema,
  createComplaintCaseSchema,
  listComplaintCasesSchema,
  type ComplaintTriageResultInput,
  type CreateComplaintCaseInput,
  type ListComplaintCasesInput
} from './domain/complaint.schemas.js'
import type {
  ComplaintCaseListResult,
  ComplaintScope,
  ComplaintStatus
} from './domain/complaint.types.js'
import { ComplaintCaseEntity } from './entities/complaint-case.entity.js'
import { safeComplaintErrorMessage } from './domain/complaint-errors.js'

export interface ComplaintTaskReference {
  taskId?: string
  executionId?: string
  conversationId?: string
  threadId?: string
}

@Injectable()
export class ComplaintCaseService {
  constructor(
    @InjectRepository(ComplaintCaseEntity)
    private readonly cases: Repository<ComplaintCaseEntity>
  ) {}

  async createCase(scope: ComplaintScope, input: CreateComplaintCaseInput) {
    validateScope(scope, true)
    const value = createComplaintCaseSchema.parse(input)
    return this.cases.save(
      this.cases.create({
        id: randomUUID(),
        tenantId: scope.tenantId,
        organizationId: scope.organizationId,
        scopeKey: complaintScopeKey(scope),
        createdById: scope.userId!,
        customerName: value.customerName,
        customerReference: value.customerReference ?? null,
        complaintContent: value.complaintContent,
        status: 'DRAFT',
        aiOriginalResult: null,
        humanDraftResult: null,
        humanConfirmedResult: null,
        attemptId: null,
        attemptCount: 0,
        assistantTaskId: null,
        executionId: null,
        conversationId: null,
        threadId: null,
        errorCode: null,
        errorMessage: null,
        confirmedAt: null
      })
    )
  }

  async listCases(
    scope: ComplaintScope,
    input: Partial<ListComplaintCasesInput> = {}
  ): Promise<ComplaintCaseListResult<ComplaintCaseEntity>> {
    validateScope(scope)
    const query = listComplaintCasesSchema.parse(input)
    const scopeKey = complaintScopeKey(scope)
    const where: FindOptionsWhere<ComplaintCaseEntity> | FindOptionsWhere<ComplaintCaseEntity>[] =
      query.search
        ? [
            { scopeKey, customerName: ILike(`%${query.search}%`) },
            { scopeKey, customerReference: ILike(`%${query.search}%`) },
            { scopeKey, complaintContent: ILike(`%${query.search}%`) }
          ]
        : { scopeKey }
    const [items, total] = await this.cases.findAndCount({
      where,
      order: { updatedAt: 'DESC', id: 'ASC' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize
    })
    return { items, total, page: query.page, pageSize: query.pageSize }
  }

  async getCase(scope: ComplaintScope, caseId: string) {
    validateScope(scope)
    const entity = await this.cases.findOne({
      where: { id: caseId, scopeKey: complaintScopeKey(scope) }
    })
    if (!entity) throw new NotFoundException('Complaint case was not found in the current scope.')
    return entity
  }

  beginAnalysis(scope: ComplaintScope, caseId: string) {
    return this.beginAttempt(scope, caseId, 'DRAFT')
  }

  retryAnalysis(scope: ComplaintScope, caseId: string) {
    return this.beginAttempt(scope, caseId, 'FAILED')
  }

  async recordTaskReference(
    scope: ComplaintScope,
    caseId: string,
    attemptId: string,
    reference: ComplaintTaskReference
  ) {
    const result = await this.cases.update(
      attemptWhere(scope, caseId, attemptId),
      {
        assistantTaskId: reference.taskId ?? null,
        executionId: reference.executionId ?? null,
        conversationId: reference.conversationId ?? null,
        threadId: reference.threadId ?? null
      }
    )
    ensureUpdated(result.affected, 'The analysis attempt is no longer current.')
    return this.getCase(scope, caseId)
  }

  async completeAnalysis(
    scope: ComplaintScope,
    caseId: string,
    attemptId: string,
    result: ComplaintTriageResultInput
  ) {
    const validated = complaintTriageResultSchema.parse(result)
    const update = await this.cases.update(
      processingAttemptWhere(scope, caseId, attemptId),
      {
        status: 'PENDING_REVIEW',
        aiOriginalResult: validated,
        humanDraftResult: validated,
        errorCode: null,
        errorMessage: null
      }
    )
    ensureUpdated(update.affected, 'The analysis result belongs to a stale or inactive attempt.')
    return this.getCase(scope, caseId)
  }

  async failAnalysis(
    scope: ComplaintScope,
    caseId: string,
    attemptId: string,
    errorCode: string,
    errorMessage: string
  ) {
    const update = await this.cases.update(
      processingAttemptWhere(scope, caseId, attemptId),
      {
        status: 'FAILED',
        errorCode: safeErrorCode(errorCode),
        errorMessage: safeComplaintErrorMessage(errorMessage)
      }
    )
    ensureUpdated(update.affected, 'The failed analysis attempt is no longer current.')
    return this.getCase(scope, caseId)
  }

  async saveReview(
    scope: ComplaintScope,
    caseId: string,
    result: ComplaintTriageResultInput
  ) {
    const validated = complaintTriageResultSchema.parse(result)
    const update = await this.cases.update(
      stateWhere(scope, caseId, 'PENDING_REVIEW'),
      { humanDraftResult: validated }
    )
    ensureUpdated(update.affected, 'Only a complaint pending review can be edited.')
    return this.getCase(scope, caseId)
  }

  async confirmCase(
    scope: ComplaintScope,
    caseId: string,
    result: ComplaintTriageResultInput
  ) {
    const validated = complaintTriageResultSchema.parse(result)
    const update = await this.cases.update(
      stateWhere(scope, caseId, 'PENDING_REVIEW'),
      {
        status: 'CONFIRMED',
        humanDraftResult: validated,
        humanConfirmedResult: validated,
        confirmedAt: new Date(),
        errorCode: null,
        errorMessage: null
      }
    )
    ensureUpdated(update.affected, 'Only a complaint pending review can be confirmed.')
    return this.getCase(scope, caseId)
  }

  private async beginAttempt(
    scope: ComplaintScope,
    caseId: string,
    expectedStatus: Extract<ComplaintStatus, 'DRAFT' | 'FAILED'>
  ) {
    const entity = await this.getCase(scope, caseId)
    if (entity.status !== expectedStatus) {
      throw new ConflictException(
        expectedStatus === 'DRAFT'
          ? 'Only a draft complaint can start analysis.'
          : 'Only a failed complaint can be retried.'
      )
    }
    const attemptId = randomUUID()
    const update = await this.cases.update(
      stateWhere(scope, caseId, expectedStatus),
      {
        status: 'PROCESSING',
        attemptId,
        attemptCount: entity.attemptCount + 1,
        assistantTaskId: null,
        executionId: null,
        conversationId: null,
        threadId: null,
        errorCode: null,
        errorMessage: null
      }
    )
    ensureUpdated(update.affected, 'Complaint state changed before analysis could start.')
    return this.getCase(scope, caseId)
  }
}

export function complaintScopeKey(scope: ComplaintScope) {
  validateScope(scope)
  return scope.organizationId
    ? `tenant:${scope.tenantId}:organization:${scope.organizationId}`
    : `tenant:${scope.tenantId}`
}

function validateScope(scope: ComplaintScope, requireUser = false) {
  if (!scope.tenantId?.trim()) throw new BadRequestException('Tenant scope is required.')
  if (requireUser && !scope.userId?.trim()) {
    throw new BadRequestException('An authenticated user is required to create a complaint.')
  }
}

function stateWhere(scope: ComplaintScope, caseId: string, status: ComplaintStatus) {
  return { id: caseId, scopeKey: complaintScopeKey(scope), status }
}

function processingAttemptWhere(scope: ComplaintScope, caseId: string, attemptId: string) {
  return {
    ...attemptWhere(scope, caseId, attemptId),
    status: 'PROCESSING' as const
  }
}

function attemptWhere(scope: ComplaintScope, caseId: string, attemptId: string) {
  return {
    id: caseId,
    scopeKey: complaintScopeKey(scope),
    attemptId
  }
}

function ensureUpdated(affected: number | null | undefined, message: string) {
  if (affected !== 1) throw new ConflictException(message)
}

function safeErrorCode(value: string) {
  const normalized = value.trim().replace(/[^a-zA-Z0-9_.-]/g, '_').slice(0, 100)
  return normalized || 'complaint_analysis_failed'
}
