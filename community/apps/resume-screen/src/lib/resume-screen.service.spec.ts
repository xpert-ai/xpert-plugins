/**
 * 简历筛选服务单元测试
 *
 * 借鉴 smart-maintenance 的内存 store + jest.fn 包装方式模拟 TypeORM 仓库，
 * 不依赖真实数据库即可覆盖职位创建去重、列表排序与当前职位回退等核心业务路径；
 * 真实查询语义（where/order/take 的 SQL 行为）由 E2E 真机验证兜底。
 */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'
import { ResumeScreenService } from './resume-screen.service'
import type { ResumeScreenScope } from './types'

// 内存时间戳基准：保证模拟 save 写入的 createdAt 单调递增，供 order by createdAt 排序用例使用
const MOCK_BASE_TIME = 1700000000000

function createRepository<T extends { id?: string }>() {
  const store: T[] = []
  const repository = {
    store,
    create: jest.fn((input: T) => ({ ...input })),
    // 模拟落库行为：主键缺省时生成自增 id，并补齐 CreateDateColumn/UpdateDateColumn 语义的时间戳
    save: jest.fn(async (input: T) => {
      const row = {
        ...input,
        id: input.id ?? `id-${store.length + 1}`,
        createdAt: input.createdAt ?? new Date(MOCK_BASE_TIME + store.length * 1000),
        updatedAt: new Date(MOCK_BASE_TIME + store.length * 1000)
      } as T
      const index = store.findIndex((item) => item.id === row.id)
      if (index >= 0) {
        store[index] = row
      } else {
        store.push(row)
      }
      return row
    }),
    findOne: jest.fn(async ({ where }: { where: Record<string, unknown> }) => {
      return (
        store.find((item) =>
          Object.entries(where).every(
            ([key, value]) => value === undefined || (item as Record<string, unknown>)[key] === value
          )
        ) ?? null
      )
    }),
    // 模拟数据库排序与截取：按 order 选项排序（多键时从最后一个键起稳定排序），take 截取前 N 条；
    // where 过滤不在此模拟，依赖该行为的断言需基于单一作用域的 store 设计
    find: jest.fn(async (options?: { order?: Record<string, 'ASC' | 'DESC'>; take?: number }) => {
      const rows = [...store]
      const orderEntries = Object.entries(options?.order ?? {})
      for (const [key, direction] of orderEntries.reverse()) {
        rows.sort((a, b) => {
          const av = (a as Record<string, unknown>)[key]
          const bv = (b as Record<string, unknown>)[key]
          if (av === bv) {
            return 0
          }
          const compared = (av as number | string) > (bv as number | string) ? 1 : -1
          return direction === 'DESC' ? -compared : compared
        })
      }
      return options?.take ? rows.slice(0, options.take) : rows
    }),
    count: jest.fn(async () => store.length)
  }
  return repository
}

// 与服务内相同的归一化指纹算法，用于断言 jdHash 落库正确
function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

describe('ResumeScreenService', () => {
  const scope: ResumeScreenScope = {
    tenantId: 'tenant-1',
    organizationId: 'org-1',
    userId: 'user-1',
    assistantId: 'assistant-1',
    conversationId: 'conversation-1'
  }

  let jobRepository: ReturnType<typeof createRepository<ResumeScreenJob>>
  let candidateRepository: ReturnType<typeof createRepository<ResumeScreenCandidate>>
  let service: ResumeScreenService

  beforeEach(() => {
    jobRepository = createRepository<ResumeScreenJob>()
    candidateRepository = createRepository<ResumeScreenCandidate>()
    service = new ResumeScreenService(
      jobRepository as never,
      candidateRepository as never
    )
  })

  describe('createJob', () => {
    it('creates a job with jdHash and scope columns', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      expect(job.title).toBe('前端工程师')
      expect(job.jdHash).toBe(sha256('x'.repeat(30)))
      // 租户隔离列不出现在对外视图上，这里直接断言落库行携带了正确的 scope 值
      expect(jobRepository.store[0].tenantId).toBe('tenant-1')
      expect(jobRepository.store[0].organizationId).toBe('org-1')
    })

    it('rejects blank title or short jdText', async () => {
      await expect(service.createJob(scope, { title: '', jdText: 'x'.repeat(30) })).rejects.toBeInstanceOf(
        BadRequestException
      )
      await expect(service.createJob(scope, { title: '前端工程师', jdText: 'short' })).rejects.toBeInstanceOf(
        BadRequestException
      )
    })

    it('is idempotent on the same jdText within the scope (returns existing job)', async () => {
      const first = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      const second = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      expect(second.id).toBe(first.id)
      expect(jobRepository.store).toHaveLength(1)
    })
  })

  describe('listJobs / getCurrentJob', () => {
    it('lists jobs newest first', async () => {
      await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      await service.createJob(scope, { title: 'B', jdText: 'b'.repeat(30) })
      const jobs = await service.listJobs(scope)
      expect(jobs).toHaveLength(2)
      expect(jobs[0].title).toBe('B')
    })

    it('getCurrentJob falls back to the newest job when no jobId given', async () => {
      await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const job = await service.createJob(scope, { title: 'B', jdText: 'b'.repeat(30) })
      const current = await service.getCurrentJob(scope, undefined)
      expect(current?.id).toBe(job.id)
    })
  })

  describe('prepareIntakeDraft', () => {
    it('creates parsing rows with dedupeKey and skips existing texts (AC2.4)', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      const result = await service.prepareIntakeDraft(scope, job.id, ['简历甲', '简历乙'])
      expect(result.created).toHaveLength(2)
      expect(result.created[0].status).toBe('parsing')
      expect(result.skippedAsExisting).toHaveLength(0)

      const again = await service.prepareIntakeDraft(scope, job.id, ['简历甲', '简历丙'])
      expect(again.created).toHaveLength(1)
      expect(again.skippedAsExisting).toHaveLength(1)
      expect(candidateRepository.store).toHaveLength(3)
    })

    it('rejects when jobId missing or batch exceeds maxResumesPerBatch', async () => {
      await expect(service.prepareIntakeDraft(scope, 'missing-job', ['简历甲'])).rejects.toBeInstanceOf(
        NotFoundException
      )
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      await expect(
        service.prepareIntakeDraft(scope, job.id, Array.from({ length: 11 }, (_, i) => `简历${i}`))
      ).rejects.toBeInstanceOf(BadRequestException)
    })

    it('scopes dedupeKey per job (same text, different job → new row)', async () => {
      const jobA = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const jobB = await service.createJob(scope, { title: 'B', jdText: 'b'.repeat(30) })
      await service.prepareIntakeDraft(scope, jobA.id, ['同一份简历'])
      const result = await service.prepareIntakeDraft(scope, jobB.id, ['同一份简历'])
      expect(result.created).toHaveLength(1)
    })
  })

  describe('saveCandidatesFromAgent', () => {
    it('backfills parsing rows and sets pending_review (AC2.3)', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id

      const saved = await service.saveCandidatesFromAgent(scope, job.id, [
        {
          sourceText: '张三的简历',
          name: '张三',
          yearsOfExperience: '5',
          education: '本科',
          skills: ['React', 'TypeScript'],
          matchScore: 86,
          matchReason: '5 年 React 经验，与 JD 吻合',
          hitPoints: ['技能栈匹配'],
          riskPoints: ['无团队管理经验']
        }
      ])

      expect(saved).toHaveLength(1)
      expect(saved[0].id).toBe(rowId)
      expect(saved[0].status).toBe('pending_review')
      expect(saved[0].name).toBe('张三')
      expect(saved[0].matchScore).toBe(86)
    })

    it('upserts by dedupeKey: same record, no duplicate (AC4.3 retry-safety)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三', matchScore: 90 }])
      expect(candidateRepository.store).toHaveLength(1)
      expect(candidateRepository.store[0].matchScore).toBe(90)
    })

    // enabled in Task 11（依赖 updateCandidate）
    // it('never overwrites human-edited fields (AC5.2)', async () => {
    //   const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
    //   const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
    //   const rowId = draft.created[0].id
    //   await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])
    //   await service.updateCandidate(scope, rowId, { name: '张三丰' }, 1)
    //
    //   await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: 'AI猜的' }])
    //
    //   const row = candidateRepository.store[0]
    //   expect(row.name).toBe('张三丰')
    //   expect(row.humanEditedFields).toContain('name')
    // })

    // enabled in Task 10（依赖 markCandidateFailed / retryCandidate）
    it('clears failureReason and keeps attemptCount on success', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.markCandidateFailed(scope, rowId, '模型处理超时')
      await service.retryCandidate(scope, rowId)
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])

      const row = candidateRepository.store[0]
      expect(row.status).toBe('pending_review')
      expect(row.failureReason).toBeNull()
      expect(row.attemptCount).toBe(1)
    })
  })

  describe('markCandidateFailed / retryCandidate', () => {
    it('marks failed with readable reason and increments attemptCount (AC4.1/4.2)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id

      const failed = await service.markCandidateFailed(scope, rowId, 'AI 返回格式不合法')
      expect(failed.status).toBe('failed')
      expect(failed.failureReason).toBe('AI 返回格式不合法')
      expect(failed.attemptCount).toBe(1)

      const retrying = await service.retryCandidate(scope, rowId)
      expect(retrying.status).toBe('parsing')
      // 视图层把清空后的 failureReason 归一为 undefined（null → undefined 序列化约定）
      expect(retrying.failureReason).toBeUndefined()
      expect(retrying.attemptCount).toBe(1)
    })

    it('retry keeps the same record id, no duplicates (AC4.3)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.markCandidateFailed(scope, rowId, '模型处理超时')
      await service.retryCandidate(scope, rowId)
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])
      expect(candidateRepository.store).toHaveLength(1)
      expect(candidateRepository.store[0].id).toBe(rowId)
    })

    it('retry rejects non-retryable statuses (M1: parsing is also retryable)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      // parsing 行可直接重试（模型彻底失败场景，spec 修正项 M1）
      const retrying = await service.retryCandidate(scope, rowId)
      expect(retrying.status).toBe('parsing')

      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])
      // pending_review 已是待人工评审状态，重试应被拒绝
      await expect(service.retryCandidate(scope, rowId)).rejects.toBeInstanceOf(BadRequestException)
      // enabled in Task 11（依赖 reviewCandidate）：补充 accept 终态后重试同样被拒绝
      // await service.reviewCandidate(scope, rowId, 'accept', scope.userId ?? 'user-1')
      // await expect(service.retryCandidate(scope, rowId)).rejects.toBeInstanceOf(BadRequestException)
    })
  })
})
