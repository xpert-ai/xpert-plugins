import { Injectable } from '@nestjs/common'
import { InjectDataSource } from '@nestjs/typeorm'
import { createHash, randomUUID } from 'node:crypto'
import { DataSource, EntityManager, IsNull } from 'typeorm'
import {
  aiDraftSchema,
  editableDraftSchema,
  type AiDraft,
  type EditableDraft
} from '../domain/contracts.js'
import {
  checkDraftIdentity,
  confirmationProblems,
  makeEditable,
  ReviewError,
  validateEvidence
} from '../domain/policy.js'
import { segmentSource, validateTitle } from '../domain/source.js'
import { AnalysisAttempt } from '../entities/analysis-attempt.entity.js'
import { Review } from '../entities/review.entity.js'

export type ReviewScope = {
  tenantId: string | null
  organizationId: string | null
  userId: string
}
export const PROMPT_VERSION = 'reqtrace-1'
export const ANALYSIS_TIMEOUT_MS = 90_000
export type ReviewReceipt = {
  reviewId: string
  version: number
  status: Review['status']
  code?: string
  attemptId?: string
}
export type ReviewDetail = { review: Review; attempt: AnalysisAttempt | null }

function scoped(scope: ReviewScope): {
  tenantId: string
  organizationId: string
  ownerId: string
} {
  if (!scope.tenantId || !scope.organizationId || !scope.userId)
    throw new ReviewError('organization_required')
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    ownerId: scope.userId
  }
}

function receipt(review: Review, attempt?: AnalysisAttempt): ReviewReceipt {
  return {
    reviewId: review.id,
    version: review.version,
    status: review.status,
    ...(attempt
      ? {
          attemptId: attempt.id,
          ...(attempt.errorCode ? { code: attempt.errorCode } : {})
        }
      : {})
  }
}

@Injectable()
export class ReviewService {
  constructor(@InjectDataSource() private readonly db: DataSource) {}

  async create(
    scope: ReviewScope,
    input: { title: string; sourceText: string }
  ): Promise<ReviewReceipt> {
    scoped(scope)
    const now = new Date().toISOString()
    const review = this.db.getRepository(Review).create({
      id: randomUUID(),
      tenantId: scope.tenantId,
      organizationId: scope.organizationId,
      ownerId: scope.userId,
      title: validateTitle(input.title),
      sourceText: input.sourceText,
      sourceSegments: segmentSource(input.sourceText),
      sourceHash: createHash('sha256').update(input.sourceText).digest('hex'),
      status: 'READY',
      version: 1,
      inputVersion: 1,
      aiDraft: null,
      editableDraft: null,
      confirmedSnapshot: null,
      confirmedAt: null,
      createdAt: now,
      updatedAt: now
    })
    await this.db.getRepository(Review).save(review)
    return receipt(review)
  }

  async list(scope: ReviewScope, page = 1, search = '') {
    const query = this.db
      .getRepository(Review)
      .createQueryBuilder('review')
      .where(
        'review.tenantId = :tenantId AND review.organizationId = :organizationId AND review.ownerId = :ownerId',
        {
          tenantId: scope.tenantId,
          organizationId: scope.organizationId,
          ownerId: scope.userId
        }
      )
    scoped(scope)
    if (search.trim())
      query.andWhere('review.title ILIKE :search', {
        search: `%${search.slice(0, 80)}%`
      })
    const [records, total] = await query
      .orderBy('review.updatedAt', 'DESC')
      .addOrderBy('review.id', 'ASC')
      .skip((Math.max(1, Math.floor(page)) - 1) * 20)
      .take(20)
      .getManyAndCount()
    const items = await Promise.all(
      records.map(async (record) => {
        const { review } = await this.get(scope, record.id)
        return {
          id: review.id,
          title: review.title,
          status: review.status,
          version: review.version,
          updatedAt: review.updatedAt,
          requirementCount: review.editableDraft?.requirements.length ?? 0
        }
      })
    )
    return { items, total, page, pageSize: 20 }
  }

  async get(scope: ReviewScope, id: string): Promise<ReviewDetail> {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, id)
      await this.recoverExpired(manager, review)
      const attempt = await manager.getRepository(AnalysisAttempt).findOne({
        where: { ...scoped(scope), reviewId: id },
        order: { startedAt: 'DESC', id: 'DESC' }
      })
      return { review, attempt }
    })
  }

  async reviseSource(
    scope: ReviewScope,
    input: {
      reviewId: string
      version: number
      title: string
      sourceText: string
    }
  ) {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, input.reviewId)
      await this.recoverExpired(manager, review)
      this.checkVersion(review, input.version)
      if (!['READY', 'FAILED', 'EMPTY'].includes(review.status))
        throw new ReviewError('invalid_state')
      review.title = validateTitle(input.title)
      review.sourceSegments = segmentSource(input.sourceText)
      review.sourceText = input.sourceText
      review.sourceHash = createHash('sha256')
        .update(input.sourceText)
        .digest('hex')
      review.inputVersion++
      review.aiDraft = null
      review.editableDraft = null
      review.status = 'READY'
      await this.save(manager, review)
      return receipt(review)
    })
  }

  async start(
    scope: ReviewScope,
    input: { reviewId: string; version: number; requestKey: string }
  ) {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, input.reviewId)
      await this.recoverExpired(manager, review)
      const repository = manager.getRepository(AnalysisAttempt)
      const previous = await repository.findOneBy({
        ...scoped(scope),
        reviewId: review.id,
        requestKey: input.requestKey
      })
      if (previous) return { ...receipt(review, previous), dispatch: false }
      if (review.status === 'ANALYZING') {
        const active = await repository.findOneBy({
          ...scoped(scope),
          reviewId: review.id,
          status: 'RUNNING'
        })
        if (!active) throw new ReviewError('attempt_not_active')
        return { ...receipt(review, active), dispatch: false }
      }
      this.checkVersion(review, input.version)
      if (!['READY', 'FAILED', 'EMPTY'].includes(review.status))
        throw new ReviewError('invalid_state')
      const now = new Date()
      const attempt = repository.create({
        id: randomUUID(),
        tenantId: review.tenantId,
        organizationId: review.organizationId,
        ownerId: review.ownerId,
        reviewId: review.id,
        requestKey: input.requestKey,
        inputVersion: review.inputVersion,
        status: 'RUNNING',
        startedAt: now.toISOString(),
        deadlineAt: new Date(now.getTime() + ANALYSIS_TIMEOUT_MS).toISOString(),
        completedAt: null,
        model: null,
        promptVersion: PROMPT_VERSION,
        errorCode: null,
        usage: null
      })
      await repository.save(attempt)
      review.status = 'ANALYZING'
      await this.save(manager, review)
      return { ...receipt(review, attempt), dispatch: true }
    })
  }

  async readSource(
    scope: ReviewScope,
    input: { reviewId: string; attemptId: string }
  ) {
    const { review, attempt } = await this.get(scope, input.reviewId)
    if (
      !attempt ||
      attempt.id !== input.attemptId ||
      attempt.status !== 'RUNNING' ||
      review.status !== 'ANALYZING'
    )
      throw new ReviewError('attempt_not_active')
    return {
      reviewId: review.id,
      attemptId: attempt.id,
      inputVersion: attempt.inputVersion,
      title: review.title,
      segments: review.sourceSegments,
      deadlineAt: attempt.deadlineAt
    }
  }

  async submit(
    scope: ReviewScope,
    input: {
      reviewId: string
      attemptId: string
      inputVersion: number
      draft: AiDraft
    }
  ) {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, input.reviewId)
      await this.recoverExpired(manager, review)
      const attempt = await manager
        .getRepository(AnalysisAttempt)
        .findOneBy({
          ...scoped(scope),
          reviewId: review.id,
          id: input.attemptId
        })
      if (!attempt) throw new ReviewError('not_found')
      if (attempt.status === 'SUCCEEDED')
        return { ...receipt(review, attempt), applied: false }
      if (
        attempt.status !== 'RUNNING' ||
        review.status !== 'ANALYZING' ||
        input.inputVersion !== review.inputVersion ||
        attempt.inputVersion !== review.inputVersion
      )
        return {
          ...receipt(review, attempt),
          applied: false,
          code: 'attempt_not_active'
        }
      const parsed = aiDraftSchema.safeParse(input.draft)
      if (
        !parsed.success ||
        !validateEvidence(parsed.data, review.sourceSegments)
      ) {
        await this.finishFailure(
          manager,
          review,
          attempt,
          parsed.success ? 'invalid_evidence' : 'invalid_output'
        )
        return { ...receipt(review, attempt), applied: false }
      }
      review.aiDraft = parsed.data
      review.editableDraft = makeEditable(parsed.data)
      review.status = parsed.data.requirements.length ? 'REVIEWING' : 'EMPTY'
      attempt.status = 'SUCCEEDED'
      attempt.completedAt = new Date().toISOString()
      await manager.save(attempt)
      await this.save(manager, review)
      return {
        ...receipt(review, attempt),
        applied: true,
        requirementCount: parsed.data.requirements.length
      }
    })
  }

  async fail(
    scope: ReviewScope,
    input: {
      reviewId: string
      attemptId: string
      code: 'model_failed' | 'dispatch_failed' | 'invalid_output'
    }
  ) {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, input.reviewId)
      await this.recoverExpired(manager, review)
      const attempt = await manager
        .getRepository(AnalysisAttempt)
        .findOneBy({
          ...scoped(scope),
          reviewId: review.id,
          id: input.attemptId
        })
      if (!attempt) throw new ReviewError('not_found')
      if (attempt.status === 'RUNNING' && review.status === 'ANALYZING')
        await this.finishFailure(manager, review, attempt, input.code)
      return receipt(review, attempt)
    })
  }

  async saveDraft(
    scope: ReviewScope,
    input: { reviewId: string; version: number; draft: EditableDraft }
  ) {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, input.reviewId)
      this.checkVersion(review, input.version)
      if (review.status !== 'REVIEWING' || !review.editableDraft)
        throw new ReviewError('invalid_state')
      const parsed = editableDraftSchema.safeParse(input.draft)
      if (!parsed.success) throw new ReviewError('invalid_input')
      checkDraftIdentity(review.editableDraft, parsed.data)
      if (!validateEvidence(parsed.data, review.sourceSegments))
        throw new ReviewError('invalid_evidence')
      review.editableDraft = parsed.data
      await this.save(manager, review)
      return receipt(review)
    })
  }

  async confirm(
    scope: ReviewScope,
    input: { reviewId: string; version: number }
  ) {
    return this.db.transaction(async (manager) => {
      const review = await this.lock(manager, scope, input.reviewId)
      if (review.status === 'CONFIRMED')
        return { ...receipt(review), snapshot: review.confirmedSnapshot }
      this.checkVersion(review, input.version)
      if (review.status !== 'REVIEWING' || !review.editableDraft)
        throw new ReviewError('invalid_state')
      if (confirmationProblems(review.editableDraft).length)
        throw new ReviewError('confirmation_blocked')
      review.confirmedAt = new Date().toISOString()
      review.confirmedSnapshot = {
        draft: {
          requirements: structuredClone(
            review.editableDraft.requirements.filter((item) => item.included)
          )
        },
        confirmedBy: scope.userId,
        confirmedAt: review.confirmedAt,
        sourceVersion: review.inputVersion
      }
      review.status = 'CONFIRMED'
      await this.save(manager, review)
      return { ...receipt(review), snapshot: review.confirmedSnapshot }
    })
  }

  private async lock(
    manager: EntityManager,
    scope: ReviewScope,
    id: string
  ): Promise<Review> {
    const review = await manager
      .getRepository(Review)
      .findOne({
        where: { ...scoped(scope), id },
        lock: { mode: 'pessimistic_write' }
      })
    if (!review) throw new ReviewError('not_found')
    return review
  }

  private checkVersion(review: Review, version: number) {
    if (review.version !== version) throw new ReviewError('version_conflict')
  }

  private async save(manager: EntityManager, review: Review) {
    review.version++
    review.updatedAt = new Date().toISOString()
    await manager.save(review)
  }

  private async recoverExpired(manager: EntityManager, review: Review) {
    if (review.status !== 'ANALYZING') return
    const attempt = await manager.getRepository(AnalysisAttempt).findOneBy({
      tenantId: review.tenantId ?? IsNull(),
      organizationId: review.organizationId ?? IsNull(),
      ownerId: review.ownerId,
      reviewId: review.id,
      status: 'RUNNING'
    })
    if (attempt && Date.parse(attempt.deadlineAt) <= Date.now()) {
      attempt.status = 'INTERRUPTED'
      attempt.completedAt = new Date().toISOString()
      attempt.errorCode = 'attempt_expired'
      review.status = 'FAILED'
      await manager.save(attempt)
      await this.save(manager, review)
    }
  }

  private async finishFailure(
    manager: EntityManager,
    review: Review,
    attempt: AnalysisAttempt,
    code: string
  ) {
    attempt.status = 'FAILED'
    attempt.errorCode = code
    attempt.completedAt = new Date().toISOString()
    review.status = 'FAILED'
    await manager.save(attempt)
    await this.save(manager, review)
  }
}
