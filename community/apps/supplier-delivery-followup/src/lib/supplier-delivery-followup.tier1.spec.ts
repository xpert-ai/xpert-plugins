import 'reflect-metadata'
import { Logger } from '@nestjs/common'
import { AIMessage, HumanMessage, SystemMessage } from '@langchain/core/messages'
import type { IAgentMiddlewareContext, WrapModelCallHook } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import type { DataSource } from 'typeorm'
import { createTestDataSource } from '../testing/test-data-source'
import { DELIVERY_WORKBENCH_KEY, PARSE_TIMEOUT_MS } from './constants'
import { DEMO_REPLIES } from './demo-data'
import { DeliveryDomainError } from './domain-error'
import { parseCommandText, scopeWhere } from './domain-utils'
import { ChangeProposal, DeliveryChangeLog, OrderLine, SupplierReply } from './entities'
import { SupplierDeliveryFollowupMiddleware } from './supplier-delivery-followup.middleware'
import { SupplierDeliveryFollowupService } from './supplier-delivery-followup.service'
import { SupplierDeliveryFollowupViewProvider } from './supplier-delivery-followup-view.provider'
import type { ReplyStatus, SaveProposalInput } from './types'

const scope: XpertResolvedViewHostContext = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'buyer-a',
  hostType: 'agent',
  hostId: 'assistant-a',
  slots: []
}
const rawText = DEMO_REPLIES.find((reply) => reply.kind === 'single_delay')!.rawText
const proposal = (replyId: string, lineNo = 1): SaveProposalInput => ({
  replyId,
  poNumber: 'DEMO-001',
  lineNo,
  changeType: 'delay',
  proposedDate: '2026-11-28',
  confidence: 0.9,
  evidence: [
    { field: 'poNumber', quote: 'DEMO-001' },
    { field: 'proposedDate', quote: '2026-11-28' }
  ]
})
type ModelRequest = Parameters<WrapModelCallHook>[0]
const request = (messages: ModelRequest['messages'], signal?: AbortSignal) =>
  ({ messages, runtime: { signal } }) as Partial<ModelRequest> as ModelRequest

describe('Supplier delivery tier 1 regression (real TypeORM)', () => {
  let db: DataSource
  let service: SupplierDeliveryFollowupService
  let provider: SupplierDeliveryFollowupViewProvider
  let middleware: ReturnType<SupplierDeliveryFollowupMiddleware['createMiddleware']>
  beforeEach(async () => {
    db = await createTestDataSource().initialize()
    service = new SupplierDeliveryFollowupService(
      db.getRepository(OrderLine),
      db.getRepository(SupplierReply),
      db.getRepository(ChangeProposal),
      db.getRepository(DeliveryChangeLog)
    )
    provider = new SupplierDeliveryFollowupViewProvider(service)
    middleware = new SupplierDeliveryFollowupMiddleware(service).createMiddleware(
      {},
      scope as unknown as IAgentMiddlewareContext
    )
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    if (db?.isInitialized) await db.destroy()
  })
  async function start(text: string = rawText) {
    await service.importDemoData(scope)
    const { reply } = await service.createReply(text, scope)
    return service.requestParse(reply.id, scope)
  }

  it('parse command: a readable first line in the delivery time zone, then the ids the tools need', () => {
    const id = 'a'.repeat(64)
    // 16:30 UTC on the 10th is 00:30 on the 11th in Shanghai.
    expect(parseCommandText({ id, parseAttempt: 2, createdAt: '2026-11-10T16:30:00.000Z' }, 'zh-Hans')).toBe(
      `解析供应商回复（11月11日 00:30 收到，第 2 次）\nreply:${id} attempt:2`
    )
    expect(parseCommandText({ id, parseAttempt: 1, createdAt: '2026-11-11T01:03:00.000Z' }, 'fr')).toBe(
      `Parse supplier reply (received Nov 11, 09:03, attempt 1)\nreply:${id} attempt:1`
    )
  })

  it('supplier-delivery-followup 验收 10: successful model handler returns the same result and changes nothing', async () => {
    const reply = await start()
    const input = request([new HumanMessage(`Parse supplier reply reply:${reply.id} attempt:1`)])
    const result = new AIMessage('done')
    const handler = jest.fn().mockResolvedValue(result)
    expect(await middleware.wrapModelCall(input, handler)).toBe(result)
    expect(handler).toHaveBeenCalledWith(input)
    expect(await service.getReply(reply.id, scope)).toEqual(reply)
  })

  it('supplier-delivery-followup 验收 10: model failure persists immediately, rethrows original, retry_parse replaces one proposal', async () => {
    const older = await start(`${rawText}\n旧回复`)
    const reply = await start()
    const saved = await service.saveProposal(proposal(reply.id), scope)
    const beforeOrders = await db.getRepository(OrderLine).find({ order: { id: 'ASC' } })
    const error = Object.assign(new Error('provider unavailable\ntry later'), {
      headers: { authorization: 'private-header' },
      request: { apiKey: 'private-key' },
      stack: 'private-stack'
    })
    const input = request([
      new HumanMessage(`Parse supplier reply reply:${older.id} attempt:1`),
      new HumanMessage({ content: [{ type: 'text', text: parseCommandText(reply, 'zh-Hans') }] }),
      new AIMessage(`reply:${older.id} attempt:1`),
      new SystemMessage(`reply:${older.id} attempt:1`)
    ])
    await expect(
      middleware.wrapModelCall(input, () => {
        throw error
      })
    ).rejects.toBe(error)
    expect(await service.getReply(reply.id, scope)).toMatchObject({
      status: 'failed',
      failureCode: 'model_failed',
      failureMessage: 'provider unavailable try later',
      parseTimedOut: false
    })
    expect(await service.getReply(older.id, scope)).toEqual(older)
    expect(
      await provider.executeViewAction(scope, DELIVERY_WORKBENCH_KEY, 'retry_parse', {
        targetId: reply.id,
        input: { locale: 'en' }
      })
    ).toEqual({
      success: true,
      data: { replyId: reply.id, parseAttempt: 2 },
      command: {
        commandKey: 'assistant.chat.send_message',
        payload: { text: parseCommandText({ ...reply, parseAttempt: 2 }, 'en'), newThread: true }
      }
    })
    expect(await service.saveProposal(proposal(reply.id), scope)).toMatchObject({
      proposalId: saved.proposalId,
      created: false
    })
    expect(await db.getRepository(ChangeProposal).countBy({ replyId: reply.id })).toBe(1)
    expect((await service.getReply(reply.id, scope)).proposals[0]).toMatchObject({
      id: saved.proposalId,
      parseAttempt: 2
    })
    expect(await db.getRepository(OrderLine).find({ order: { id: 'ASC' } })).toEqual(beforeOrders)
    expect(await db.getRepository(DeliveryChangeLog).count()).toBe(0)
  })

  it.each(['received', 'pending_review', 'confirmed', 'needs_followup', 'failed'] as ReplyStatus[])(
    'supplier-delivery-followup 验收 10: model failure does not mutate status %s',
    async (status) => {
      const reply = await start()
      await db.getRepository(SupplierReply).update(reply.id, { status })
      const before = await service.getReply(reply.id, scope)
      const error = new Error('model error')
      await expect(
        middleware.wrapModelCall(request([new HumanMessage(`reply:${reply.id} attempt:1`)]), async () => {
          throw error
        })
      ).rejects.toBe(error)
      expect(await service.getReply(reply.id, scope)).toEqual(before)
    }
  )

  it.each(['attempt', 'confirmation', 'tenant', 'organization', 'null organization', 'missing reply', 'no id'])(
    'supplier-delivery-followup 验收 10: model failure is a no-op for %s',
    async (reason) => {
      const reply = await start()
      if (reason === 'confirmation')
        await db.getRepository(SupplierReply).update(reply.id, { confirmationStartedAt: new Date().toISOString() })
      const caller = {
        ...scope,
        ...(reason === 'tenant' ? { tenantId: 'other' } : {}),
        ...(reason === 'organization' ? { organizationId: 'other' } : {}),
        ...(reason === 'null organization' ? { organizationId: null } : {})
      }
      const hook = new SupplierDeliveryFollowupMiddleware(service).createMiddleware(
        {},
        caller as unknown as IAgentMiddlewareContext
      ).wrapModelCall
      const before = await service.getReply(reply.id, scope)
      const text =
        reason === 'no id'
          ? '没有回复编号'
          : `reply:${reason === 'missing reply' ? 'f'.repeat(64) : reply.id} attempt:${reason === 'attempt' ? 2 : 1}`
      const error = new Error('model failed')
      await expect(
        hook(request([new HumanMessage(text)]), async () => {
          throw error
        })
      ).rejects.toBe(error)
      expect(await service.getReply(reply.id, scope)).toEqual(before)
    }
  )

  it.each([
    ['the run signal is aborted', new Error('Aborted'), AbortSignal.abort()],
    ['AbortError', Object.assign(new Error('signal is aborted without reason'), { name: 'AbortError' }), undefined]
  ])(
    'supplier-delivery-followup 验收 10: a run stopped in the chat (%s) is recorded as run_stopped without a message',
    async (_label, error, signal) => {
      const reply = await start()
      await expect(
        middleware.wrapModelCall(request([new HumanMessage(`reply:${reply.id} attempt:1`)], signal), async () => {
          throw error
        })
      ).rejects.toBe(error)
      expect(await service.getReply(reply.id, scope)).toMatchObject({
        status: 'failed',
        failureCode: 'run_stopped',
        failureMessage: null
      })
    }
  )

  it('supplier-delivery-followup 验收 10: abort wording alone, while the run signal is live, stays model_failed', async () => {
    const reply = await start()
    const error = new Error('Aborted')
    await expect(
      middleware.wrapModelCall(
        request([new HumanMessage(`reply:${reply.id} attempt:1`)], new AbortController().signal),
        async () => {
          throw error
        }
      )
    ).rejects.toBe(error)
    expect(await service.getReply(reply.id, scope)).toMatchObject({
      status: 'failed',
      failureCode: 'model_failed',
      failureMessage: 'Aborted'
    })
  })

  it('supplier-delivery-followup 验收 10: a provider error that only mentions an abort stays model_failed', async () => {
    const reply = await start()
    const error = new Error('upstream aborted the stream: quota exceeded')
    await expect(
      middleware.wrapModelCall(request([new HumanMessage(`reply:${reply.id} attempt:1`)]), async () => {
        throw error
      })
    ).rejects.toBe(error)
    expect(await service.getReply(reply.id, scope)).toMatchObject({
      status: 'failed',
      failureCode: 'model_failed',
      failureMessage: 'upstream aborted the stream: quota exceeded'
    })
  })

  it('supplier-delivery-followup 验收 10: legacy message without attempt still persists a bounded redacted summary', async () => {
    const reply = await start()
    const error = new Error(
      'timeout\nAuthorization: Bearer private-token\napi_key=private-key\nhttps://provider.invalid/?key=secret\n' +
        '错误'.repeat(200)
    )
    await expect(
      middleware.wrapModelCall(request([new HumanMessage(`reply:${reply.id}`)]), async () => {
        throw error
      })
    ).rejects.toBe(error)
    const failed = await service.getReply(reply.id, scope)
    expect(failed).toMatchObject({ status: 'failed', failureCode: 'model_failed' })
    expect(failed.failureMessage).toHaveLength(300)
    expect(failed.failureMessage).toContain('timeout')
    expect(failed.failureMessage).not.toMatch(/\n|\r|private|secret|Authorization|api_key/)
  })

  it('supplier-delivery-followup 验收 10: persistence failure logs no exception details and rethrows original model error', async () => {
    const reply = await start()
    const warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined)
    jest.spyOn(service, 'reportModelFailure').mockRejectedValueOnce(new Error('private database credentials'))
    const error = new Error('model error')
    await expect(
      middleware.wrapModelCall(request([new HumanMessage(`reply:${reply.id} attempt:1`)]), async () => {
        throw error
      })
    ).rejects.toBe(error)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn).toHaveBeenCalledWith('Could not persist supplier reply model failure.')
    expect(await service.getReply(reply.id, scope)).toEqual(reply)
  })

  it('supplier-delivery-followup 验收 10: concurrent retry wins over a delayed model failure update', async () => {
    const reply = await start()
    const repo = db.getRepository(SupplierReply)
    const update = repo.update.bind(repo)
    jest.spyOn(repo, 'update').mockImplementationOnce(async (where, values) => {
      await update({ ...scopeWhere(scope), id: reply.id }, { parseAttempt: 2, revision: reply.revision + 1 })
      return update(where, values)
    })
    await expect(service.reportModelFailure(reply.id, 1, 'old error', scope)).resolves.toBeUndefined()
    expect(await service.getReply(reply.id, scope)).toMatchObject({
      status: 'parsing',
      parseAttempt: 2,
      failureCode: null,
      failureMessage: null
    })
  })

  it('supplier-delivery-followup 验收 2: deduplicates on the Shanghai day, creates a fresh receivedDate at midnight', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-09T16:00:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
    const first = await service.createReply(rawText, scope)
    jest.setSystemTime(new Date('2026-11-10T15:59:59Z'))
    expect(await service.createReply(` \n${rawText}\t `, scope)).toEqual({ reply: first.reply, created: false })
    jest.setSystemTime(new Date('2026-11-10T16:00:00Z'))
    const next = await service.createReply(rawText, scope)
    expect(next.created).toBe(true)
    expect(next.reply.id).not.toBe(first.reply.id)
    expect(next.reply.contentHash).not.toBe(first.reply.contentHash)
    expect(await service.getReplyForAgent(next.reply.id, {}, scope)).toMatchObject({ receivedDate: '2026-11-11' })
    expect(await service.getReplyForAgent(first.reply.id, {}, scope)).toMatchObject({ receivedDate: '2026-11-10' })
    expect((await service.listReplies({}, scope)).total).toBe(2)
  })

  it('supplier-delivery-followup 验收 3: reply summaries match detail projections, current attempts and order-line ordering with bounded queries', async () => {
    const reply = await start()
    const a = await service.saveProposal(proposal(reply.id), scope)
    const b = await service.saveProposal({ ...proposal(reply.id), poNumber: 'DEMO-003' }, scope)
    const c = await service.saveProposal(proposal(reply.id, 2), scope)
    // Reverse proposal ids so supplier selection cannot accidentally follow their ordering.
    await db.getRepository(ChangeProposal).update(a.proposalId, { id: 'b'.repeat(36) })
    await db.getRepository(ChangeProposal).update(b.proposalId, { id: 'a'.repeat(36) })
    await service.reportModelFailure(reply.id, 1, 'failed', scope)
    await service.retryParse(reply.id, scope)
    await service.saveProposal(proposal(reply.id), scope)
    await service.saveProposal({ ...proposal(reply.id), poNumber: 'DEMO-003' }, scope)
    expect((await service.getReply(reply.id, scope)).proposals.map((p) => p.id)).not.toContain(c.proposalId)
    const foreign = { ...scope, organizationId: 'other-org' }
    await service.importDemoData(foreign)
    const foreignReply = (await service.createReply(rawText, foreign)).reply
    await service.requestParse(foreignReply.id, foreign)
    await service.saveProposal(proposal(foreignReply.id), foreign)

    async function compare(pageSize: number) {
      const page = await service.listWorkbenchReplies({ pageSize }, scope)
      const expected = await Promise.all(
        page.items.map(async (row) => {
          const detail = await service.getReply(row.id, scope)
          const orders = await Promise.all(detail.proposals.map((p) => service.getOrderLine(p.orderLineId, scope)))
          orders.sort((a, b) => a.poNumber.localeCompare(b.poNumber) || a.lineNo - b.lineNo)
          const supplierName = orders[0]?.supplierName ?? null
          return {
            id: row.id,
            preview: row.rawText.trim().slice(0, 80),
            supplierName,
            status: row.status,
            parseTimedOut: row.parseTimedOut,
            proposalCount: detail.proposals.length,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt
          }
        })
      )
      const queries = jest.spyOn(db.logger, 'logQuery')
      const result = await provider.getViewData(scope, DELIVERY_WORKBENCH_KEY, {
        pageSize,
        parameters: { table: 'replies' }
      })
      const count = queries.mock.calls.length
      queries.mockRestore()
      expect(result).toEqual({ meta: { ...page, items: expected } })
      expect(count).toBeLessThanOrEqual(4) // page SELECT + COUNT + proposals + suppliers
      return count
    }
    const firstRead = await service.listWorkbenchReplySummaries({}, scope)
    expect(firstRead.items.find((row) => row.id === reply.id)?.supplierName).toBe('虚构星苔零件社')
    expect(await service.listWorkbenchReplySummaries({}, scope)).toEqual(firstRead)
    const small = await compare(100)
    for (let i = 0; i < 19; i++) {
      const next = await start(`${rawText}\n通知 ${i}`)
      await service.saveProposal(proposal(next.id), scope)
    }
    const noProposal = await service.createReply('尚未解析', scope)
    expect(await compare(100)).toBe(small)
    expect(
      (await service.listWorkbenchReplySummaries({ pageSize: 100 }, scope)).items.find((row) => row.id === reply.id)
    ).toMatchObject({ proposalCount: 2 })
    expect(
      (await service.listWorkbenchReplySummaries({ pageSize: 100 }, scope)).items.find(
        (row) => row.id === noProposal.reply.id
      )
    ).toMatchObject({ proposalCount: 0, supplierName: null })
    await compare(3)
    expect(await service.listWorkbenchReplySummaries({ page: 100 }, scope)).toMatchObject({
      items: [],
      total: 21,
      page: 100
    })
  })

  it('supplier-delivery-followup 验收 5: a failure after the proposal insert surfaces instead of being reported as an update', async () => {
    const reply = await start()
    const outage = new Error('connection lost')
    // The reply is touched right after the insert; that write fails once.
    jest.spyOn(db.getRepository(SupplierReply), 'update').mockRejectedValueOnce(outage)
    await expect(service.saveProposal(proposal(reply.id), scope)).rejects.toBe(outage)
    expect(await db.getRepository(ChangeProposal).findBy({ replyId: reply.id })).toMatchObject([{ revision: 0 }])
  })

  it('supplier-delivery-followup 验收 7: the review revision belongs to the proposals the view returned', async () => {
    const reply = await start()
    const saved = await service.saveProposal(proposal(reply.id), scope)
    await service.finalizeParse(reply.id, 'one proposal', scope)
    await service.decideProposal(saved.proposalId, 'accepted', undefined, undefined, scope)
    const proposals = db.getRepository(ChangeProposal)
    const find = proposals.find.bind(proposals)
    // Another reviewer changes the date right after this view read the proposals.
    jest.spyOn(proposals, 'find').mockImplementationOnce(async (options) => {
      const rows = await find(options)
      await service.decideProposal(saved.proposalId, 'edited', '2026-12-15', undefined, scope)
      return rows
    })
    const view = await provider.getViewData(scope, DELIVERY_WORKBENCH_KEY, {
      parameters: { table: 'reply', id: reply.id }
    })
    const shown = view.meta as { revision: number; proposals: Array<{ finalDate: string | null }> }
    expect(shown.proposals[0].finalDate).toBe('2026-11-28')
    // Confirming what that view showed must not write the date it never displayed.
    expect(
      await provider.executeViewAction(scope, DELIVERY_WORKBENCH_KEY, 'confirm_reply', {
        targetId: reply.id,
        input: { expectedRevision: shown.revision }
      })
    ).toEqual({ success: false, code: 'concurrent_change' })
    expect(await db.getRepository(OrderLine).findOneByOrFail({ poNumber: 'DEMO-001', lineNo: 1 })).toMatchObject({
      promisedDate: '2026-11-20'
    })
    expect(await db.getRepository(DeliveryChangeLog).count()).toBe(0)
  })

  it('supplier-delivery-followup 验收 7: a failed insert counts as a duplicate only when the row exists afterwards', async () => {
    await service.importDemoData(scope)
    const replies = db.getRepository(SupplierReply)
    const outage = new Error('connection lost')
    // Nothing was written: the original error surfaces instead of being read as a duplicate.
    jest.spyOn(replies, 'insert').mockRejectedValueOnce(outage)
    await expect(service.createReply(rawText, scope)).rejects.toBe(outage)
    expect(await replies.count()).toBe(0)
    // A concurrent save wins between the lookup and the insert: the real unique key rejects ours, the winner is returned.
    const { reply: winner } = await service.createReply(rawText, scope)
    jest.spyOn(replies, 'findOneBy').mockResolvedValueOnce(null)
    expect(await service.createReply(rawText, scope)).toMatchObject({ created: false, reply: { id: winner.id } })
    expect(await replies.count()).toBe(1)
  })
})

it('supplier-delivery-followup 验收 10: retry nextAction derives minutes from PARSE_TIMEOUT_MS', () => {
  expect(new DeliveryDomainError('parse_not_retryable').nextAction).toBe(
    `Wait for parsing to finish or for its ${PARSE_TIMEOUT_MS / 60_000}-minute timeout.`
  )
})
