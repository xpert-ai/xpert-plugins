import { createTestDataSource, reconnectTestDataSource } from '../testing/test-data-source'
import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { ChangeProposal, DeliveryChangeLog, ENTITIES, OrderLine, SupplierReply } from './entities'
import { DEMO_ORDER_LINES, DEMO_REPLIES } from './demo-data'
import { DeliveryDomainError } from './domain-error'
import { SupplierDeliveryFollowupService, PARSE_TIMEOUT_MS } from './supplier-delivery-followup.service'
import type { DeliveryScope, SaveProposalInput } from './types'

const scope: DeliveryScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'buyer-a' }
const RAW_TEXT = DEMO_REPLIES.find((reply) => reply.kind === 'single_delay')!.rawText

describe('SupplierDeliveryFollowupService (real TypeORM)', () => {
  let db: DataSource
  let service: SupplierDeliveryFollowupService

  function newService() {
    return new SupplierDeliveryFollowupService(
      db.getRepository(OrderLine),
      db.getRepository(SupplierReply),
      db.getRepository(ChangeProposal),
      db.getRepository(DeliveryChangeLog)
    )
  }
  async function open() {
    db = createTestDataSource()
    await db.initialize()
    service = newService()
  }
  beforeEach(async () => {
    await open()
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    if (db.isInitialized) await db.destroy()
  })

  async function start(text: string = RAW_TEXT, caller = scope) {
    await service.importDemoData(caller)
    const { reply } = await service.createReply(text, caller)
    await service.requestParse(reply.id, caller)
    return reply.id
  }
  function input(replyId: string, overrides: Partial<SaveProposalInput> = {}): SaveProposalInput {
    return {
      replyId,
      poNumber: 'DEMO-001',
      lineNo: 1,
      changeType: 'delay',
      proposedDate: '2026-11-28',
      proposedQuantity: 100,
      reason: '设备检修',
      confidence: 0.9,
      evidence: [
        { field: 'poNumber', quote: 'DEMO-001' },
        { field: 'proposedDate', quote: '2026-11-28' },
        { field: 'proposedQuantity', quote: '100件' },
        { field: 'reason', quote: '设备检修' }
      ],
      ...overrides
    }
  }
  async function reviewed(text: string = RAW_TEXT, caller = scope) {
    const replyId = await start(text, caller)
    const { proposalId } = await service.saveProposal(input(replyId), caller)
    await service.finalizeParse(replyId, '交期延期', caller)
    const proposal = await service.decideProposal(proposalId, 'accepted', undefined, undefined, caller)
    return { replyId, proposalId, orderLineId: proposal.orderLineId }
  }

  it.each([
    ['delay', '2026-11-21', '2026-11-19', 'advance'],
    ['advance', '2026-11-19', '2026-11-21', 'delay'],
    ['unchanged', '2026-11-20', '2026-11-21', 'delay']
  ] as const)(
    'change type: %s must match the current promised date',
    async (changeType, validDate, invalidDate, expected) => {
      const replyId = await start()
      await service.saveProposal(input(replyId, { changeType, proposedDate: validDate }), scope)
      const before = await service.getReply(replyId, scope)
      expect(before.proposals[0]).toMatchObject({ changeType, proposedDate: validDate })
      await expect(
        service.saveProposal(input(replyId, { changeType, proposedDate: invalidDate }), scope)
      ).rejects.toMatchObject({
        code: 'invalid_change_type',
        params: { field: 'changeType', value: changeType, expected },
        nextAction: expect.stringContaining('promisedDate')
      })
      expect(await service.getReply(replyId, scope)).toEqual(before)
    }
  )

  it('change type: compares against current promisedDate, and partial bypasses the comparison', async () => {
    const replyId = await start()
    await db
      .getRepository(OrderLine)
      .update({ poNumber: 'DEMO-001', lineNo: 1 }, { promisedDate: '2026-12-01', revision: 1 })
    await service.saveProposal(input(replyId, { changeType: 'advance' }), scope)
    expect((await service.getReply(replyId, scope)).proposals[0]).toMatchObject({
      orderLineDate: '2026-12-01',
      changeType: 'advance'
    })
    await expect(service.saveProposal(input(replyId), scope)).rejects.toMatchObject({
      code: 'invalid_change_type',
      params: { field: 'changeType', value: 'delay', expected: 'advance' }
    })
    for (const date of ['2026-11-30', '2026-12-01', '2026-12-02']) {
      await service.saveProposal(
        input(replyId, {
          changeType: 'partial',
          proposedDate: undefined,
          batches: [
            { date: '2026-11-19', quantity: 40 },
            { date, quantity: 60 }
          ]
        }),
        scope
      )
      expect((await service.getReply(replyId, scope)).proposals[0]).toMatchObject({
        changeType: 'partial',
        proposedDate: date
      })
    }
  })

  it.each(['draft', 'applying'] as const)(
    'supplier-delivery-followup 验收 7: interrupted R rejects stale %s P2 after S changes L2 and resumes once',
    async (state) => {
      const replyId = await start()
      await service.saveProposal(input(replyId), scope)
      await service.saveProposal(input(replyId, { lineNo: 2 }), scope)
      await service.finalizeParse(replyId, 'R', scope)
      const [p1, p2] = (await service.getReply(replyId, scope)).proposals
      for (const p of [p1, p2]) await service.decideProposal(p.id, 'accepted', undefined, undefined, scope)
      const l2 = await service.getOrderLine(p2.orderLineId, scope)
      const secondId = await start(`${RAW_TEXT}\nS`)
      const second = await service.saveProposal(
        input(secondId, { poNumber: l2.poNumber, lineNo: l2.lineNo, proposedDate: '2026-12-01' }),
        scope
      )
      await service.finalizeParse(secondId, 'S', scope)
      await service.decideProposal(second.proposalId, 'accepted', undefined, undefined, scope)
      if (state === 'applying') {
        const repo = db.getRepository(OrderLine)
        const update = repo.update.bind(repo)
        let writes = 0
        jest.spyOn(repo, 'update').mockImplementation(async (where, values) => {
          if (++writes === 2) throw new Error('P2 interrupted')
          return update(where, values)
        })
      } else {
        const repo = db.getRepository(ChangeProposal)
        const update = repo.update.bind(repo)
        jest.spyOn(repo, 'update').mockImplementation(async (where, values) => {
          if (
            values.confirmationState === 'applying' &&
            (await db.getRepository(OrderLine).countBy({ revision: 1 })) === 1
          ) {
            throw new Error('P2 interrupted')
          }
          return update(where, values)
        })
      }
      await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toThrow('P2 interrupted')
      jest.restoreAllMocks()
      expect(await db.getRepository(ChangeProposal).findOneByOrFail({ id: p2.id })).toMatchObject({
        confirmationState: state
      })
      const frozen = await service.getReply(replyId, scope)
      for (const run of [
        () => service.requestParse(replyId, scope),
        () => service.retryParse(replyId, scope),
        () => service.saveProposal(input(replyId), scope),
        () => service.finalizeParse(replyId, 'overwrite', scope),
        () => service.reportParseFailure(replyId, 'other', 'overwrite', scope)
      ])
        await expect(run()).rejects.toMatchObject({ code: 'confirmation_in_progress', params: { replyId } })
      // P2 is still current; rejection must remain locked until S actually changes L2.
      await expect(service.decideProposal(p2.id, 'rejected', undefined, undefined, scope)).rejects.toMatchObject({
        code: 'confirmation_in_progress',
        params: { replyId, proposalId: p2.id }
      })
      expect(await service.getReply(replyId, scope)).toEqual(frozen)
      await service.confirmReply(secondId, scope.userId, scope)
      await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toMatchObject({
        code: 'order_line_changed'
      })
      for (const [id, decision, date, quantity] of [
        [p2.id, 'accepted', undefined, undefined],
        [p2.id, 'edited', '2026-12-02', undefined],
        [p1.id, 'rejected', undefined, undefined],
        [p2.id, 'rejected', '2026-12-02', undefined],
        [p2.id, 'rejected', undefined, 50]
      ] as const)
        await expect(service.decideProposal(id, decision, date, quantity, scope)).rejects.toMatchObject({
          code: 'confirmation_in_progress',
          params: { replyId, proposalId: id }
        })
      const before = await db.getRepository(ChangeProposal).findOneByOrFail({ id: p2.id })
      const oldTime = '2026-01-01T00:00:00.000Z'
      await db.getRepository(SupplierReply).update(replyId, { updatedAt: oldTime })
      expect(await service.decideProposal(p2.id, 'rejected', undefined, undefined, scope)).toMatchObject({
        decision: 'rejected',
        finalDate: null,
        finalQuantity: null,
        revision: before.revision + 1
      })
      expect((await service.getReply(replyId, scope)).updatedAt > oldTime).toBe(true)
      db = await reconnectTestDataSource(db)
      service = newService()
      const result = await service.confirmReply(replyId, scope.userId, scope)
      expect(result).toMatchObject({ status: 'confirmed', appliedCount: 0 })
      expect(result.proposals.find((p) => p.id === p2.id)).toMatchObject({
        decision: 'rejected',
        confirmationState: 'confirmed'
      })
      expect(await service.getOrderLine(p1.orderLineId, scope)).toMatchObject({
        revision: 1,
        promisedDate: '2026-11-28',
        changeLogs: [expect.objectContaining({ replyId, proposalId: p1.id })]
      })
      expect(await service.getOrderLine(p2.orderLineId, scope)).toMatchObject({
        revision: 1,
        promisedDate: '2026-12-01',
        changeLogs: [expect.objectContaining({ replyId: secondId, proposalId: second.proposalId })]
      })
      expect(await db.getRepository(DeliveryChangeLog).count()).toBe(2)
      expect((await service.confirmReply(replyId, scope.userId, scope)).appliedCount).toBe(0)
    }
  )

  it.each(['missing order', 'old attempt', 'concurrent decision'] as const)(
    'frozen rejection: %s respects recovery boundaries',
    async (scenario) => {
      const { replyId, proposalId, orderLineId } = await reviewed()
      jest.spyOn(db.getRepository(OrderLine), 'update').mockRejectedValueOnce(new Error('interrupted'))
      await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toThrow('interrupted')
      jest.restoreAllMocks()
      if (scenario === 'missing order') {
        await db.getRepository(OrderLine).delete(orderLineId)
        await service.decideProposal(proposalId, 'rejected', undefined, undefined, scope)
        const result = await service.confirmReply(replyId, scope.userId, scope)
        expect(result).toMatchObject({
          status: 'confirmed',
          appliedCount: 0,
          proposals: [expect.objectContaining({ decision: 'rejected', confirmationState: 'confirmed' })]
        })
      } else {
        await db.getRepository(OrderLine).update(orderLineId, { revision: 1, lastAppliedProposalId: 'another' })
        const repo = db.getRepository(ChangeProposal)
        if (scenario === 'old attempt') {
          await repo.update(proposalId, { parseAttempt: 0 })
          await expect(
            service.decideProposal(proposalId, 'rejected', undefined, undefined, scope)
          ).rejects.toMatchObject({
            code: 'confirmation_in_progress',
            params: { replyId, proposalId }
          })
        } else {
          const before = await repo.findOneByOrFail({ id: proposalId })
          const update = repo.update.bind(repo)
          jest.spyOn(repo, 'update').mockImplementationOnce(async (where, values) => {
            await update(proposalId, { revision: before.revision + 1 })
            return update(where, values)
          })
          await expect(
            service.decideProposal(proposalId, 'rejected', undefined, undefined, scope)
          ).rejects.toMatchObject({ code: 'concurrent_change' })
        }
        expect(await repo.findOneByOrFail({ id: proposalId })).toMatchObject({
          decision: 'accepted',
          finalDate: '2026-11-28'
        })
      }
      expect(await db.getRepository(DeliveryChangeLog).count()).toBe(0)
    }
  )

  it('supplier-delivery-followup 验收 1: 重复及并发导入均只有12条订单，列表分页和过滤准确', async () => {
    await Promise.all([service.importDemoData(scope), service.importDemoData(scope)])
    expect(await service.importDemoData(scope)).toEqual({ created: 0, total: 12 })
    const first = await service.listOrderLines({ page: 1, pageSize: 5 }, scope)
    const second = await service.listOrderLines({ page: 2, pageSize: 5 }, scope)
    expect(first).toMatchObject({ total: 12, page: 1, pageSize: 5 })
    expect(first.items).toHaveLength(5)
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(10)
    expect(new Set((await service.listOrderLines({}, scope)).items.map((row) => row.supplierName)).size).toBe(3)
    expect((await service.listOrderLines({ keyword: '定位环' }, scope)).items).toEqual([
      expect.objectContaining({ ...DEMO_ORDER_LINES[0], promisedDate: '2026-11-20', delayDays: 0, revision: 0 })
    ])
    expect(
      (await service.listOrderLines({ poNumber: 'DEMO-001', supplierName: DEMO_ORDER_LINES[0].supplierName }, scope))
        .total
    ).toBe(2)
    // Exact lookups ignore case but read the model's text literally: % and _ are not wildcards.
    expect((await service.listOrderLines({ poNumber: 'demo-001' }, scope)).total).toBe(2)
    for (const input of [{ poNumber: 'DEMO-%' }, { poNumber: 'DEMO_001' }, { supplierName: '%' }]) {
      expect((await service.listOrderLines(input, scope)).total).toBe(0)
    }
    await expect(service.listOrderLines({ pageSize: 101 }, scope)).rejects.toMatchObject({ code: 'invalid_page' })
  })

  it('supplier-delivery-followup 验收 2: 忽略首尾空白按SHA256去重，并发创建返回同一回复', async () => {
    const results = await Promise.all([
      service.createReply(RAW_TEXT, scope),
      service.createReply(` \n${RAW_TEXT}\t `, scope)
    ])
    expect(results.map((result) => result.created).sort()).toEqual([false, true])
    expect(results[0].reply.id).toBe(results[1].reply.id)
    expect(results[0].reply.contentHash).toMatch(/^[a-f0-9]{64}$/)
    expect(results[0].reply).toMatchObject({ rawText: RAW_TEXT, status: 'received', createdBy: scope.userId })
    expect((await service.listReplies({}, scope)).total).toBe(1)
    await service.createReply(DEMO_REPLIES.find((reply) => reply.kind === 'no_date')!.rawText, scope)
    expect((await service.listReplies({ pageSize: 1, page: 2 }, scope)).items).toHaveLength(1)
  })

  it('supplier-delivery-followup 验收 2: 空文本和超过5000字被拒绝且不入库', async () => {
    await expect(service.createReply(' \n\t', scope)).rejects.toMatchObject({ code: 'reply_empty' })
    await expect(service.createReply('字'.repeat(5001), scope)).rejects.toMatchObject({
      code: 'reply_too_long',
      params: { maximum: 5000 }
    })
    expect((await service.listReplies({}, scope)).total).toBe(0)
    expect((await service.createReply('字'.repeat(5000), scope)).created).toBe(true)
  })

  it.each([
    ['quote_not_in_reply', { evidence: [{ field: 'reason', quote: '原文没有这句话' }] }],
    ['evidence_required', { evidence: [] }],
    ['order_line_not_found', { poNumber: 'MISSING' }],
    ['order_line_not_found', { lineNo: 999 }],
    ['invalid_date', { proposedDate: '2026-02-30' }],
    ['invalid_date', { proposedDate: undefined }],
    ['invalid_date', { proposedDate: '2026-2-03' }],
    ['invalid_date', { proposedDate: '2025-02-29' }],
    ['invalid_quantity', { proposedQuantity: -1 }],
    ['invalid_batches', { changeType: 'partial', batches: [{ date: '2026-11-28', quantity: 100 }] }]
  ] as [string, Partial<SaveProposalInput>][])(
    'supplier-delivery-followup 验收 5: %s校验失败，提议不入库（%j）',
    async (code, override) => {
      const replyId = await start()
      await expect(service.saveProposal(input(replyId, override), scope)).rejects.toMatchObject({
        name: 'DeliveryDomainError',
        code,
        params: expect.any(Object),
        nextAction: expect.any(String)
      })
      expect((await service.getReply(replyId, scope)).proposals).toHaveLength(0)
      expect(await db.getRepository(ChangeProposal).count()).toBe(0)
    }
  )

  it('supplier-delivery-followup 验收 5: 服务器计算出处偏移，合法闰日可保存，错误覆盖不破坏原提议', async () => {
    const replyId = await start()
    await service.saveProposal(input(replyId, { proposedDate: '2028-02-29' }), scope)
    const before = (await service.getReply(replyId, scope)).proposals[0]
    for (const evidence of before.evidence) expect(RAW_TEXT.slice(evidence.start, evidence.end)).toBe(evidence.quote)
    await expect(service.saveProposal(input(replyId, { proposedDate: 'bad' }), scope)).rejects.toBeInstanceOf(
      DeliveryDomainError
    )
    expect((await service.getReply(replyId, scope)).proposals[0]).toEqual(before)
  })

  it('supplier-delivery-followup 验收 6: 采纳、修改、驳回后订单和审计字段正确，部分到货取最后一批', async () => {
    const replyId = await start(DEMO_REPLIES.map((reply) => reply.rawText).join('\n'))
    const accepted = await service.saveProposal(input(replyId), scope)
    const edited = await service.saveProposal(
      input(replyId, {
        poNumber: 'DEMO-005',
        changeType: 'advance',
        proposedDate: '2026-11-19',
        proposedQuantity: 150
      }),
      scope
    )
    const rejected = await service.saveProposal(input(replyId, { poNumber: 'DEMO-006', lineNo: 2 }), scope)
    const partial = await service.saveProposal(
      input(replyId, {
        poNumber: 'DEMO-003',
        changeType: 'partial',
        proposedDate: '2026-11-24',
        proposedQuantity: 300,
        batches: [
          { date: '2026-12-02', quantity: 200 },
          { date: '2026-11-24', quantity: 100 }
        ]
      }),
      scope
    )
    await service.finalizeParse(replyId, '四条提议', scope)
    await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toMatchObject({
      code: 'review_incomplete'
    })
    await service.decideProposal(accepted.proposalId, 'accepted', undefined, undefined, scope)
    await service.decideProposal(edited.proposalId, 'edited', '2026-11-18', 140, scope)
    await service.decideProposal(rejected.proposalId, 'rejected', undefined, undefined, scope)
    await service.decideProposal(partial.proposalId, 'accepted', undefined, undefined, scope)
    const confirmed = await service.confirmReply(replyId, scope.userId, scope)
    expect(confirmed).toMatchObject({
      status: 'confirmed',
      confirmedBy: scope.userId,
      summary: '四条提议',
      confirmedAt: expect.any(String)
    })
    for (const proposal of confirmed.proposals) {
      const line = await service.getOrderLine(proposal.orderLineId, scope)
      expect(proposal.confirmationState).toBe('confirmed')
      if (proposal.decision === 'rejected') {
        expect(line).toMatchObject({ revision: 0, promisedDate: line.originalDate, changeLogs: [] })
      } else {
        expect(line).toMatchObject({ revision: 1, promisedDate: proposal.finalDate, quantity: proposal.finalQuantity })
        expect(line.changeLogs).toEqual([
          expect.objectContaining({
            oldDate: line.originalDate,
            newDate: proposal.finalDate,
            aiDate: proposal.proposedDate,
            batches: proposal.batches,
            confirmedBy: scope.userId,
            confirmedAt: confirmed.confirmedAt,
            proposalId: proposal.id,
            replyId,
            orderLineId: line.id
          })
        ])
        if (proposal.changeType === 'partial') expect(line.promisedDate).toBe('2026-12-02')
        if (proposal.decision === 'edited')
          expect(line).toMatchObject({ promisedDate: '2026-11-18', quantity: 140, delayDays: -8 })
      }
    }
    expect(await db.getRepository(DeliveryChangeLog).count()).toBe(3)
  })

  it('supplier-delivery-followup 验收 7: 连续和并发重复确认只改变一次订单并只写一条日志', async () => {
    const { replyId, orderLineId } = await reviewed()
    await Promise.all([
      service.confirmReply(replyId, scope.userId, scope),
      service.confirmReply(replyId, scope.userId, scope)
    ])
    await service.confirmReply(replyId, scope.userId, scope)
    const line = await service.getOrderLine(orderLineId, scope)
    expect(line).toMatchObject({ revision: 1, promisedDate: '2026-11-28', delayDays: 8 })
    expect(line.changeLogs).toHaveLength(1)
  })

  it('supplier-delivery-followup 验收 7: 订单更新后日志写入中断，重建服务重试保留旧交期且只生效一次', async () => {
    const { replyId, orderLineId, proposalId } = await reviewed()
    const insert = jest
      .spyOn(db.getRepository(DeliveryChangeLog), 'insert')
      .mockRejectedValueOnce(new Error('simulated interruption'))
    await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toThrow('simulated interruption')
    expect(await service.getOrderLine(orderLineId, scope)).toMatchObject({
      revision: 1,
      promisedDate: '2026-11-28',
      changeLogs: []
    })
    await expect(service.requestParse(replyId, scope)).rejects.toMatchObject({ code: 'confirmation_in_progress' })
    await expect(service.decideProposal(proposalId, 'rejected', undefined, undefined, scope)).rejects.toMatchObject({
      code: 'confirmation_in_progress'
    })
    insert.mockRestore()
    service = newService()
    await service.confirmReply(replyId, scope.userId, scope)
    const line = await service.getOrderLine(orderLineId, scope)
    expect(line.revision).toBe(1)
    expect(line.changeLogs).toEqual([expect.objectContaining({ oldDate: '2026-11-20', newDate: '2026-11-28' })])
  })

  it('supplier-delivery-followup 验收 7: 日志已写而提议状态更新中断，唯一键冲突按已完成恢复', async () => {
    const { replyId, orderLineId } = await reviewed()
    const repo = db.getRepository(ChangeProposal)
    const update = repo.update.bind(repo)
    const interrupted = jest.spyOn(repo, 'update').mockImplementation(async (where, values) => {
      if (values.confirmationState === 'confirmed') throw new Error('state interruption')
      return update(where, values)
    })
    await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toThrow('state interruption')
    expect((await service.getOrderLine(orderLineId, scope)).changeLogs).toHaveLength(1)
    interrupted.mockRestore()
    await service.confirmReply(replyId, scope.userId, scope)
    expect(await service.getOrderLine(orderLineId, scope)).toMatchObject({
      revision: 1,
      changeLogs: [expect.any(Object)]
    })
  })

  it('supplier-delivery-followup 验收 7: 两份回复基于同一订单版本，后确认者返回order_line_changed且不覆盖', async () => {
    const first = await reviewed()
    const second = await reviewed(`${RAW_TEXT}\n第二次通知`)
    await service.confirmReply(first.replyId, scope.userId, scope)
    await expect(service.confirmReply(second.replyId, scope.userId, scope)).rejects.toMatchObject({
      code: 'order_line_changed'
    })
    const line = await service.getOrderLine(first.orderLineId, scope)
    expect(line).toMatchObject({ revision: 1, lastAppliedProposalId: first.proposalId })
    expect(line.changeLogs).toHaveLength(1)
    expect(await service.getReply(second.replyId, scope)).toMatchObject({
      status: 'pending_review',
      confirmationStartedAt: null
    })
    await service.requestParse(second.replyId, scope)
    await service.saveProposal(input(second.replyId, { proposedDate: '2026-12-01' }), scope)
    expect((await service.getReply(second.replyId, scope)).proposals[0]).toMatchObject({
      orderLineRevision: 1,
      orderLineDate: '2026-11-28'
    })
  })

  it('supplier-delivery-followup 验收 8: 导出数据库后关闭重开，回复、提议、审核、交期和日志完整恢复', async () => {
    const { replyId, orderLineId } = await reviewed()
    await service.confirmReply(replyId, scope.userId, scope)
    const expectedReply = await service.getReply(replyId, scope)
    const expectedLine = await service.getOrderLine(orderLineId, scope)
    db = await reconnectTestDataSource(db)
    service = newService()
    expect(await service.getReply(replyId, scope)).toEqual(expectedReply)
    expect(await service.getOrderLine(orderLineId, scope)).toEqual(expectedLine)
    await service.confirmReply(replyId, scope.userId, scope)
    expect(await service.getOrderLine(orderLineId, scope)).toEqual(expectedLine)
  })

  it('supplier-delivery-followup 验收 10: 超过配置时限读取判定超时，重试覆盖同一提议并隐藏旧轮次', async () => {
    const replyId = await start()
    const first = await service.saveProposal(input(replyId), scope)
    await service.saveProposal(input(replyId, { lineNo: 2 }), scope)
    const reply = await service.getReply(replyId, scope)
    const now = jest.spyOn(Date, 'now').mockReturnValue(Date.parse(reply.parseRequestedAt!) + PARSE_TIMEOUT_MS)
    expect((await service.getReply(replyId, scope)).parseTimedOut).toBe(false)
    await expect(service.retryParse(replyId, scope)).rejects.toMatchObject({ code: 'parse_not_retryable' })
    now.mockReturnValue(Date.parse(reply.parseRequestedAt!) + PARSE_TIMEOUT_MS + 1)
    expect((await service.getReply(replyId, scope)).parseTimedOut).toBe(true)
    expect((await service.listReplies({}, scope)).items[0]).toMatchObject({ status: 'parsing', parseTimedOut: true })
    now.mockRestore()
    // Persist a real past timestamp so requestParse/retryParse run against the same timeout.
    await db
      .getRepository(SupplierReply)
      .update({ id: replyId }, { parseRequestedAt: new Date(Date.now() - PARSE_TIMEOUT_MS - 1000).toISOString() })
    const retried = await service.retryParse(replyId, scope)
    expect(retried).toMatchObject({ parseAttempt: 2, parseTimedOut: false, proposals: [] })
    await expect(service.finalizeParse(replyId, '旧提议不能用于新轮次', scope)).rejects.toMatchObject({
      code: 'no_proposals'
    })
    const replaced = await service.saveProposal(input(replyId, { proposedDate: '2026-11-30' }), scope)
    expect(replaced).toMatchObject({ proposalId: first.proposalId, created: false })
    expect((await service.getReply(replyId, scope)).proposals).toEqual([
      expect.objectContaining({
        id: first.proposalId,
        parseAttempt: 2,
        proposedDate: '2026-11-30',
        decision: 'pending'
      })
    ])
    expect(await db.getRepository(ChangeProposal).count()).toBe(2)
  })

  it('supplier-delivery-followup 验收 10: 上报失败保存原因并允许重试，confirmed拒绝所有解析和审核写入', async () => {
    const emptyReply = await start(DEMO_REPLIES.find((reply) => reply.kind === 'no_date')!.rawText)
    await expect(service.finalizeParse(emptyReply, '无日期', scope)).rejects.toMatchObject({ code: 'no_proposals' })
    await service.reportParseFailure(emptyReply, 'no_delivery_info', '回复没有提供交期', scope)
    expect(await service.getReply(emptyReply, scope)).toMatchObject({
      status: 'needs_followup',
      failureCode: 'no_delivery_info',
      failureMessage: '回复没有提供交期'
    })
    expect(await service.retryParse(emptyReply, scope)).toMatchObject({
      status: 'parsing',
      parseAttempt: 2,
      failureCode: null,
      failureMessage: null
    })
    await db.getRepository(SupplierReply).update({ id: emptyReply }, { status: 'failed' })
    expect((await service.retryParse(emptyReply, scope)).parseAttempt).toBe(3)
    const { replyId, proposalId } = await reviewed()
    await service.confirmReply(replyId, scope.userId, scope)
    const expected = await service.getReply(replyId, scope)
    for (const action of [
      () => service.requestParse(replyId, scope),
      () => service.retryParse(replyId, scope),
      () => service.saveProposal(input(replyId), scope),
      () => service.finalizeParse(replyId, '覆盖', scope),
      () => service.reportParseFailure(replyId, 'other', '覆盖', scope),
      () => service.decideProposal(proposalId, 'rejected', undefined, undefined, scope)
    ])
      await expect(action()).rejects.toMatchObject({ code: 'reply_locked' })
    expect(await service.getReply(replyId, scope)).toEqual(expected)
  })

  it.each([
    { ...scope, tenantId: 'tenant-b' },
    { ...scope, organizationId: 'org-b' },
    { ...scope, tenantId: 'tenant-b', organizationId: 'org-b' },
    { ...scope, organizationId: null }
  ])('supplier-delivery-followup 验收 12: 改变tenant或organization后不能查改其他范围的数据（%j）', async (other) => {
    const { replyId, orderLineId, proposalId } = await reviewed()
    expect((await service.listOrderLines({}, other)).total).toBe(0)
    expect((await service.listReplies({}, other)).total).toBe(0)
    await expect(service.getOrderLine(orderLineId, other)).rejects.toMatchObject({ code: 'order_line_not_found' })
    for (const action of [
      () => service.getReply(replyId, other),
      () => service.requestParse(replyId, other),
      () => service.retryParse(replyId, other),
      () => service.saveProposal(input(replyId), other),
      () => service.finalizeParse(replyId, '错误范围', other),
      () => service.reportParseFailure(replyId, 'other', '错误范围', other),
      () => service.confirmReply(replyId, other.userId, other)
    ])
      await expect(action()).rejects.toMatchObject({ code: 'reply_not_found' })
    await expect(service.decideProposal(proposalId, 'accepted', undefined, undefined, other)).rejects.toMatchObject({
      code: 'proposal_not_found'
    })
    const own = await service.createReply(RAW_TEXT, other)
    expect(own.created).toBe(true)
    expect(own.reply.id).not.toBe(replyId)
    await service.requestParse(own.reply.id, other)
    await expect(service.saveProposal(input(own.reply.id), other)).rejects.toMatchObject({
      code: 'order_line_not_found'
    })
    expect((await service.getOrderLine(orderLineId, scope)).revision).toBe(0)
    expect(await service.importDemoData(other)).toEqual({ created: 12, total: 12 })
    expect((await service.listOrderLines({}, scope)).total).toBe(12)
  })

  it('supplier-delivery-followup 验收 12: 空组织精确隔离且并发幂等，缺失tenant拒绝执行', async () => {
    const tenantScope = { ...scope, organizationId: null }
    await Promise.all([service.importDemoData(tenantScope), service.importDemoData(tenantScope)])
    expect((await service.listOrderLines({}, tenantScope)).total).toBe(12)
    const replies = await Promise.all([
      service.createReply(RAW_TEXT, tenantScope),
      service.createReply(RAW_TEXT, tenantScope)
    ])
    expect(replies[0].reply.id).toBe(replies[1].reply.id)
    const { replyId, orderLineId } = await reviewed(RAW_TEXT, tenantScope)
    await Promise.all([
      service.confirmReply(replyId, scope.userId, tenantScope),
      service.confirmReply(replyId, scope.userId, tenantScope)
    ])
    expect((await service.getOrderLine(orderLineId, tenantScope)).changeLogs).toHaveLength(1)
    await expect(service.listOrderLines({}, { ...scope, tenantId: '' })).rejects.toMatchObject({
      code: 'invalid_scope'
    })
    expect((await service.listOrderLines({}, scope)).total).toBe(0)
  })

  it('supplier-delivery-followup 验收 7: 真实数据库执行版本条件更新和四张表唯一约束，实体表名正确', async () => {
    const { replyId, orderLineId } = await reviewed()
    expect(db.entityMetadatas.map((meta) => meta.tableName).sort()).toEqual([
      'plugin_supplier_delivery_change_log',
      'plugin_supplier_delivery_order_line',
      'plugin_supplier_delivery_proposal',
      'plugin_supplier_delivery_reply'
    ])
    expect(
      (await db.getRepository(OrderLine).update({ id: orderLineId, revision: 999 }, { promisedDate: '2026-12-01' }))
        .affected
    ).toBe(0)
    await service.confirmReply(replyId, scope.userId, scope)
    for (const entity of ENTITIES) {
      const repo = db.getRepository(entity)
      const row = await repo.findOneByOrFail({ tenantId: scope.tenantId, organizationId: scope.organizationId! })
      await expect(repo.insert({ ...row, id: randomUUID() })).rejects.toThrow(
        db.options.type === 'postgres' ? /duplicate key value violates unique constraint/ : /UNIQUE constraint failed/
      )
      const meta = db.getMetadata(entity)
      expect(
        meta.indices.some(
          (index) => index.columns.map((column) => column.propertyName).join(',') === 'tenantId,organizationId'
        )
      ).toBe(true)
      expect(meta.findColumnWithPropertyName('tenantId')?.isNullable).toBe(true)
      expect(meta.findColumnWithPropertyName('organizationId')?.isNullable).toBe(true)
    }
  })
})
