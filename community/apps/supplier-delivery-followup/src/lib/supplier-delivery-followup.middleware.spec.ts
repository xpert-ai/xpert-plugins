import { createTestDataSource } from '../testing/test-data-source'
import 'reflect-metadata'
import { DataSource } from 'typeorm'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { ChangeProposal, DeliveryChangeLog, OrderLine, SupplierReply } from './entities'
import { DELIVERY_TOOL_NAMES } from './constants'
import { DEMO_REPLIES } from './demo-data'
import { SupplierDeliveryFollowupService, PARSE_TIMEOUT_MS } from './supplier-delivery-followup.service'
import { deliveryToolSchemas, SupplierDeliveryFollowupMiddleware } from './supplier-delivery-followup.middleware'
import type { DeliveryScope, SaveProposalInput } from './types'

const scope: DeliveryScope = { tenantId: 'tenant-a', organizationId: 'org-a', userId: 'buyer-a' }
const rawText = DEMO_REPLIES.find((reply) => reply.kind === 'single_delay')!.rawText
const id = 'a'.repeat(64)
const proposal = (replyId: string, overrides: Partial<SaveProposalInput> = {}): SaveProposalInput => ({
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
})
const validInputs = {
  getReply: { replyId: id },
  searchOrderLines: {},
  saveProposal: proposal(id),
  finalizeParse: { replyId: id, summary: '交期延期' },
  reportParseFailure: { replyId: id, code: 'no_delivery_info', message: '没有明确交期' }
}

describe('Supplier delivery tool schemas', () => {
  it.each(Object.keys(deliveryToolSchemas) as (keyof typeof deliveryToolSchemas)[])(
    'tools: %s accepts natural input, requires mandatory fields and rejects extra fields',
    (key) => {
      const schema = deliveryToolSchemas[key]
      const input = validInputs[key]
      expect(schema.safeParse(input).success).toBe(true)
      expect(schema.safeParse({ ...input, tenantId: 'forged' }).success).toBe(false)
      for (const [field, value] of Object.entries(schema.shape)) {
        if (value.isOptional()) continue
        const missing: Record<string, unknown> = { ...input }
        delete missing[field]
        expect(schema.safeParse(missing).success).toBe(false)
      }
    }
  )

  it('tools: nested evidence and batches reject offsets and extra keys; scalar and collection limits apply', () => {
    const schema = deliveryToolSchemas.saveProposal
    expect(
      schema.safeParse(proposal(id, { evidence: [{ field: 'poNumber', quote: 'DEMO-001', start: 0 } as never] }))
        .success
    ).toBe(false)
    expect(
      schema.safeParse(proposal(id, { batches: [{ date: '2026-11-28', quantity: 1, end: 20 } as never] })).success
    ).toBe(false)
    for (const override of [
      { confidence: 1.1 },
      { lineNo: 0 },
      { lineNo: 1.5 },
      { proposedQuantity: Infinity },
      { evidence: [] },
      { batches: Array(101).fill({ quantity: 1, date: '2026-11-28' }) }
    ]) {
      expect(schema.safeParse(proposal(id, override)).success).toBe(false)
    }
    expect(deliveryToolSchemas.getReply.safeParse({ replyId: 'currentReply' }).success).toBe(false)
    expect(deliveryToolSchemas.searchOrderLines.safeParse({ page: 0 }).success).toBe(false)
    expect(deliveryToolSchemas.searchOrderLines.safeParse({ pageSize: 101 }).success).toBe(false)
    expect(
      deliveryToolSchemas.reportParseFailure.safeParse({ ...validInputs.reportParseFailure, code: 'made_up' }).success
    ).toBe(false)
  })
})

describe('Supplier delivery middleware (real TypeORM)', () => {
  let db: DataSource
  let service: SupplierDeliveryFollowupService
  let strategy: SupplierDeliveryFollowupMiddleware
  let tools: ReturnType<SupplierDeliveryFollowupMiddleware['createMiddleware']>['tools']
  const context = (caller: DeliveryScope) => ({ ...caller }) as IAgentMiddlewareContext
  // Erase only the heterogeneous input generic so invalid payloads exercise the actual runtime schema.
  const invokeRaw = (tool: (typeof tools)[number], input: unknown) =>
    (tool as { invoke(input: unknown): Promise<string> }).invoke(input)
  const invoke = async (index: number, input: unknown, selected = tools) =>
    JSON.parse(await invokeRaw(selected[index], input))
  beforeEach(async () => {
    db = createTestDataSource()
    await db.initialize()
    service = new SupplierDeliveryFollowupService(
      db.getRepository(OrderLine),
      db.getRepository(SupplierReply),
      db.getRepository(ChangeProposal),
      db.getRepository(DeliveryChangeLog)
    )
    strategy = new SupplierDeliveryFollowupMiddleware(service)
    tools = strategy.createMiddleware({}, context(scope)).tools
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    await db.destroy()
  })
  async function start(text: string = rawText) {
    await service.importDemoData(scope)
    const { reply } = await service.createReply(text, scope)
    await service.requestParse(reply.id, scope)
    return reply.id
  }

  it('tools: exactly five tools expose localized titles, inherited icon and verbose schema errors', () => {
    expect(tools.map((tool) => tool.name)).toEqual(DELIVERY_TOOL_NAMES)
    expect(strategy.getToolNames()).toEqual(DELIVERY_TOOL_NAMES)
    expect(strategy.meta.icon).toMatchObject({ type: 'emoji', value: expect.any(String) })
    for (const tool of tools) {
      expect(tool.verboseParsingErrors).toBe(true)
      expect(tool.metadata?.toolName).toEqual({ en_US: expect.any(String), zh_Hans: expect.any(String) })
      expect(tool.metadata).not.toHaveProperty('middlewareIcon')
    }
  })

  it('tools: read/search/save/finalize receipts are compact, paginated and keep orders unchanged', async () => {
    const replyId = await start()
    const before = await db.getRepository(OrderLine).find()
    expect(await invoke(0, { replyId })).toEqual({
      replyId,
      status: 'parsing',
      rawText,
      parseAttempt: 1,
      parseTimedOut: false,
      failureCode: null,
      failureMessage: null,
      proposals: [],
      total: 0,
      page: 1,
      pageSize: 20,
      receivedAt: expect.any(String),
      receivedDate: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      receivedWeekday: expect.any(String)
    })
    const search = await invoke(1, { poNumber: 'DEMO-001', pageSize: 1 })
    const second = await invoke(1, { poNumber: 'DEMO-001', pageSize: 1, page: 2 })
    expect(search).toMatchObject({ total: 2, page: 1, pageSize: 1 })
    expect(Object.keys(search.items[0]).sort()).toEqual(
      ['orderLineId', 'poNumber', 'lineNo', 'supplierName', 'materialName', 'quantity', 'promisedDate'].sort()
    )
    expect(search.items[0].orderLineId).not.toBe(second.items[0].orderLineId)
    const first = await invoke(2, proposal(replyId))
    expect(first).toEqual({ replyId, proposalId: expect.any(String), created: true, message: 'proposal_saved' })
    expect(await invoke(2, proposal(replyId))).toEqual({ ...first, created: false, message: 'proposal_updated' })
    await invoke(2, proposal(replyId, { lineNo: 2 }))
    const read = await invoke(0, { replyId, pageSize: 1 })
    const next = await invoke(0, { replyId, pageSize: 1, page: 2 })
    expect(read).toMatchObject({ total: 2, pageSize: 1, page: 1 })
    expect(read.proposals).toHaveLength(1)
    expect(Object.keys(read.proposals[0]).sort()).toEqual(['orderLineId', 'poNumber', 'lineNo', 'changeType'].sort())
    expect(read.proposals[0].orderLineId).not.toBe(next.proposals[0].orderLineId)
    expect(await invoke(3, { replyId, summary: '交期延期' })).toEqual({
      replyId,
      status: 'pending_review',
      proposalCount: 2
    })
    expect(await db.getRepository(OrderLine).find()).toEqual(before)
    expect(await db.getRepository(DeliveryChangeLog).count()).toBe(0)
    for (const entry of (await service.getReply(replyId, scope)).proposals[0].evidence) {
      expect(rawText.slice(entry.start, entry.end)).toBe(entry.quote)
    }
  })

  it.each([
    ['quote_not_in_reply', { evidence: proposal(id).evidence.map((e) => ({ ...e, quote: '原文没有这句话' })) }],
    ['order_line_not_found', { poNumber: 'MISSING' }],
    ['invalid_date', { proposedDate: '2026-02-30' }],
    ['invalid_date', { proposedDate: '2026-2-03' }],
    ['evidence_required', { evidence: [{ field: 'poNumber', quote: 'DEMO-001' }] }],
    ['invalid_batches', { changeType: 'partial', batches: [] }]
  ] as [string, Partial<SaveProposalInput>][])(
    'supplier-delivery-followup 验收 5: tools map %s to corrective receipts without persisting',
    async (code, override) => {
      const replyId = await start()
      const result = await invoke(2, proposal(replyId, override))
      expect(result).toEqual({
        replyId,
        code,
        message: code,
        params: expect.any(Object),
        nextAction: expect.any(String)
      })
      expect(result.nextAction.length).toBeGreaterThan(10)
      expect(await db.getRepository(ChangeProposal).count()).toBe(0)
      expect(await invoke(2, proposal(replyId))).toMatchObject({ replyId, created: true })
    }
  )

  it('tools: partial batches derive their final date and require batch evidence', async () => {
    const replyId = await start('DEMO-001 先交40件于2026-11-28，余60件于2026-12-01。')
    const input = proposal(replyId, {
      changeType: 'partial',
      proposedDate: undefined,
      proposedQuantity: undefined,
      reason: undefined,
      batches: [
        { quantity: 60, date: '2026-12-01' },
        { quantity: 40, date: '2026-11-28' }
      ],
      evidence: [{ field: 'poNumber', quote: 'DEMO-001' }]
    })
    expect(await invoke(2, input)).toMatchObject({ code: 'evidence_required', params: { fields: ['batches'] } })
    input.evidence.push({ field: 'batches', quote: '先交40件于2026-11-28，余60件于2026-12-01' })
    expect(await invoke(2, input)).toMatchObject({ replyId, created: true })
    expect((await service.getReply(replyId, scope)).proposals[0].proposedDate).toBe('2026-12-01')
  })

  it('tools: frozen replies tell the model to leave confirmation to the buyer', async () => {
    const replyId = await start()
    const saved = await invoke(2, proposal(replyId))
    await invoke(3, { replyId, summary: 'review' })
    await service.decideProposal(saved.proposalId, 'accepted', undefined, undefined, scope)
    jest.spyOn(db.getRepository(OrderLine), 'update').mockRejectedValueOnce(new Error('interrupted'))
    await expect(service.confirmReply(replyId, scope.userId, scope)).rejects.toThrow('interrupted')
    const before = await service.getReply(replyId, scope)
    for (const [index, input] of [
      [2, proposal(replyId)],
      [3, { replyId, summary: 'overwrite' }],
      [4, { replyId, code: 'other', message: 'overwrite' }]
    ] as const) {
      expect(await invoke(index, input)).toMatchObject({
        replyId,
        code: 'confirmation_in_progress',
        message: expect.stringContaining('Confirmation has started'),
        nextAction:
          'A buyer is confirming this reply. Do not parse or change it; let the buyer resolve conflicts and resume confirmation.'
      })
    }
    expect(await service.getReply(replyId, scope)).toEqual(before)
  })

  it('tools: invalid change type returns date-based correction fields without saving', async () => {
    const replyId = await start()
    expect(await invoke(2, proposal(replyId, { changeType: 'advance' }))).toMatchObject({
      code: 'invalid_change_type',
      params: { field: 'changeType', value: 'advance', expected: 'delay' },
      nextAction: expect.stringContaining('promisedDate')
    })
    expect((await service.getReply(replyId, scope)).proposals).toEqual([])
  })

  it('supplier-delivery-followup 验收 11: failure tool persists needs_followup and its reason', async () => {
    const replyId = await start('我们尽快安排')
    expect(await invoke(4, { replyId, code: 'no_delivery_info', message: '未提供明确交期' })).toEqual({
      replyId,
      status: 'needs_followup'
    })
    expect(await service.getReply(replyId, scope)).toMatchObject({
      status: 'needs_followup',
      failureCode: 'no_delivery_info',
      failureMessage: '未提供明确交期'
    })
    expect(await invoke(0, { replyId })).toMatchObject({
      failureCode: 'no_delivery_info',
      failureMessage: '未提供明确交期'
    })
  })

  it('supplier-delivery-followup 验收 10: timeout and human retry replace proposals; confirmed replies stay locked', async () => {
    const replyId = await start()
    const saved = await invoke(2, proposal(replyId))
    await db
      .getRepository(SupplierReply)
      .update(replyId, { parseRequestedAt: new Date(Date.now() - PARSE_TIMEOUT_MS - 1).toISOString() })
    expect(await invoke(0, { replyId })).toMatchObject({ parseTimedOut: true, parseAttempt: 1 })
    await service.retryParse(replyId, scope)
    expect(await invoke(0, { replyId })).toMatchObject({ parseTimedOut: false, parseAttempt: 2, total: 0 })
    expect(await invoke(2, proposal(replyId))).toEqual({ ...saved, created: false, message: 'proposal_updated' })
    expect(await db.getRepository(ChangeProposal).count()).toBe(1)
    await invoke(3, { replyId, summary: '重试完成' })
    await service.decideProposal(saved.proposalId, 'accepted', undefined, undefined, scope)
    await service.confirmReply(replyId, scope.userId, scope)
    for (const [index, input] of [
      [2, proposal(replyId)],
      [3, { replyId, summary: '再次收尾' }],
      [4, { replyId, code: 'other', message: '再次上报' }]
    ] as const) {
      expect(await invoke(index, input)).toMatchObject({
        replyId,
        code: 'reply_locked',
        nextAction: expect.any(String)
      })
    }
    expect(await service.getReply(replyId, scope)).toMatchObject({ status: 'confirmed', parseAttempt: 2 })
  })

  it('tools: scope comes only from each execution context; forged identities cannot read or mutate', async () => {
    const replyId = await start()
    const invalidContexts = [
      { ...scope, tenantId: 'tenant-b' },
      { ...scope, organizationId: 'org-b' },
      { ...scope, organizationId: null },
      { ...scope, userId: '' }
    ]
    for (const caller of invalidContexts) {
      const foreign = strategy.createMiddleware({}, context(caller)).tools
      const expected = caller.userId ? 'reply_not_found' : 'invalid_scope'
      expect(await invoke(0, { replyId }, foreign)).toMatchObject({ code: expected })
      expect(await invoke(2, proposal(replyId), foreign)).toMatchObject({ code: expected })
      if (caller.userId) expect(await invoke(1, {}, foreign)).toMatchObject({ items: [], total: 0 })
      for (const identity of ['tenantId', 'organizationId', 'userId']) {
        await expect(
          invokeRaw(foreign[2], { ...proposal(replyId), [identity]: scope[identity as keyof DeliveryScope] })
        ).rejects.toThrow()
      }
    }
    const spy = jest.spyOn(service, 'saveProposal')
    expect(await invoke(2, proposal(replyId))).toMatchObject({ replyId, created: true })
    expect(spy).toHaveBeenCalledWith(proposal(replyId), scope)
    expect(await db.getRepository(ChangeProposal).count()).toBe(1)
  })

  it('tools: reads never start parsing, empty finalize and missing replies give nextAction, unexpected errors disclose no internals', async () => {
    const { reply } = await service.createReply(rawText, scope)
    expect(await invoke(0, { replyId: reply.id })).toMatchObject({ status: 'received', parseAttempt: 0 })
    expect(await invoke(4, { replyId: reply.id, code: 'other', message: '失败' })).toMatchObject({
      code: 'invalid_reply_state',
      nextAction: expect.stringContaining('workbench')
    })
    await service.requestParse(reply.id, scope)
    expect(await invoke(3, { replyId: reply.id, summary: '空结果' })).toMatchObject({
      code: 'no_proposals',
      nextAction: expect.any(String)
    })
    expect(await invoke(0, { replyId: id })).toMatchObject({ code: 'reply_not_found', nextAction: expect.any(String) })
    jest.spyOn(service, 'saveProposal').mockRejectedValueOnce(new Error('private database connection details'))
    const result = await invoke(2, proposal(reply.id))
    expect(result).toMatchObject({
      replyId: reply.id,
      code: 'operation_failed',
      params: {},
      nextAction: expect.any(String)
    })
    expect(JSON.stringify(result)).not.toContain('private')
    expect(result).not.toHaveProperty('stack')
  })
})
