/**
 * 简历筛选服务单元测试
 *
 * 借鉴 smart-maintenance 的内存 store + jest.fn 包装方式模拟 TypeORM 仓库，
 * 不依赖真实数据库即可覆盖职位创建去重、列表排序与当前职位回退等核心业务路径；
 * 真实查询语义（where/order/take 的 SQL 行为）由 E2E 真机验证兜底。
 */
import { BadRequestException, NotFoundException } from '@nestjs/common'
import { createHash } from 'crypto'
import { FindOperator } from 'typeorm'
import { ResumeScreenCandidate, ResumeScreenJob } from './entities'
import { ResumeScreenRevisionConflictError, ResumeScreenService } from './resume-screen.service'
import type { ResumeScreenScope } from './types'

// 内存时间戳基准：保证模拟 save 写入的 createdAt 单调递增，供 order by createdAt 排序用例使用
const MOCK_BASE_TIME = 1700000000000

/**
 * 模拟 TypeORM where 条件匹配：等值直接比较（undefined 视为不过滤），
 * FindOperator 目前只需支持 lessThan（sweep 滞留行的 updatedAt 阈值过滤），其余操作符显式报错防误用。
 */
function matchesWhere(item: Record<string, unknown>, where?: Record<string, unknown>) {
  if (!where) {
    return true
  }
  return Object.entries(where).every(([key, value]) => {
    if (value === undefined) {
      return true
    }
    const actual = item[key]
    if (value instanceof FindOperator) {
      if (value.type === 'lessThan') {
        const actualTime = actual instanceof Date ? actual.getTime() : Number(actual)
        return Number.isFinite(actualTime) && actualTime < (value.value as Date).getTime()
      }
      throw new Error(`mock repository 未实现的操作符：${value.type}`)
    }
    return actual === value
  })
}

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
    findOne: jest.fn(async ({ where }: { where?: Record<string, unknown> }) => {
      return store.find((item) => matchesWhere(item as Record<string, unknown>, where)) ?? null
    }),
    // 模拟数据库过滤/排序/截取：where 走 matchesWhere，order 多键从最后一个键起稳定排序，take 截取前 N 条
    find: jest.fn(async (options?: { where?: Record<string, unknown>; order?: Record<string, 'ASC' | 'DESC'>; take?: number }) => {
      const rows = store.filter((item) => matchesWhere(item as Record<string, unknown>, options?.where))
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
    // 模拟条件更新：仅 where 命中的行被合并 data，affected 反映真实抢占语义（sweep 并发安全依赖它）；
    // 值为函数时按 typeorm 原子自增 SQL 表达式（`() => '"col" + 1'`）解析，模拟列值 +1 落库
    update: jest.fn(async (where: Record<string, unknown>, data: Record<string, unknown>) => {
      const targets = store.filter((item) => matchesWhere(item as Record<string, unknown>, where))
      targets.forEach((item) => {
        const target = item as Record<string, unknown>
        for (const [key, value] of Object.entries(data)) {
          if (typeof value === 'function') {
            const expression = /^"(?<column>\w+)"\s*\+\s*1$/.exec(String(value()))
            target[key] = expression ? Number(target[expression.groups!.column] ?? 0) + 1 : value
          } else {
            target[key] = value
          }
        }
      })
      return { affected: targets.length }
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

    // S7 审核 F2 接线：上限取插件安装上下文 config.maxResumesPerBatch，而非恒缺省的 DI 参数
    it('enforces the configured maxResumesPerBatch from the plugin install context', async () => {
      const configured = new ResumeScreenService(
        jobRepository as never,
        candidateRepository as never,
        { config: { maxResumesPerBatch: 3 } } as never
      )
      const job = await configured.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      // 恰等于上限放行、超限拒绝，且中文提示回显配置值而不是默认 10
      const ok = await configured.prepareIntakeDraft(scope, job.id, ['甲', '乙', '丙'])
      expect(ok.created).toHaveLength(3)
      await expect(
        configured.prepareIntakeDraft(scope, job.id, ['丁', '戊', '己', '庚'])
      ).rejects.toThrow('单批最多 3 条简历')
    })

    it('scopes dedupeKey per job (same text, different job → new row)', async () => {
      const jobA = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const jobB = await service.createJob(scope, { title: 'B', jdText: 'b'.repeat(30) })
      await service.prepareIntakeDraft(scope, jobA.id, ['同一份简历'])
      const result = await service.prepareIntakeDraft(scope, jobB.id, ['同一份简历'])
      expect(result.created).toHaveLength(1)
    })

    it('persists source file name onto the intake draft row', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      const result = await service.prepareIntakeDraft(scope, job.id, ['  简历原文 A  '], { sourceFileName: 'a.docx' })
      // 上传通道的文件名要能随草稿行落库并在视图带出（工作台失败行溯源用）
      expect(candidateRepository.store[0].sourceFileName).toBe('a.docx')
      expect(result.created[0].sourceFileName).toBe('a.docx')
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

    // 人工修正保护：人工改过的字段在 AI 重跑回填时必须原样保留（AC5.2）
    it('never overwrites human-edited fields (AC5.2)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])
      await service.updateCandidate(scope, rowId, { name: '张三丰' }, 1)

      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: 'AI猜的' }])

      const row = candidateRepository.store[0]
      expect(row.name).toBe('张三丰')
      expect(row.humanEditedFields).toContain('name')
    })

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

    // S7 审核 F9：AI 回填是系统写，不得推进乐观锁版本——否则心跳期正在编辑的用户会被
    // 无端顶成「已被他人修改」冲突；人工编辑/处置/重试通道才负责递增
    it('AI backfill leaves revision untouched while human edit still bumps it', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])
      expect(candidateRepository.store[0].revision).toBe(1)
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三', matchScore: 90 }])
      expect(candidateRepository.store[0].revision).toBe(1)

      const edited = await service.updateCandidate(scope, rowId, { name: '张三丰' }, 1)
      expect(edited.revision).toBe(2)
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

    // S7 审核 F9：人工重试属人工写，必须推进乐观锁版本使并发编辑旧版本号失效
    it('retry bumps revision so a concurrent editor holding the old version loses', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.markCandidateFailed(scope, rowId, '模型处理超时')
      const retried = await service.retryCandidate(scope, rowId)
      expect(retried.revision).toBe(2)
      // 持旧版本号 1 的编辑者保存即冲突（而非覆盖重试结果）
      await expect(service.updateCandidate(scope, rowId, { name: '过期编辑' }, 1)).rejects.toBeInstanceOf(
        ResumeScreenRevisionConflictError
      )
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
      // accept 终态后重试同样被拒绝（依赖 reviewCandidate 推进终态）
      await service.reviewCandidate(scope, rowId, 'accept', scope.userId ?? 'user-1')
      await expect(service.retryCandidate(scope, rowId)).rejects.toBeInstanceOf(BadRequestException)
      // accept 终态后重试同样被拒绝（依赖 reviewCandidate 推进终态）
      await service.reviewCandidate(scope, rowId, 'accept', scope.userId ?? 'user-1')
      await expect(service.retryCandidate(scope, rowId)).rejects.toBeInstanceOf(BadRequestException)
    })
  })

  // 乐观锁编辑：expectedRevision 不匹配即拒绝，防止并发场景下互相覆盖（AC5.1）
  describe('updateCandidate', () => {
    it('records humanEditedFields and bumps revision (AC5.1/5.2)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])

      const updated = await service.updateCandidate(scope, rowId, { name: '张三丰', matchScore: 95 }, 1)
      expect(updated.name).toBe('张三丰')
      expect(updated.matchScore).toBe(95)
      expect(updated.humanEditedFields).toEqual(expect.arrayContaining(['name', 'matchScore']))
      expect(updated.revision).toBe(2)
    })

    it('rejects stale revision with a readable message and a machine-readable conflict code', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.updateCandidate(scope, rowId, { name: '第一次修改' }, 1)
      // 冲突必须是携带 code 的类型化异常：视图层据此回 data.code='revision_conflict'（F1/F5）
      await expect(service.updateCandidate(scope, rowId, { name: '旧版本修改' }, 1)).rejects.toBeInstanceOf(
        ResumeScreenRevisionConflictError
      )
      await expect(service.updateCandidate(scope, rowId, { name: '旧版本修改' }, 1)).rejects.toThrow(
        '记录已被他人修改，请刷新'
      )
    })

    // S7 审核 F1：读-判-写原子化——预检通过之后、写库之前版本被他人抢先推进（并发窗口），
    // 条件更新的 WHERE revision 失配使 affected=0，必须拒绝而不是拿旧快照盲写覆盖
    it('blocks the write when the revision advanced after the pre-read (conditional update, no blind overwrite)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      // 库内已是版本 2（他人刚提交），但预读 findOne 返回竞态窗口里的旧快照（版本 1）
      await candidateRepository.update({ id: rowId }, { revision: 2 })
      candidateRepository.update.mockClear()
      const staleSnapshot = { ...(candidateRepository.store[0] as object), revision: 1 }
      ;(candidateRepository.findOne as jest.Mock).mockImplementationOnce(async () => staleSnapshot)

      await expect(service.updateCandidate(scope, rowId, { name: '旧窗口修改' }, 1)).rejects.toBeInstanceOf(
        ResumeScreenRevisionConflictError
      )
      // 冲突由条件更新拒绝（WHERE 带 expectedRevision），而不是 save 盲写：他人数据零改动
      expect(candidateRepository.update).toHaveBeenCalledWith(
        expect.objectContaining({ id: rowId, revision: 1 }),
        expect.objectContaining({ name: '旧窗口修改' })
      )
      expect((candidateRepository.store[0] as ResumeScreenCandidate).name).not.toBe('旧窗口修改')
    })
  })

  // 人工处置动作：accept/hold/reject 终态流转并落评审人，目标态重复操作幂等，撤回退回待评审
  describe('reviewCandidate', () => {
    it('accepts / holds / rejects and stamps reviewer (AC3.1/3.2)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历', name: '张三' }])

      const accepted = await service.reviewCandidate(scope, rowId, 'accept', 'user-1')
      expect(accepted.status).toBe('accepted')
      expect(accepted.reviewedById).toBe('user-1')

      const held = await service.reviewCandidate(scope, rowId, 'hold', 'user-1')
      expect(held.status).toBe('hold')

      const rejected = await service.reviewCandidate(scope, rowId, 'reject', 'user-1')
      expect(rejected.status).toBe('rejected')
    })

    it('is idempotent when already in target status (AC3.3)', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历' }])
      await service.reviewCandidate(scope, rowId, 'accept', 'user-1')
      const again = await service.reviewCandidate(scope, rowId, 'accept', 'user-1')
      expect(again.status).toBe('accepted')
    })

    // S7 审核 F9（spec §7.5 硬约束 3）：每次实际处置写库都推进 revision；
    // 幂等重复处置不写库也就不推进
    it('disposition writes bump revision, repeated same-action stays idempotent', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历' }])
      expect(candidateRepository.store[0].revision).toBe(1)

      const accepted = await service.reviewCandidate(scope, rowId, 'accept', 'user-1')
      expect(accepted.revision).toBe(2)
      const held = await service.reviewCandidate(scope, rowId, 'hold', 'user-1')
      expect(held.revision).toBe(3)
      const repeated = await service.reviewCandidate(scope, rowId, 'hold', 'user-1')
      expect(repeated.revision).toBe(3)
      // 处置推进版本后，持旧版本号的并发编辑必须收到冲突而不是被静默覆盖
      await expect(service.updateCandidate(scope, rowId, { name: '过期编辑' }, 1)).rejects.toBeInstanceOf(
        ResumeScreenRevisionConflictError
      )
    })

    it('resets back to pending_review via reset_to_pending', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'])
      const rowId = draft.created[0].id
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '张三的简历' }])
      await service.reviewCandidate(scope, rowId, 'accept', 'user-1')
      const reset = await service.reviewCandidate(scope, rowId, 'reset_to_pending', 'user-1')
      expect(reset.status).toBe('pending_review')
    })
  })

  // 工作台视图聚合：一次返回职位/当前职位/候选人分页/统计，供前端看板渲染
  describe('getViewData', () => {
    it('returns jobs, current job, candidates, stats and pagination', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      await service.prepareIntakeDraft(scope, job.id, ['甲', '乙'])
      await service.saveCandidatesFromAgent(scope, job.id, [
        { sourceText: '甲', name: '甲', matchScore: 80 },
        { sourceText: '乙', name: '乙', matchScore: 40 }
      ])
      await service.reviewCandidate(scope, (candidateRepository.store[0] as ResumeScreenCandidate).id, 'accept', 'user-1')

      const data = await service.getViewData(scope, { jobId: job.id, page: 1, pageSize: 20 })
      expect(data.jobs).toHaveLength(1)
      expect(data.job?.id).toBe(job.id)
      expect(data.candidates).toHaveLength(2)
      expect(data.stats.total).toBe(2)
      expect(data.stats.accepted).toBe(1)
      expect(data.stats.pendingReview).toBe(1)
      expect(data.page).toEqual({ number: 1, size: 20, total: 2 })
    })

    it('returns empty stats when nothing exists', async () => {
      const data = await service.getViewData(scope, {})
      expect(data.jobs).toHaveLength(0)
      expect(data.candidates).toHaveLength(0)
      expect(data.stats.total).toBe(0)
    })

    // M11 真机缺陷回归：status 过滤回调曾因 TDZ 自引用（candidate.status === statusFilter）
    // 在带 status 的查询上直接抛 ReferenceError → 工作台状态 pill 点击即 500
    it('filters candidates by the requested status when the query carries a status', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['甲', '乙', '丙'])
      await service.saveCandidatesFromAgent(scope, job.id, [
        { sourceText: '甲', name: '甲' },
        { sourceText: '乙', name: '乙' },
        { sourceText: '丙', name: '丙' }
      ])
      await service.reviewCandidate(scope, draft.created[0].id, 'accept', 'user-1')

      const data = await service.getViewData(scope, { jobId: job.id, status: 'pending_review' })
      // 只返回待评审候选人，且按默认 createdAt 倒序（丙最新在前）
      expect(data.candidates.map((candidate) => candidate.name)).toEqual(['丙', '乙'])
      expect(data.candidates.every((candidate) => candidate.status === 'pending_review')).toBe(true)
      expect(data.page.total).toBe(2)
      // 统计口径与过滤解耦：stats 仍基于当前职位全量候选人
      expect(data.stats.total).toBe(3)
      expect(data.stats.accepted).toBe(1)
    })

    it('returns an empty candidate list when no row matches the requested status', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      await service.prepareIntakeDraft(scope, job.id, ['甲'])
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '甲', name: '甲' }])

      const data = await service.getViewData(scope, { jobId: job.id, status: 'hold' })
      expect(data.candidates).toHaveLength(0)
      expect(data.page.total).toBe(0)
      // 空过滤结果不影响全量统计
      expect(data.stats.pendingReview).toBe(1)
    })

    it('returns all candidates of the current job when the query has no status', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['甲', '乙', '丙'])
      await service.saveCandidatesFromAgent(scope, job.id, [
        { sourceText: '甲', name: '甲' },
        { sourceText: '乙', name: '乙' },
        { sourceText: '丙', name: '丙' }
      ])
      await service.reviewCandidate(scope, draft.created[0].id, 'accept', 'user-1')

      const data = await service.getViewData(scope, { jobId: job.id })
      expect(data.candidates).toHaveLength(3)
      expect(data.page.total).toBe(3)
    })
  })

  // 助手只读查询：摘要刻意精简且不携带简历原文，详情按 id 二次查询，控制模型上下文长度
  describe('listCandidatesForAgent / getCandidateDetailForAgent', () => {
    it('returns compact summaries without sourceText', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      await service.prepareIntakeDraft(scope, job.id, ['甲'])
      await service.saveCandidatesFromAgent(scope, job.id, [{ sourceText: '甲', name: '甲', matchScore: 80 }])

      const list = await service.listCandidatesForAgent(scope, { jobId: job.id })
      expect(list).toHaveLength(1)
      expect(list[0]).not.toHaveProperty('sourceText')
      expect(list[0].name).toBe('甲')

      const detail = await service.getCandidateDetailForAgent(scope, list[0].id)
      expect(detail.matchScore).toBe(80)
      expect(detail).not.toHaveProperty('sourceText')
    })

    // S7 审核 F8：工具声明了 page/pageSize，服务层必须透传而不是硬覆盖回第 1 页
    it('passes the requested page/pageSize through to the list query', async () => {
      const job = await service.createJob(scope, { title: 'A', jdText: 'a'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['甲', '乙', '丙', '丁'])
      // 默认 createdAt 倒序：丁丙乙甲——第 2 页（size=2）应命中 乙、甲
      const secondPage = await service.listCandidatesForAgent(scope, { jobId: job.id, page: 2, pageSize: 2 })
      expect(secondPage.map((item) => item.id)).toEqual([draft.created[1].id, draft.created[0].id])
    })

    it('caps pageSize at 100 and defaults to page 1 when pagination is omitted', async () => {
      const getViewDataSpy = jest.spyOn(service, 'getViewData').mockResolvedValue({
        jobs: [],
        candidates: [],
        stats: { total: 0, pendingReview: 0, accepted: 0, hold: 0, rejected: 0, failed: 0, parsing: 0 },
        page: { number: 1, size: 100, total: 0 }
      })
      await service.listCandidatesForAgent(scope, { jobId: 'job-1', page: undefined, pageSize: 500 })
      // 越界 pageSize 收敛到封顶 100，保住「单次查询不撑爆模型上下文」的闸
      expect(getViewDataSpy).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ page: 1, pageSize: 100 }))
      await service.listCandidatesForAgent(scope, { jobId: 'job-1', page: 3, pageSize: 10 })
      expect(getViewDataSpy).toHaveBeenLastCalledWith(expect.anything(), expect.objectContaining({ page: 3, pageSize: 10 }))
      getViewDataSpy.mockRestore()
    })
  })

  // worker 专用查询：链路 B 处理器按 candidateId 现取全量行 + 跨作用域 sweep 兜底
  describe('parse worker helpers (getCandidateForParse / sweep)', () => {
    it('getCandidateForParse returns row with job text and self-carried scope', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'react 三年经验优先'.repeat(3) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['张三的简历'], { sourceFileName: 'a.docx' })

      const row = await service.getCandidateForParse(draft.created[0].id)
      expect(row).toMatchObject({
        jobId: job.id,
        status: 'parsing',
        sourceText: '张三的简历',
        attemptCount: 0,
        humanEditedFields: [],
        jobTitle: '前端工程师',
        // worker 无请求上下文，隔离维度全靠行自携带（assistantId 是 saveCandidatesFromAgent 作用域校验的一部分）
        scope: { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1', assistantId: 'assistant-1' },
        jobJdText: 'react 三年经验优先'.repeat(3)
      })
    })

    it('getCandidateForParse returns null for unknown id', async () => {
      expect(await service.getCandidateForParse('missing')).toBeNull()
    })

    it('findStaleParsingRows returns only parsing rows older than threshold, across scopes', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['滞留行', '将被标失败的行'])
      await service.markCandidateFailed(scope, draft.created[1].id, '手动标失败')

      // MOCK 行的 updatedAt 固定在 2023 基准时间：阈值 0（cutoff=now）应命中全部 parsing 行、排除 failed 行
      const stale = await service.findStaleParsingRows(0)
      expect(stale.map((row) => row.id)).toEqual([draft.created[0].id])
      expect(stale[0].scope).toMatchObject({ tenantId: 'tenant-1', assistantId: 'assistant-1' })

      // 阈值大到 cutoff 晚于 MOCK 时间 → 该行不再视为滞留
      const none = await service.findStaleParsingRows(Date.now() - MOCK_BASE_TIME + 60_000)
      expect(none).toHaveLength(0)
    })

    it('claimStaleParsing preempts only stale parsing rows and persists the bumped attempt number', async () => {
      const job = await service.createJob(scope, { title: '前端工程师', jdText: 'x'.repeat(30) })
      const draft = await service.prepareIntakeDraft(scope, job.id, ['待抢占行'])
      const candidateId = draft.created[0].id

      // 新鲜行保护：updatedAt 不早于 cutoff 的行不得被抢占，attemptCount 保持不变（防误计）
      const earlyCutoff = new Date(MOCK_BASE_TIME - 10_000)
      await expect(service.claimStaleParsing(candidateId, earlyCutoff)).resolves.toBeNull()
      expect(candidateRepository.store[0].attemptCount).toBe(0)

      // 第一轮：滞留 parsing 行抢占成功，返回值=持久化自增后的新号（重投 jobId 用它变号）
      const cutoff = new Date(MOCK_BASE_TIME + 60_000)
      await expect(service.claimStaleParsing(candidateId, cutoff)).resolves.toBe(1)
      expect(candidateRepository.store[0].attemptCount).toBe(1)

      // 第二轮（崩溃循环模拟：重投 job 再次丢失、行重新滞留）——上一轮抢占已把变号持久落库，
      // 本轮读回的基数是 1，抢占返回 2，与上一代 jobId（…-1）必然不同，绕开 BullMQ 存活 job 去重
      ;(candidateRepository.store[0] as ResumeScreenCandidate).updatedAt = new Date(MOCK_BASE_TIME)
      await expect(service.claimStaleParsing(candidateId, new Date(Date.now() + 60_000))).resolves.toBe(2)
      expect(candidateRepository.store[0].attemptCount).toBe(2)

      // 已非 parsing 的行（他人已处理/已失败）抢占失败返回 null
      await service.markCandidateFailed(scope, candidateId, '已失败')
      await expect(service.claimStaleParsing(candidateId, new Date(Date.now() + 60_000))).resolves.toBeNull()
      await expect(service.claimStaleParsing('unknown-id', new Date(Date.now() + 60_000))).resolves.toBeNull()
    })
  })
})
