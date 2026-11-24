import { createTestDataSource, reconnectTestDataSource } from '../testing/test-data-source'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import { ChangeProposal, DeliveryChangeLog, OrderLine, SupplierReply } from './entities'
import { DEMO_REPLIES } from './demo-data'
import { SupplierDeliveryFollowupService } from './supplier-delivery-followup.service'
import type { DeliveryScope, SaveProposalInput } from './types'

const scope: DeliveryScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'buyer-a' }
const rawText = DEMO_REPLIES.find((reply) => reply.kind === 'single_delay')!.rawText

describe('Supplier delivery persistence (real TypeORM)', () => {
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
  beforeEach(async () => {
    db = createTestDataSource()
    await db.initialize()
    service = newService()
    await service.importDemoData(scope)
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    if (db.isInitialized) await db.destroy()
  })
  function input(replyId: string, lineNo = 1): SaveProposalInput {
    return {
      replyId,
      poNumber: 'DEMO-001',
      lineNo,
      changeType: 'delay',
      proposedDate: '2026-11-28',
      confidence: 0.9,
      evidence: [{ field: 'poNumber', quote: 'DEMO-001' }]
    }
  }
  async function reviewed() {
    const { reply } = await service.createReply(rawText, scope)
    await service.requestParse(reply.id, scope)
    await service.saveProposal(input(reply.id, 1), scope)
    await service.saveProposal(input(reply.id, 2), scope)
    // Include a rejected proposal to prove decisions alone are not a write count.
    await service.saveProposal({ ...input(reply.id), poNumber: 'DEMO-002' }, scope)
    await service.finalizeParse(reply.id, '两条采纳、一条驳回', scope)
    const detail = await service.getReply(reply.id, scope)
    for (const proposal of detail.proposals) {
      const order = await service.getOrderLine(proposal.orderLineId, scope)
      await service.decideProposal(
        proposal.id,
        order.poNumber === 'DEMO-002' ? 'rejected' : 'accepted',
        undefined,
        undefined,
        scope
      )
    }
    return reply.id
  }

  it.each(['首位跟单员', undefined])(
    'supplier-delivery-followup 验收 13: 确认显示名 %s 在回复与日志持久化，省略时为 null',
    async (actorName) => {
      const replyId = await reviewed()
      const expectedName = actorName ?? null
      expect(await service.confirmReply(replyId, scope.userId, scope, actorName)).toMatchObject({
        status: 'confirmed',
        appliedCount: 2,
        confirmedBy: scope.userId,
        confirmedByName: expectedName
      })
      db = await reconnectTestDataSource(db)
      service = newService()
      expect(await service.getReply(replyId, scope)).toMatchObject({
        confirmationActorId: scope.userId,
        confirmationActorName: expectedName,
        confirmedByName: expectedName
      })
      const logs = await db.getRepository(DeliveryChangeLog).findBy({ replyId })
      expect(logs).toHaveLength(2)
      for (const log of logs) expect(log).toMatchObject({ confirmedBy: scope.userId, confirmedByName: expectedName })
      expect(
        await service.confirmReply(replyId, 'buyer-b', { ...scope, userId: 'buyer-b' }, '后来的名字')
      ).toMatchObject({
        appliedCount: 0,
        confirmedBy: scope.userId,
        confirmedByName: expectedName
      })
    }
  )

  it.each([
    { stage: 'log', actorName: '首位跟单员' },
    { stage: 'proposal', actorName: '首位跟单员' },
    { stage: 'log', actorName: null },
    { stage: 'proposal', actorName: null }
  ])(
    'supplier-delivery-followup 验收 13: $stage 中断后换人重试保留首次显示名 $actorName',
    async ({ stage, actorName }) => {
      const replyId = await reviewed()
      if (stage === 'log') {
        jest.spyOn(db.getRepository(DeliveryChangeLog), 'insert').mockRejectedValueOnce(new Error('interrupted'))
      } else {
        const repo = db.getRepository(ChangeProposal)
        const update = repo.update.bind(repo)
        jest.spyOn(repo, 'update').mockImplementation(async (where, values) => {
          if (
            values.confirmationState === 'confirmed' &&
            (await db.getRepository(OrderLine).countBy({ revision: 1 })) === 1
          ) {
            throw new Error('interrupted')
          }
          return update(where, values)
        })
      }
      await expect(service.confirmReply(replyId, scope.userId, scope, actorName)).rejects.toThrow('interrupted')
      expect(await db.getRepository(SupplierReply).findOneByOrFail({ id: replyId })).toMatchObject({
        confirmationActorId: scope.userId,
        confirmationActorName: actorName,
        confirmedByName: null
      })
      jest.restoreAllMocks()
      db = await reconnectTestDataSource(db)
      const result = await newService().confirmReply(
        replyId,
        'buyer-b',
        { ...scope, userId: 'buyer-b' },
        '另一位跟单员'
      )
      expect(result).toMatchObject({
        status: 'confirmed',
        confirmedBy: scope.userId,
        confirmedByName: actorName,
        appliedCount: 1
      })
      const logs = await db.getRepository(DeliveryChangeLog).findBy({ replyId })
      expect(logs).toHaveLength(2)
      for (const log of logs) expect(log).toMatchObject({ confirmedBy: scope.userId, confirmedByName: actorName })
      expect(await db.getRepository(OrderLine).countBy({ revision: 1 })).toBe(2)
    }
  )

  it('supplier-delivery-followup 验收 8: 回复、提议、审核、收尾、失败重试和确认均持久化真实 updatedAt', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-01T00:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] })
    const { reply } = await service.createReply(rawText, scope)
    expect(reply.updatedAt).toBe(reply.createdAt)
    let last = reply.updatedAt
    async function change(run: () => Promise<unknown>) {
      jest.setSystemTime(Date.now() + 60_000)
      await run()
      const saved = await db.getRepository(SupplierReply).findOneByOrFail({ id: reply.id })
      expect(saved.updatedAt).toBe(new Date().toISOString())
      expect(saved.updatedAt > last).toBe(true)
      expect(saved.createdAt).toBe(reply.createdAt)
      last = saved.updatedAt
    }
    await change(() => service.requestParse(reply.id, scope))
    await change(() => service.saveProposal(input(reply.id), scope))
    const proposal = (await service.getReply(reply.id, scope)).proposals[0]
    await change(() => service.saveProposal({ ...input(reply.id), proposedDate: '2026-11-29' }, scope))
    await change(() => service.finalizeParse(reply.id, '解析完成', scope))
    await change(() => service.decideProposal(proposal.id, 'accepted', undefined, undefined, scope))
    await change(() => service.decideProposal(proposal.id, 'edited', '2026-11-30', undefined, scope))
    await change(() => service.decideProposal(proposal.id, 'rejected', undefined, undefined, scope))
    await change(() => service.requestParse(reply.id, scope))
    await change(() => service.reportParseFailure(reply.id, 'other', '需要重试', scope))
    await change(() => service.retryParse(reply.id, scope))
    await change(() => service.saveProposal(input(reply.id), scope))
    await change(() => service.finalizeParse(reply.id, '重新解析完成', scope))
    await change(() => service.decideProposal(proposal.id, 'accepted', undefined, undefined, scope))
    await change(async () => expect((await service.confirmReply(reply.id, scope.userId, scope)).appliedCount).toBe(1))
    jest.setSystemTime(Date.now() + 60_000)
    expect((await service.confirmReply(reply.id, scope.userId, scope)).appliedCount).toBe(0)
    expect((await service.createReply(rawText, scope)).created).toBe(false)
    await expect(service.requestParse(reply.id, scope)).rejects.toMatchObject({ code: 'reply_locked' })
    expect((await service.getReply(reply.id, scope)).updatedAt).toBe(last)
    db = await reconnectTestDataSource(db)
    expect((await newService().getReply(reply.id, scope)).updatedAt).toBe(last)
  })

  it('supplier-delivery-followup 验收 7: 两个服务并发确认的计数之和等于实际更新行数，驳回和重复不计数', async () => {
    const replyId = await reviewed()
    const results = await Promise.all([
      service.confirmReply(replyId, scope.userId, scope),
      newService().confirmReply(replyId, scope.userId, scope)
    ])
    const changed = await db.getRepository(OrderLine).countBy({ revision: 1 })
    expect(changed).toBe(2)
    expect(results.reduce((sum, result) => sum + result.appliedCount, 0)).toBe(changed)
    expect(results.every((result) => result.status === 'confirmed')).toBe(true)
    expect(await db.getRepository(DeliveryChangeLog).count()).toBe(changed)
    expect((await service.confirmReply(replyId, scope.userId, scope)).appliedCount).toBe(0)
  })

  it.each(['log', 'proposal'] as const)(
    'supplier-delivery-followup 验收 7: 首行已写但 %s 阶段中断，重建服务后只计剩余订单',
    async (stage) => {
      const replyId = await reviewed()
      if (stage === 'log') {
        jest.spyOn(db.getRepository(DeliveryChangeLog), 'insert').mockRejectedValueOnce(new Error('interrupted'))
      } else {
        const repo = db.getRepository(ChangeProposal)
        const update = repo.update.bind(repo)
        jest.spyOn(repo, 'update').mockImplementation(async (where, values) => {
          // Rejected proposals may sort first; stop after an actual order write.
          if (
            values.confirmationState === 'confirmed' &&
            (await db.getRepository(OrderLine).countBy({ revision: 1 })) === 1
          ) {
            throw new Error('interrupted')
          }
          return update(where, values)
        })
      }
      await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toThrow('interrupted')
      expect(await db.getRepository(OrderLine).countBy({ revision: 1 })).toBe(1)
      jest.restoreAllMocks()
      const result = await newService().confirmReply(replyId, 'buyer-b', { ...scope, userId: 'buyer-b' })
      expect(result).toMatchObject({ status: 'confirmed', confirmedBy: scope.userId, appliedCount: 1 })
      expect(await db.getRepository(OrderLine).countBy({ revision: 1 })).toBe(2)
      expect(await db.getRepository(DeliveryChangeLog).count()).toBe(2)
      expect((await service.confirmReply(replyId, scope.userId, scope)).appliedCount).toBe(0)
    }
  )
})
