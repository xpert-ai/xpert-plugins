/**
 * Service 单测（pg-mem 内存数据库）：状态机、幂等、超时、演示故障、租户隔离。
 */
import type { DataSource } from 'typeorm'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { AnalysisJobEntity, ShortageFindingEntity, TABLE_NAMES } from './entities/index.js'
import { ExpediteError } from './errors.js'
import type { ExpediteService } from './expedite.service.js'
import { OTHER_ORG, SCOPE, createService, createTestDataSource } from './testing/test-db.js'
import type { FakeClock } from './testing/test-db.js'
import { ANALYSIS_TIMEOUT_MS } from './types.js'

let dataSource: DataSource
let service: ExpediteService
let clock: FakeClock

beforeEach(async () => {
  dataSource = await createTestDataSource()
  ;({ service, clock } = createService(dataSource))
})
afterEach(async () => {
  await dataSource.destroy()
})

/** 断言 Promise 以指定业务错误码失败 */
async function expectCode(promise: Promise<unknown>, code: string) {
  await expect(promise).rejects.toSatisfy((error: unknown) => error instanceof ExpediteError && error.code === code)
}

async function seedAndFind(orderNo: string) {
  await service.seedDemoRequests(SCOPE)
  const list = await service.listRequests(SCOPE, { search: orderNo })
  const item = list.items.find((row) => row.orderNo === orderNo)
  if (!item) throw new Error(`missing ${orderNo}`)
  return item
}

/** 模拟智能体按正常顺序完成 SO-1024 的分析 */
async function runSo1024Analysis(jobId: string) {
  await service.getAnalysisContext(SCOPE, jobId)
  await service.explodeBomForJob(SCOPE, jobId)
  const inventory = await service.checkInventoryForJob(SCOPE, jobId)
  expect(inventory.shortageMaterialCodes).toEqual(['P-201', 'B-110'])
  await service.getSupplyOptionsForJob(SCOPE, jobId, inventory.shortageMaterialCodes)
  await service.saveFinding(SCOPE, jobId, {
    materialCode: 'P-201',
    suggestionType: 'expedite',
    suggestedDate: '2026-11-26',
    rationale: 'Expedite PO-778 (20 pcs, ETA 2026-12-02) to arrive by 2026-11-26.'
  })
  await service.saveFinding(SCOPE, jobId, {
    materialCode: 'B-110',
    suggestionType: 'substitute',
    substituteCode: 'B-110A',
    rationale: 'Substitute B-110A has 80 pcs on hand, covering the 40 pcs gap.'
  })
  return service.finalizeAnalysis(SCOPE, jobId, {
    feasibility: 'conditional',
    recommendedDate: '2026-11-27',
    summary: 'Feasible on 11-27 if PO-778 is expedited and B-110A is approved.'
  })
}

describe('schema', () => {
  it('creates the four tables with the plugin namespace prefix', () => {
    const tables = dataSource.entityMetadatas.map((meta) => meta.tableName).sort()
    expect(tables).toEqual([...TABLE_NAMES].sort())
    for (const table of tables) expect(table.startsWith('plugin_expedite_shortage_')).toBe(true)
  })
})

describe('requests', () => {
  it('seeds the three demo requests idempotently', async () => {
    expect(await service.seedDemoRequests(SCOPE)).toEqual({ inserted: 3, skipped: 0 })
    expect(await service.seedDemoRequests(SCOPE)).toEqual({ inserted: 0, skipped: 3 })
    const list = await service.listRequests(SCOPE)
    expect(list.total).toBe(3)
    expect(list.items.every((item) => item.status === 'draft')).toBe(true)
  })

  it('validates required fields and date rules', async () => {
    const base = {
      orderNo: 'SO-2000',
      customerName: 'Demo',
      productCode: 'X1',
      quantity: 5,
      originalDueDate: '2026-12-05',
      targetDate: '2026-11-25'
    }
    await expect(service.createRequest(SCOPE, { ...base, targetDate: undefined })).rejects.toMatchObject({
      code: 'VALIDATION_FAILED',
      details: { fields: { targetDate: 'invalid_type' } }
    })
    await expect(service.createRequest(SCOPE, { ...base, targetDate: '2026-12-06' })).rejects.toMatchObject({
      details: { fields: { targetDate: 'target_not_earlier' } }
    })
    await expect(service.createRequest(SCOPE, { ...base, productCode: 'X9' })).rejects.toMatchObject({
      details: { fields: { productCode: 'unknown_product' } }
    })
    await expect(service.createRequest(SCOPE, { ...base, tenantId: 'evil' })).rejects.toMatchObject({ code: 'VALIDATION_FAILED' })
    await service.createRequest(SCOPE, base)
    await expectCode(service.createRequest(SCOPE, base), 'DUPLICATE_ORDER')
  })

  it('isolates data by organization', async () => {
    const request = await seedAndFind('SO-1024')
    expect((await service.listRequests(OTHER_ORG)).total).toBe(0)
    await expectCode(service.getRequestDetail(OTHER_ORG, request.id), 'NOT_FOUND')
    await expectCode(service.startAnalysis(OTHER_ORG, request.id), 'NOT_FOUND')
  })

  it('only deletes drafts', async () => {
    const request = await seedAndFind('SO-1040')
    await service.startAnalysis(SCOPE, request.id)
    await expectCode(service.deleteDraft(SCOPE, request.id), 'INVALID_STATE')
    const draft = await seedAndFind('SO-1024')
    expect(await service.deleteDraft(SCOPE, draft.id)).toEqual({ requestId: draft.id, deleted: true })
  })
})

describe('analysis flow', () => {
  it('runs the full SO-1024 flow: analyse → pending review → decide → confirm', async () => {
    const request = await seedAndFind('SO-1024')
    const started = await service.startAnalysis(SCOPE, request.id)
    expect(started.created).toBe(true)
    expect(started.message).toContain(`analysisJobId: ${started.jobId}`)
    expect(started.message).toContain('SO-1024')

    const finalized = await runSo1024Analysis(started.jobId)
    expect(finalized).toMatchObject({ requestStatus: 'pending_review', findingCount: 2 })

    const detail = await service.getRequestDetail(SCOPE, request.id)
    expect(detail.request.status).toBe('pending_review')
    expect(detail.currentJob).toMatchObject({ status: 'succeeded', feasibility: 'conditional', recommendedDate: '2026-11-27' })
    expect(detail.findings.map((item) => [item.materialCode, item.shortageQty, item.suggestionType])).toEqual([
      ['B-110', 40, 'substitute'],
      ['P-201', 20, 'expedite']
    ])
    const b110 = detail.findings.find((item) => item.materialCode === 'B-110')!
    expect(b110.evidence.substitute).toMatchObject({ code: 'B-110A', onHand: 80 })
    expect(b110.evidence.inboundLate).toEqual([{ poNo: 'PO-790', qty: 40, eta: '2026-12-03' }])

    // 有未决条目时不能确认
    await expect(service.confirmRequest(SCOPE, { requestId: request.id, finalDate: '2026-11-27' })).rejects.toMatchObject({
      code: 'UNDECIDED_FINDINGS'
    })
    for (const finding of detail.findings) {
      await service.setFindingDecision(SCOPE, { findingId: finding.id, decision: finding.materialCode === 'P-201' ? 'accepted' : 'rejected', note: 'ok' })
    }
    expect(await service.confirmRequest(SCOPE, { requestId: request.id, finalDate: '2026-11-27', note: 'Use expedite plan' })).toEqual({
      requestId: request.id,
      status: 'confirmed'
    })
    // 第二次确认被拒绝；确认后结论不能再改
    await expectCode(service.confirmRequest(SCOPE, { requestId: request.id, finalDate: '2026-11-27' }), 'ALREADY_DECIDED')
    await expectCode(service.setFindingDecision(SCOPE, { findingId: b110.id, decision: 'accepted' }), 'FINDING_NOT_EDITABLE')

    const confirmed = await service.getRequestDetail(SCOPE, request.id)
    expect(confirmed.request).toMatchObject({ status: 'confirmed', finalDate: '2026-11-27', finalFeasibility: 'conditional' })
    expect(confirmed.logs.map((log) => log.action)).toEqual(
      expect.arrayContaining(['request_created', 'analysis_started', 'analysis_running', 'finding_saved', 'analysis_finalized', 'finding_decided', 'request_confirmed'])
    )
  })

  it('does not create a second active job when analysis is started twice', async () => {
    const request = await seedAndFind('SO-1024')
    const first = await service.startAnalysis(SCOPE, request.id)
    const second = await service.startAnalysis(SCOPE, request.id)
    expect(second).toMatchObject({ jobId: first.jobId, created: false })
    expect(await dataSource.getRepository(AnalysisJobEntity).count()).toBe(1)
  })

  it('updates instead of duplicating a finding saved twice in one job', async () => {
    const request = await seedAndFind('SO-1024')
    const { jobId } = await service.startAnalysis(SCOPE, request.id)
    const input = { materialCode: 'P-201', suggestionType: 'expedite' as const, suggestedDate: '2026-11-26', rationale: 'first version of rationale' }
    const first = await service.saveFinding(SCOPE, jobId, input)
    const second = await service.saveFinding(SCOPE, jobId, { ...input, suggestedDate: '2026-11-27', rationale: 'second version of rationale' })
    expect(second.findingId).toBe(first.findingId)
    expect(second.remainingShortageCodes).toEqual(['B-110'])
    const rows = await dataSource.getRepository(ShortageFindingEntity).find()
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ suggestedDate: '2026-11-27', shortageQty: 20 })
  })

  it('rejects findings that break business rules', async () => {
    const request = await seedAndFind('SO-1024')
    const { jobId } = await service.startAnalysis(SCOPE, request.id)
    await expect(service.saveFinding(SCOPE, jobId, { materialCode: 'C-301', suggestionType: 'no_action', rationale: 'not short at all' })).rejects.toMatchObject({
      code: 'NOT_A_SHORTAGE',
      details: { shortageMaterialCodes: ['P-201', 'B-110'] }
    })
    await expectCode(service.saveFinding(SCOPE, jobId, { materialCode: 'P-201', suggestionType: 'expedite', rationale: 'missing a date' }), 'SUGGESTED_DATE_REQUIRED')
    await expect(
      service.saveFinding(SCOPE, jobId, { materialCode: 'P-201', suggestionType: 'substitute', substituteCode: 'P-999', rationale: 'no such substitute' })
    ).rejects.toMatchObject({ code: 'SUBSTITUTE_NOT_ALLOWED', details: { allowedSubstitutes: [] } })
    await expectCode(service.getSupplyOptionsForJob(SCOPE, jobId, ['P-201', 'Z-000']), 'UNKNOWN_MATERIAL')
    // 缺料没有全部保存时不能提交总结论
    await expect(service.finalizeAnalysis(SCOPE, jobId, { feasibility: 'feasible', recommendedDate: '2026-11-25', summary: 'too early' })).rejects.toMatchObject({
      code: 'MISSING_FINDINGS',
      details: { materialCodes: ['P-201', 'B-110'] }
    })
  })

  it('finalizes SO-1040 without findings', async () => {
    const request = await seedAndFind('SO-1040')
    const { jobId } = await service.startAnalysis(SCOPE, request.id)
    expect((await service.checkInventoryForJob(SCOPE, jobId)).shortageCount).toBe(0)
    expect(await service.finalizeAnalysis(SCOPE, jobId, { feasibility: 'feasible', recommendedDate: '2026-11-27', summary: 'No shortage.' })).toMatchObject({
      requestStatus: 'pending_review',
      findingCount: 0
    })
    expect(await service.confirmRequest(SCOPE, { requestId: request.id, finalDate: '2026-11-27' })).toMatchObject({ status: 'confirmed' })
  })

  it('rejects illegal transitions', async () => {
    const request = await seedAndFind('SO-1024')
    await expectCode(service.confirmRequest(SCOPE, { requestId: request.id, finalDate: '2026-11-27' }), 'INVALID_STATE')
    await expectCode(service.rejectAnalysis(SCOPE, { requestId: request.id, reason: 'no' }), 'INVALID_STATE')
    await expectCode(service.getAnalysisContext(SCOPE, '00000000-0000-4000-8000-000000000000'), 'JOB_NOT_FOUND')
  })
})

describe('failure, retry and timeout', () => {
  it('SO-1031 fails on the first job only and the retry creates a new current job', async () => {
    const request = await seedAndFind('SO-1031')
    const first = await service.startAnalysis(SCOPE, request.id)
    await service.getAnalysisContext(SCOPE, first.jobId)
    await expect(service.checkInventoryForJob(SCOPE, first.jobId)).rejects.toMatchObject({
      code: 'INVENTORY_UNAVAILABLE',
      details: { recoverableInThisAnalysis: false }
    })
    await service.reportFailure(SCOPE, first.jobId, { errorCode: 'INVENTORY_UNAVAILABLE', reason: 'Inventory service unavailable' })
    let detail = await service.getRequestDetail(SCOPE, request.id)
    expect(detail.request.status).toBe('failed')
    expect(detail.currentJob).toMatchObject({ status: 'failed', errorCode: 'INVENTORY_UNAVAILABLE' })

    // 失败任务的迟到写入被拒绝
    await expectCode(service.reportFailure(SCOPE, first.jobId, { errorCode: 'OTHER', reason: 'late' }), 'JOB_NOT_ACTIVE')

    const retry = await service.startAnalysis(SCOPE, request.id)
    expect(retry).toMatchObject({ seq: 2, created: true })
    const inventory = await service.checkInventoryForJob(SCOPE, retry.jobId)
    expect(inventory.shortageMaterialCodes).toEqual(['S-211'])
    const options = await service.getSupplyOptionsForJob(SCOPE, retry.jobId, ['S-211'])
    expect(options.materials[0]).toMatchObject({ leadTimeDays: 20, earliestAvailableDate: '2026-12-02', substitutes: [] })
    await service.saveFinding(SCOPE, retry.jobId, {
      materialCode: 'S-211',
      suggestionType: 'reschedule',
      suggestedDate: '2026-12-02',
      rationale: 'S-211 short by 20; a new order takes 20 days, earliest 2026-12-02.'
    })
    await service.finalizeAnalysis(SCOPE, retry.jobId, { feasibility: 'infeasible', recommendedDate: '2026-12-02', summary: 'Earliest 12-02.' })

    detail = await service.getRequestDetail(SCOPE, request.id)
    expect(detail.request.status).toBe('pending_review')
    expect(detail.jobs.map((job) => [job.seq, job.status])).toEqual([
      [1, 'failed'],
      [2, 'succeeded']
    ])
    // 界面只展示当前任务（第 2 次）的结论
    expect(detail.findings.every((item) => item.jobId === retry.jobId)).toBe(true)
    // 旧任务不能再写入
    await expectCode(service.saveFinding(SCOPE, first.jobId, { materialCode: 'S-211', suggestionType: 'no_action', rationale: 'stale job write' }), 'JOB_NOT_ACTIVE')
  })

  it('marks a running analysis as failed after three minutes, lazily on read', async () => {
    const request = await seedAndFind('SO-1024')
    const { jobId } = await service.startAnalysis(SCOPE, request.id)
    await service.getAnalysisContext(SCOPE, jobId)
    clock.advance(ANALYSIS_TIMEOUT_MS - 1000)
    expect((await service.getRequestDetail(SCOPE, request.id)).request.status).toBe('analyzing')
    clock.advance(2000)
    const detail = await service.getRequestDetail(SCOPE, request.id)
    expect(detail.request.status).toBe('failed')
    expect(detail.currentJob).toMatchObject({ status: 'failed', errorCode: 'ANALYSIS_TIMEOUT' })
    await expectCode(service.explodeBomForJob(SCOPE, jobId), 'JOB_NOT_ACTIVE')
    // 超时后可以重试
    expect(await service.startAnalysis(SCOPE, request.id)).toMatchObject({ seq: 2, created: true })
  })

  it('allows re-analysis after the planner rejects an analysis', async () => {
    const request = await seedAndFind('SO-1024')
    const { jobId } = await service.startAnalysis(SCOPE, request.id)
    await runSo1024Analysis(jobId)
    expect(await service.rejectAnalysis(SCOPE, { requestId: request.id, reason: 'Need supplier confirmation' })).toMatchObject({ status: 'rejected' })
    const again = await service.startAnalysis(SCOPE, request.id)
    expect(again).toMatchObject({ seq: 2, created: true })
    const detail = await service.getRequestDetail(SCOPE, request.id)
    expect(detail.request.status).toBe('analyzing')
    expect(detail.findings).toEqual([])
  })
  it('lets the planner abandon a stuck analysis and retry immediately', async () => {
    const request = await seedAndFind('SO-1024')
    const first = await service.startAnalysis(SCOPE, request.id)
    await service.getAnalysisContext(SCOPE, first.jobId)
    clock.advance(40 * 1000)
    // 任务 ID 对不上（例如界面还停在旧任务）时拒绝
    await expectCode(service.abandonAnalysis(SCOPE, { requestId: request.id, jobId: request.id }), 'INVALID_STATE')
    expect(await service.abandonAnalysis(SCOPE, { requestId: request.id, jobId: first.jobId })).toMatchObject({ status: 'failed' })
    const detail = await service.getRequestDetail(SCOPE, request.id)
    expect(detail.request.status).toBe('failed')
    expect(detail.currentJob).toMatchObject({ status: 'failed', errorCode: 'ANALYSIS_ABANDONED' })
    expect(detail.logs[0]).toMatchObject({ actor: 'user', action: 'analysis_failed' })
    // 第二次放弃、智能体的迟到写入都被拒绝
    await expectCode(service.abandonAnalysis(SCOPE, { requestId: request.id, jobId: first.jobId }), 'INVALID_STATE')
    await expectCode(service.explodeBomForJob(SCOPE, first.jobId), 'JOB_NOT_ACTIVE')
    // 不用等 3 分钟，立即可以重试
    expect(await service.startAnalysis(SCOPE, request.id)).toMatchObject({ seq: 2, created: true })
  })

  it('records a timed-out analysis as timeout rather than abandoned', async () => {
    const request = await seedAndFind('SO-1024')
    const { jobId } = await service.startAnalysis(SCOPE, request.id)
    clock.advance(ANALYSIS_TIMEOUT_MS + 1000)
    await expectCode(service.abandonAnalysis(SCOPE, { requestId: request.id, jobId }), 'INVALID_STATE')
    expect((await service.getRequestDetail(SCOPE, request.id)).currentJob).toMatchObject({ errorCode: 'ANALYSIS_TIMEOUT' })
  })
})
