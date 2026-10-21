import { ContractHealthCheckService } from './contract-health-check.service.js'
import type { ContractScope, ContractReviewJobType } from './types.js'

/**
 * Minimal in-memory repository double. The plugin relies on TypeORM inside the
 * platform, but for unit tests we assert business outcomes (status transitions,
 * idempotent retry, validation) rather than the ORM itself.
 */
class FakeRepository<T extends { id?: string; reviewId?: string; type?: string }> {
  rows: T[] = []
  private seq = 0

  create(input: Partial<T>): T {
    return { ...(input as T) }
  }

  async save(entity: T | T[]): Promise<any> {
    // TypeORM's Repository.save accepts both a single entity and an array of entities.
    if (Array.isArray(entity)) {
      const saved: T[] = []
      for (const item of entity) {
        saved.push(await this.saveOne(item))
      }
      return saved
    }
    return this.saveOne(entity)
  }

  private async saveOne(entity: T): Promise<T> {
    if (!entity.id) {
      this.seq += 1
      entity.id = `id-${this.seq}`
      this.rows.push(entity)
      return entity
    }
    const index = this.rows.findIndex((row) => row.id === entity.id)
    if (index >= 0) {
      this.rows[index] = entity
    } else {
      this.rows.push(entity)
    }
    return entity
  }

  async find(options?: { where?: Record<string, unknown> }): Promise<T[]> {
    if (!options?.where) {
      return [...this.rows]
    }
    return this.rows.filter((row) => matches(row, options.where as Record<string, unknown>))
  }

  async findOne(options: { where?: Record<string, unknown> }): Promise<T | null> {
    const found = await this.find(options)
    return found[0] ?? null
  }

  async delete(where: Record<string, unknown>): Promise<unknown> {
    const remaining: T[] = []
    let removed = 0
    for (const row of this.rows) {
      if (matches(row, where)) {
        removed += 1
      } else {
        remaining.push(row)
      }
    }
    this.rows = remaining
    return { affected: removed }
  }
}

function matches(row: Record<string, unknown>, where: Record<string, unknown>) {
  return Object.entries(where).every(([key, value]) => row[key] === value)
}

const scope: ContractScope = {
  tenantId: 'tenant-1',
  organizationId: 'org-1',
  userId: 'user-1'
}

const VALID_TEXT =
  '甲方：某某科技有限公司；乙方：某某服务有限公司。合同金额为人民币 100000 元，' +
  '验收后 90 天内付款。任何一方违约需赔偿对方损失。争议由甲方所在地法院管辖。'

function createService() {
  const reviewRepo = new FakeRepository<any>()
  const riskRepo = new FakeRepository<any>()
  const suggestionRepo = new FakeRepository<any>()
  const jobRepo = new FakeRepository<any>()
  const service = new ContractHealthCheckService(
    reviewRepo as any,
    riskRepo as any,
    suggestionRepo as any,
    jobRepo as any
  )
  return { service, reviewRepo, riskRepo, suggestionRepo, jobRepo }
}

describe('ContractHealthCheckService', () => {
  it('rejects a contract body that is too short', async () => {
    const { service } = createService()
    await expect(
      service.createReview(scope, { contractName: '测试合同', contractType: 'sales', rawText: '太短了' })
    ).rejects.toThrow(/过短/)
  })

  it('creates a review in draft status with zeroed counters', async () => {
    const { service } = createService()
    const review = await service.createReview(scope, {
      contractName: '销售合同 A',
      contractType: 'sales',
      rawText: VALID_TEXT
    })

    expect(review.status).toBe('draft')
    expect(review.highRiskCount).toBe(0)
    expect(review.contractName).toBe('销售合同 A')
  })

  it('creates one job per pipeline stage and reuses jobs on repeat (idempotent)', async () => {
    const { service, jobRepo } = createService()
    const review = await service.createReview(scope, {
      contractName: '销售合同 B',
      contractType: 'sales',
      rawText: VALID_TEXT
    })

    await service.createReviewJobs(scope, review.id!)
    await service.createReviewJobs(scope, review.id!)

    expect(jobRepo.rows).toHaveLength(4)
    const stages = jobRepo.rows.map((job) => job.type).sort()
    expect(stages).toEqual(['draft', 'extract', 'review', 'summary'])
  })

  it('drives the state machine to needs_review after risks and summary are saved', async () => {
    const { service } = createService()
    const review = await service.createReview(scope, {
      contractName: '采购合同 C',
      contractType: 'purchase',
      rawText: VALID_TEXT
    })
    await service.createReviewJobs(scope, review.id!)

    await service.saveExtraction(scope, { reviewId: review.id!, elements: { parties: ['甲方', '乙方'] } })
    await service.saveRiskItems(scope, {
      reviewId: review.id!,
      risks: [
        { level: 'high', clauseRef: '第4.2条', title: '付款账期过长', issue: '验收后90天付款' },
        { level: 'medium', clauseRef: '第9条', title: '管辖不利', issue: '由甲方所在地法院管辖' }
      ]
    })
    const detail = await service.saveSummary(scope, {
      reviewId: review.id!,
      score: 62,
      summary: '存在两项需关注的条款。'
    })

    expect(detail.item.review.status).toBe('needs_review')
    expect(detail.item.review.highRiskCount).toBe(1)
    expect(detail.item.review.mediumRiskCount).toBe(1)
    expect(detail.item.review.score).toBe(62)
    expect(detail.item.risks[0].level).toBe('high')
  })

  it('blocks saving the report until every risk is confirmed', async () => {
    const { service } = createService()
    const review = await service.createReview(scope, {
      contractName: '合作合同 D',
      contractType: 'cooperation',
      rawText: VALID_TEXT
    })
    await service.createReviewJobs(scope, review.id!)
    await service.saveRiskItems(scope, {
      reviewId: review.id!,
      risks: [{ level: 'high', title: '单方解除权', issue: '甲方可单方解除且不承担违约责任' }]
    })

    await expect(service.completeReview(scope, review.id!)).rejects.toThrow(/未确认/)

    const detail = await service.getReviewDetail(scope, review.id!)
    const riskId = detail.item.risks[0].id!
    await service.confirmRiskDecision(scope, { reviewId: review.id!, riskId, decision: 'accepted' })

    const completed = await service.completeReview(scope, review.id!)
    expect(completed.status).toBe('completed')
  })

  it('keeps results usable and flags summarySkipped when the summary stage fails', async () => {
    const { service } = createService()
    const review = await service.createReview(scope, {
      contractName: '销售合同 E',
      contractType: 'sales',
      rawText: VALID_TEXT
    })
    await service.createReviewJobs(scope, review.id!)
    await service.saveRiskItems(scope, {
      reviewId: review.id!,
      risks: [{ level: 'medium', title: '验收标准模糊', issue: '未约定验收标准' }]
    })

    const outcome = await service.reportProcessingFailure(scope, {
      reviewId: review.id!,
      stage: 'summary',
      errorMessage: '模型调用超时'
    })

    expect(outcome).toEqual({ status: 'needs_review', stage: 'summary', summarySkipped: true })
    const detail = await service.getReviewDetail(scope, review.id!)
    expect(detail.item.review.status).toBe('needs_review')
    expect(detail.item.review.summarySkipped).toBe(true)
    expect(detail.item.risks).toHaveLength(1)
  })

  it('marks the review failed and retries only the failed stage without duplicating results', async () => {
    const { service, jobRepo } = createService()
    const review = await service.createReview(scope, {
      contractName: '销售合同 F',
      contractType: 'sales',
      rawText: VALID_TEXT
    })
    await service.createReviewJobs(scope, review.id!)

    await service.reportProcessingFailure(scope, {
      reviewId: review.id!,
      stage: 'review',
      errorMessage: '模型服务不可用'
    })

    const failed = await service.getReviewDetail(scope, review.id!)
    expect(failed.item.review.status).toBe('failed')
    expect(failed.item.review.failedStage).toBe('review')

    const result = await service.retryPipeline(scope, { reviewId: review.id! })
    expect(result.stage).toBe('review')
    expect(result.command.stage).toBe('review')

    // Retry must not create a new job row for the same stage.
    const reviewJobs = jobRepo.rows.filter((job) => job.type === 'review')
    expect(reviewJobs).toHaveLength(1)
    // The failed stage records one retry attempt; other stages are untouched.
    expect(reviewJobs[0].attempts).toBe(1)
    const failedJob = jobRepo.rows.find((job) => job.type === 'review')
    expect(failedJob?.errorMessage).toBeUndefined()

    const afterRetry = await service.getReviewDetail(scope, review.id!)
    expect(afterRetry.item.review.status).toBe('processing')
  })

  it('isolates data by organization scope', async () => {
    const { service } = createService()
    const review = await service.createReview(scope, {
      contractName: '销售合同 G',
      contractType: 'sales',
      rawText: VALID_TEXT
    })

    const otherOrg: ContractScope = { tenantId: 'tenant-1', organizationId: 'org-2', userId: 'user-2' }
    await expect(service.getReviewDetail(otherOrg, review.id!)).rejects.toThrow(/不存在/)
  })

  it('types the pipeline stages explicitly', () => {
    const stages: ContractReviewJobType[] = ['extract', 'review', 'draft', 'summary']
    expect(stages).toHaveLength(4)
  })
})
