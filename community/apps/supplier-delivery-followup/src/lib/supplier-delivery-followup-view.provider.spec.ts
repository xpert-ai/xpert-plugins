import { createTestDataSource, reconnectTestDataSource } from '../testing/test-data-source'
import 'reflect-metadata'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { IncomingMessage, ServerResponse } from 'node:http'
import { Socket } from 'node:net'
import { DataSource } from 'typeorm'
import type { IUser, XpertResolvedViewHostContext, XpertViewQuery } from '@xpert-ai/contracts'
import { als, RequestContext, VIEW_EXTENSION_PROVIDER } from '@xpert-ai/plugin-sdk'
import { DELIVERY_FEATURE, DELIVERY_TOOL_NAMES, DELIVERY_WORKBENCH_KEY } from './constants'
import { parseCommandText } from './domain-utils'
import { DEMO_ORDER_LINES, DEMO_REPLIES } from './demo-data'
import { ChangeProposal, DeliveryChangeLog, OrderLine, SupplierReply } from './entities'
import { SupplierDeliveryFollowupPlugin } from './supplier-delivery-followup.plugin'
import { SupplierDeliveryFollowupService, PARSE_TIMEOUT_MS } from './supplier-delivery-followup.service'
import { SupplierDeliveryFollowupViewProvider } from './supplier-delivery-followup-view.provider'
import type { WorkbenchActionKey, WorkbenchDataResponse, WorkbenchTable } from './workbench-contract'

const context: XpertResolvedViewHostContext = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'buyer-a',
  hostType: 'agent',
  hostId: 'assistant-a',
  slots: []
}
const rawText = DEMO_REPLIES.find((reply) => reply.kind === 'single_delay')!.rawText

describe('SupplierDeliveryFollowupViewProvider (real TypeORM)', () => {
  let db: DataSource
  let service: SupplierDeliveryFollowupService
  let provider: SupplierDeliveryFollowupViewProvider
  beforeEach(async () => {
    db = createTestDataSource()
    await db.initialize()
    service = new SupplierDeliveryFollowupService(
      db.getRepository(OrderLine),
      db.getRepository(SupplierReply),
      db.getRepository(ChangeProposal),
      db.getRepository(DeliveryChangeLog)
    )
    provider = new SupplierDeliveryFollowupViewProvider(service)
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    if (db.isInitialized) await db.destroy()
  })

  function action(key: WorkbenchActionKey, targetId = '', input: Record<string, unknown> = {}, caller = context) {
    return provider.executeViewAction(caller, DELIVERY_WORKBENCH_KEY, key, { targetId, input })
  }
  async function query<K extends WorkbenchTable>(
    table: K,
    id?: string,
    rest: Partial<XpertViewQuery> = {},
    caller = context
  ) {
    const result = await provider.getViewData(caller, DELIVERY_WORKBENCH_KEY, {
      ...rest,
      parameters: { table, ...(id ? { id } : {}) }
    })
    expect(result.error).toBeUndefined()
    expect(Object.keys(result)).toEqual(['meta'])
    // Domain entities must never be spread into iframe data.
    expect(JSON.stringify(result)).not.toMatch(/"(?:tenantId|organizationId|contentHash|confirmationActorId)"/)
    return result.meta as WorkbenchDataResponse[K]
  }
  async function parsed(
    text: string = rawText,
    lines = [1],
    finalize = true,
    changeType: 'delay' | 'unchanged' = 'delay'
  ) {
    await action('import_demo_data')
    const { reply } = await service.createReply(text, context)
    await action('request_parse', reply.id, { locale: 'zh-Hans' })
    for (const lineNo of lines) {
      await service.saveProposal(
        {
          replyId: reply.id,
          poNumber: 'DEMO-001',
          lineNo,
          changeType,
          proposedDate: '2026-11-28',
          proposedQuantity: 100,
          reason: '设备检修',
          confidence: 0.9,
          evidence: [
            { field: 'poNumber', quote: 'DEMO-001' },
            { field: 'proposedDate', quote: '2026-11-28' }
          ]
        },
        context
      )
    }
    if (finalize) await service.finalizeParse(reply.id, '延后交货', context)
    return query('reply', reply.id)
  }
  /** The review revision a freshly loaded workbench would send with confirm_reply. */
  async function latestRevision(replyId: string) {
    return (await query('reply', replyId)).revision
  }

  const nameCases: Array<{ label: string; user: IUser | null; expected: string | null }> = [
    {
      label: 'name',
      user: {
        name: '  张三  ',
        fullName: 'Other',
        firstName: 'First',
        lastName: 'Last',
        username: 'buyer',
        email: 'buyer@example.com'
      },
      expected: '张三'
    },
    {
      label: 'fullName',
      user: { name: ' ', fullName: ' Full Name ', firstName: 'First', username: 'buyer' },
      expected: 'Full Name'
    },
    {
      label: 'firstName + lastName',
      user: { firstName: ' First ', lastName: ' Last ', username: 'buyer' },
      expected: 'First Last'
    },
    { label: 'firstName', user: { firstName: ' First ', username: 'buyer' }, expected: 'First' },
    { label: 'lastName', user: { lastName: ' Last ', username: 'buyer' }, expected: 'Last' },
    {
      label: 'username',
      user: {
        name: ' ',
        fullName: ' ',
        firstName: ' ',
        lastName: ' ',
        username: ' buyer ',
        email: 'buyer@example.com'
      },
      expected: 'buyer'
    },
    { label: 'email', user: { username: ' ', email: ' buyer@example.com ' }, expected: 'buyer@example.com' },
    {
      label: '空白字段',
      user: { name: ' ', fullName: ' ', firstName: ' ', lastName: ' ', username: ' ', email: ' ' },
      expected: null
    },
    { label: '无用户', user: null, expected: null }
  ]
  it.each(nameCases)(
    'view: 从真实请求上下文按优先级读取显示名（$label）并返回回复和时间线',
    async ({ user, expected }) => {
      const reply = await parsed()
      expect(reply.confirmedByName).toBeNull()
      await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
      const request = Object.assign(new IncomingMessage(new Socket()), {
        user: user && { ...user, id: context.userId }
      })
      const requestContext = new RequestContext(request, new ServerResponse(request), 'actor-name-test')
      const expectedRevision = await latestRevision(reply.id)
      const result = await als.run(requestContext, () =>
        action('confirm_reply', reply.id, {
          expectedRevision,
          confirmedByName: '伪造名字',
          actorName: '伪造名字'
        })
      )
      expect(result).toEqual({ success: true, data: { replyId: reply.id, appliedCount: 1 } })
      expect(await query('reply', reply.id)).toMatchObject({ confirmedBy: context.userId, confirmedByName: expected })
      expect((await query('orderLine', reply.proposals[0].orderLineId)).changes).toEqual([
        expect.objectContaining({ confirmedBy: context.userId, confirmedByName: expected })
      ])
    }
  )

  it('view: confirmationInProgress is false before freezing, true during interruption, false after completion', async () => {
    const reply = await parsed()
    expect(reply.confirmationInProgress).toBe(false)
    await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
    const interrupted = jest
      .spyOn(db.getRepository(DeliveryChangeLog), 'insert')
      .mockRejectedValueOnce(new Error('interrupted'))
    await expect(service.confirmReply(reply.id, context.userId, context)).rejects.toThrow('interrupted')
    expect(await query('reply', reply.id)).toMatchObject({ status: 'pending_review', confirmationInProgress: true })
    interrupted.mockRestore()
    expect(await action('confirm_reply', reply.id, { expectedRevision: reply.revision })).toMatchObject({
      success: true
    })
    expect(await query('reply', reply.id)).toMatchObject({ status: 'confirmed', confirmationInProgress: false })
  })

  it('view: 无请求上下文时确认成功且回复和时间线显示名为 null', async () => {
    const reply = await parsed()
    await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
    expect(await action('confirm_reply', reply.id, { expectedRevision: await latestRevision(reply.id) })).toMatchObject(
      { success: true }
    )
    expect((await query('reply', reply.id)).confirmedByName).toBeNull()
    expect((await query('orderLine', reply.proposals[0].orderLineId)).changes[0].confirmedByName).toBeNull()
  })

  it('view: 请求上下文读取异常时显示名回退 null 并继续确认', async () => {
    const reply = await parsed()
    await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
    jest.spyOn(RequestContext, 'currentUser').mockImplementation(() => {
      throw new Error('context unavailable')
    })
    expect(await action('confirm_reply', reply.id, { expectedRevision: await latestRevision(reply.id) })).toMatchObject(
      { success: true }
    )
    expect((await query('reply', reply.id)).confirmedByName).toBeNull()
    expect((await query('orderLine', reply.proposals[0].orderLineId)).changes[0].confirmedByName).toBeNull()
  })

  it('view: manifest 注册 key、entry、七个动作、唯一客户端命令和五工具完成事件', () => {
    expect(Reflect.getMetadata(VIEW_EXTENSION_PROVIDER, SupplierDeliveryFollowupViewProvider)).toBe(
      DELIVERY_WORKBENCH_KEY
    )
    expect(Reflect.getMetadata('providers', SupplierDeliveryFollowupPlugin)).toContain(
      SupplierDeliveryFollowupViewProvider
    )
    expect(provider.supports(context)).toBe(true)
    expect(provider.supports({ ...context, hostType: 'project' })).toBe(false)
    expect(provider.getViewManifests(context, 'other')).toEqual([])
    for (const slot of ['agent.workbench.main', 'agent.workbench.fixed']) {
      const [manifest] = provider.getViewManifests(context, slot)
      expect(manifest).toMatchObject({
        key: DELIVERY_WORKBENCH_KEY,
        hostType: 'agent',
        slot,
        title: { en_US: 'Supplier delivery follow-up', zh_Hans: '供应商交期跟单' },
        activation: { requiredFeatures: [DELIVERY_FEATURE] },
        view: {
          type: 'remote_component',
          runtime: 'react',
          component: { isolation: 'iframe', entry: 'supplier-delivery-workbench' },
          dataSource: { mode: 'platform' }
        },
        dataSource: { mode: 'platform' }
      })
      expect(manifest.actions?.map((item) => item.key)).toEqual([
        'import_demo_data',
        'create_reply',
        'request_parse',
        'resend_parse',
        'retry_parse',
        'decide_proposal',
        'confirm_reply'
      ])
      expect(manifest.clientCommands?.map((item) => item.key)).toEqual(['assistant.chat.send_message'])
      expect(manifest.hostEvents?.subscriptions).toEqual([
        {
          key: 'supplier-delivery-tool-completed',
          event: 'assistant.tool.completed',
          filter: { sources: ['chatkit'], toolNames: [...DELIVERY_TOOL_NAMES] },
          action: { type: 'forward', debounceMs: 800 }
        }
      ])
      if (slot.endsWith('fixed')) expect(manifest.workbench).toMatchObject({ fixed: true, menu: { enabled: true } })
    }
  })

  it('supplier-delivery-followup 验收 3: 空列表、输入校验、重复回复及重复导入返回契约形状', async () => {
    expect(await query('overview')).toEqual({
      orderLineCount: 0,
      delayedLineCount: 0,
      parseTimeoutMinutes: 5,
      replyCounts: { received: 0, parsing: 0, pending_review: 0, confirmed: 0, needs_followup: 0, failed: 0 }
    })
    expect(await query('replies')).toEqual({ items: [], total: 0, page: 1, pageSize: 100 })
    expect(await query('orderLines')).toEqual({ items: [], total: 0, page: 1, pageSize: 100 })
    expect(await action('create_reply', '', { rawText: '  ' })).toEqual({ success: false, code: 'reply_empty' })
    expect(await action('create_reply', '', { rawText: '字'.repeat(5001) })).toEqual({
      success: false,
      code: 'reply_too_long',
      params: { maximum: 5000, length: 5001 }
    })
    expect(await action('import_demo_data')).toEqual({ success: true, data: { created: 12, skipped: 0 } })
    expect(await action('import_demo_data')).toEqual({ success: true, data: { created: 0, skipped: 12 } })
    const first = await action('create_reply', '', { rawText })
    expect(first).toMatchObject({ success: true, data: { created: true, replyId: expect.any(String) } })
    expect(await action('create_reply', '', { rawText: ` \n${rawText} ` })).toMatchObject({
      success: true,
      data: { ...(first.success ? first.data : {}), created: false }
    })
    expect((await query('replies')).items[0]).toMatchObject({
      preview: rawText.trim().slice(0, 80),
      supplierName: null,
      proposalCount: 0,
      parseTimedOut: false
    })
  })

  it.each(['zh-Hans', 'en', 'fr'])(
    'supplier-delivery-followup 验收 4: request_parse 按 %s 返回宿主 text 命令且不自动确认',
    async (locale) => {
      const { reply } = await service.createReply(rawText, context)
      const result = await action('request_parse', reply.id, { locale, tenantId: 'forged', userId: 'forged' })
      expect(result).toEqual({
        success: true,
        data: { replyId: reply.id, parseAttempt: 1 },
        command: {
          commandKey: 'assistant.chat.send_message',
          payload: {
            newThread: true,
            text: parseCommandText({ ...reply, parseAttempt: 1 }, locale)
          }
        }
      })
      expect(await query('reply', reply.id)).toMatchObject({ status: 'parsing', confirmedBy: null, proposals: [] })
    }
  )

  it('view: 五种查询映射 baseDate、currentDate、stale、supplierName、搜索和分页', async () => {
    const reply = await parsed()
    expect(reply).toMatchObject({
      revision: 2,
      rawText,
      parseTimedOut: false,
      parseAttempt: 1,
      failureCode: null,
      failureMessage: null,
      confirmedAt: null,
      confirmedBy: null
    })
    expect(reply.proposals[0]).toMatchObject({
      poNumber: 'DEMO-001',
      lineNo: 1,
      orderedQuantity: 100,
      originalDate: '2026-11-20',
      baseDate: '2026-11-20',
      currentDate: '2026-11-20',
      stale: false,
      proposedDate: '2026-11-28'
    })
    const proposal = reply.proposals[0]
    for (const evidence of proposal.evidence)
      expect(reply.rawText.slice(evidence.start, evidence.end)).toBe(evidence.quote)
    expect((await query('replies')).items).toEqual([
      expect.objectContaining({
        id: reply.id,
        supplierName: DEMO_ORDER_LINES[0].supplierName,
        proposalCount: 1,
        status: 'pending_review'
      })
    ])
    for (const search of ['demo-001', DEMO_ORDER_LINES[0].supplierName, '定位环', 'mat-01']) {
      expect((await query('orderLines', undefined, { search })).items.length).toBeGreaterThan(0)
    }
    expect(await query('orderLines', undefined, { search: '定位环', page: 1, pageSize: 1 })).toMatchObject({
      total: 1,
      page: 1,
      pageSize: 1,
      items: [expect.objectContaining({ delayDays: 0 })]
    })
    expect(await query('orderLine', proposal.orderLineId)).toMatchObject({ revision: 0, changes: [], delayDays: 0 })
    await db
      .getRepository(OrderLine)
      .update(proposal.orderLineId, { promisedDate: '2026-11-25', revision: 1, lastAppliedProposalId: 'another' })
    expect((await query('reply', reply.id)).proposals[0]).toMatchObject({
      baseDate: '2026-11-20',
      currentDate: '2026-11-25',
      stale: true
    })
    await db.getRepository(OrderLine).update(proposal.orderLineId, { lastAppliedProposalId: proposal.id })
    expect((await query('reply', reply.id)).proposals[0].stale).toBe(false)
    // Written to the order and then changed again by another reply: history, not a stale proposal.
    await db.getRepository(OrderLine).update(proposal.orderLineId, { revision: 2, lastAppliedProposalId: 'another' })
    await db.getRepository(ChangeProposal).update(proposal.id, { confirmationState: 'confirmed' })
    expect((await query('reply', reply.id)).proposals[0].stale).toBe(false)
    expect(await query('overview')).toMatchObject({
      orderLineCount: 12,
      delayedLineCount: 1,
      replyCounts: { pending_review: 1 }
    })
  })

  it('view: 解析收尾和逐条审核更新持久化 updatedAt，倒序排序后分页', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-01T00:00:00.000Z'), doNotFake: ['nextTick', 'setImmediate'] })
    const a = await parsed(rawText, [1, 2], false)
    jest.setSystemTime(new Date('2026-11-02T00:00:00.000Z'))
    const b = await parsed(`${rawText}\n第二封`, [1], false)
    async function first(id: string, otherId: string) {
      const updatedAt = new Date().toISOString()
      expect((await service.getReply(id, context)).updatedAt).toBe(updatedAt)
      expect(await query('replies', undefined, { pageSize: 1 })).toMatchObject({ total: 2, items: [{ id, updatedAt }] })
      expect((await query('replies', undefined, { page: 2, pageSize: 1 })).items[0].id).toBe(otherId)
    }
    await first(b.id, a.id)
    jest.setSystemTime(new Date('2026-11-03T00:00:00.000Z'))
    await service.finalizeParse(a.id, '较早回复现在完成解析', context)
    await first(a.id, b.id)
    jest.setSystemTime(new Date('2026-11-04T00:00:00.000Z'))
    await service.finalizeParse(b.id, '第二封完成解析', context)
    await first(b.id, a.id)
    jest.setSystemTime(new Date('2026-11-05T00:00:00.000Z'))
    await action('decide_proposal', a.proposals[0].id, { decision: 'accepted' })
    await first(a.id, b.id)
    jest.setSystemTime(new Date('2026-11-06T00:00:00.000Z'))
    await action('decide_proposal', b.proposals[0].id, { decision: 'accepted' })
    await first(b.id, a.id)
    jest.setSystemTime(new Date('2026-11-07T00:00:00.000Z'))
    await action('decide_proposal', a.proposals[1].id, { decision: 'rejected' })
    await first(a.id, b.id)
  })

  it('view: 并发确认直接返回领域实际写入计数，两次合计等于两行订单', async () => {
    const reply = await parsed(rawText, [1, 2])
    for (const proposal of reply.proposals) await action('decide_proposal', proposal.id, { decision: 'accepted' })
    const expectedRevision = await latestRevision(reply.id)
    const results = await Promise.all([
      action('confirm_reply', reply.id, { expectedRevision }),
      action('confirm_reply', reply.id, { expectedRevision })
    ])
    let appliedCount = 0
    for (const result of results) {
      expect(result.success).toBe(true)
      if (!result.success || !('appliedCount' in result.data)) throw new Error('Expected confirmation result')
      appliedCount += result.data.appliedCount
    }
    expect(appliedCount).toBe(2)
    expect(await db.getRepository(OrderLine).countBy({ revision: 1 })).toBe(2)
  })

  it('supplier-delivery-followup 验收 6: 采纳、修改、驳回和确认使用可信用户，重复确认计数为零', async () => {
    const reply = await parsed(rawText, [1, 2])
    expect(await action('confirm_reply', reply.id, { expectedRevision: reply.revision + 1 })).toEqual({
      success: false,
      code: 'concurrent_change'
    })
    // Preserve the real domain error; the preview currently calls it not_reviewed.
    expect(await action('confirm_reply', reply.id, { expectedRevision: reply.revision })).toEqual({
      success: false,
      code: 'review_incomplete'
    })
    const [accepted, rejected] = reply.proposals
    expect(await action('decide_proposal', accepted.id, { decision: 'accepted' })).toEqual({
      success: true,
      data: { proposalId: accepted.id, replyId: reply.id }
    })
    expect(
      await action('decide_proposal', accepted.id, { decision: 'edited', finalDate: '2026-11-30', finalQuantity: 90 })
    ).toMatchObject({ success: true })
    expect(await action('decide_proposal', rejected.id, { decision: 'rejected' })).toMatchObject({ success: true })
    expect(
      await action('confirm_reply', reply.id, {
        expectedRevision: await latestRevision(reply.id),
        userId: 'forged',
        actorId: 'forged'
      })
    ).toEqual({
      success: true,
      data: { replyId: reply.id, appliedCount: 1 }
    })
    expect(await query('reply', reply.id)).toMatchObject({ status: 'confirmed', confirmedBy: context.userId })
    expect(await query('orderLine', accepted.orderLineId)).toMatchObject({
      quantity: 90,
      promisedDate: '2026-11-30',
      delayDays: 10,
      changes: [
        {
          oldDate: '2026-11-20',
          newDate: '2026-11-30',
          aiDate: '2026-11-28',
          confirmedBy: context.userId,
          replyId: reply.id
        }
      ]
    })
    expect(await query('orderLine', rejected.orderLineId)).toMatchObject({ revision: 0, delayDays: 0, changes: [] })
    expect(await action('confirm_reply', reply.id, { expectedRevision: reply.revision })).toEqual({
      success: true,
      data: { replyId: reply.id, appliedCount: 0 }
    })
    for (const key of ['request_parse', 'retry_parse'] as const) {
      expect(await action(key, reply.id)).toMatchObject({ success: false, code: 'reply_locked' })
    }
    expect(await action('decide_proposal', accepted.id, { decision: 'rejected' })).toMatchObject({
      success: false,
      code: 'reply_locked'
    })
  })

  it('supplier-delivery-followup 验收 6: 过期订单和非法决策返回领域错误且不修改订单', async () => {
    const reply = await parsed()
    const proposal = reply.proposals[0]
    expect(await action('decide_proposal', proposal.id, { decision: 'pending' })).toEqual({
      success: false,
      code: 'invalid_decision'
    })
    expect(await action('decide_proposal', proposal.id, { decision: 'edited', finalDate: 42 })).toEqual({
      success: false,
      code: 'invalid_date'
    })
    expect(await action('decide_proposal', proposal.id, { decision: 'edited', finalQuantity: '10' })).toEqual({
      success: false,
      code: 'invalid_quantity'
    })
    await action('decide_proposal', proposal.id, { decision: 'accepted' })
    await db.getRepository(OrderLine).update(proposal.orderLineId, { revision: 1, lastAppliedProposalId: 'another' })
    expect(await action('confirm_reply', reply.id, { expectedRevision: await latestRevision(reply.id) })).toEqual({
      success: false,
      code: 'order_line_changed',
      params: { orderLineId: proposal.orderLineId }
    })
    expect((await query('orderLine', proposal.orderLineId)).changes).toEqual([])
  })

  it('supplier-delivery-followup 验收 8: 重建数据库连接和 provider 后恢复确认结果与时间线', async () => {
    const reply = await parsed()
    await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
    expect(await action('confirm_reply', reply.id, { expectedRevision: await latestRevision(reply.id) })).toMatchObject(
      { success: true }
    )
    const before = await query('orderLine', reply.proposals[0].orderLineId)
    db = await reconnectTestDataSource(db)
    service = new SupplierDeliveryFollowupService(
      db.getRepository(OrderLine),
      db.getRepository(SupplierReply),
      db.getRepository(ChangeProposal),
      db.getRepository(DeliveryChangeLog)
    )
    provider = new SupplierDeliveryFollowupViewProvider(service)
    expect(await query('orderLine', before.id)).toEqual(before)
    expect((await query('reply', reply.id)).status).toBe('confirmed')
  })

  it('supplier-delivery-followup 验收 9: 多次确认的 baseDate、提前天数和时间线保留各次原交期', async () => {
    const first = await parsed()
    await action('decide_proposal', first.proposals[0].id, { decision: 'accepted' })
    expect(await action('confirm_reply', first.id, { expectedRevision: await latestRevision(first.id) })).toMatchObject(
      { success: true }
    )
    const next = await parsed(`${rawText}\n第二次回复`, [1], true, 'unchanged')
    expect(next.proposals[0]).toMatchObject({
      baseDate: '2026-11-28',
      originalDate: '2026-11-20',
      currentDate: '2026-11-28'
    })
    await action('decide_proposal', next.proposals[0].id, { decision: 'edited', finalDate: '2026-11-18' })
    expect(await action('confirm_reply', next.id, { expectedRevision: await latestRevision(next.id) })).toMatchObject({
      success: true
    })
    const line = await query('orderLine', next.proposals[0].orderLineId)
    expect(line.delayDays).toBe(-2)
    expect(line.changes.map((log) => [log.oldDate, log.newDate])).toEqual([
      ['2026-11-20', '2026-11-28'],
      ['2026-11-28', '2026-11-18']
    ])
  })

  it('supplier-delivery-followup 验收 7: 另一个窗口改了审核结果后，旧窗口的确认被拒，订单不变', async () => {
    const reply = await parsed()
    const proposal = reply.proposals[0]
    await action('decide_proposal', proposal.id, { decision: 'accepted' })
    const seenByWindowA = await latestRevision(reply.id)
    await action('decide_proposal', proposal.id, { decision: 'edited', finalDate: '2026-12-15' })
    expect(await action('confirm_reply', reply.id, { expectedRevision: seenByWindowA })).toEqual({
      success: false,
      code: 'concurrent_change'
    })
    expect(await query('orderLine', proposal.orderLineId)).toMatchObject({ promisedDate: '2026-11-20', changes: [] })
    expect(await action('confirm_reply', reply.id, { expectedRevision: await latestRevision(reply.id) })).toMatchObject(
      { success: true }
    )
    expect((await query('orderLine', proposal.orderLineId)).promisedDate).toBe('2026-12-15')
  })

  it('supplier-delivery-followup 验收 7: 确认中断后原样重发同一请求，从断点续做且只写一条变更记录', async () => {
    const reply = await parsed()
    await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
    const request = { expectedRevision: await latestRevision(reply.id) }
    jest.spyOn(db.getRepository(DeliveryChangeLog), 'insert').mockRejectedValueOnce(new Error('interrupted'))
    await expect(action('confirm_reply', reply.id, request)).rejects.toThrow('interrupted')
    expect(await action('confirm_reply', reply.id, request)).toEqual({
      success: true,
      data: { replyId: reply.id, appliedCount: 0 }
    })
    const line = await query('orderLine', reply.proposals[0].orderLineId)
    expect(line).toMatchObject({ promisedDate: '2026-11-28', revision: 1 })
    expect(line.changes).toHaveLength(1)
  })

  it('view: 中断确认恢复时 appliedCount 不包含已写订单并保留原确认人', async () => {
    const reply = await parsed()
    await action('decide_proposal', reply.proposals[0].id, { decision: 'accepted' })
    jest.spyOn(db.getRepository(DeliveryChangeLog), 'insert').mockRejectedValueOnce(new Error('interrupted'))
    await expect(
      action('confirm_reply', reply.id, { expectedRevision: await latestRevision(reply.id) })
    ).rejects.toThrow('interrupted')
    const current = await query('reply', reply.id)
    expect(
      await action('confirm_reply', reply.id, { expectedRevision: current.revision }, { ...context, userId: 'buyer-b' })
    ).toEqual({
      success: true,
      data: { replyId: reply.id, appliedCount: 0 }
    })
    expect((await query('orderLine', reply.proposals[0].orderLineId)).changes[0].confirmedBy).toBe(context.userId)
  })

  it('supplier-delivery-followup 验收 10: parseTimedOut、失败原因和重试命令，重试提议覆盖不重复', async () => {
    const reply = await parsed()
    await action('request_parse', reply.id, { locale: 'en' })
    expect(await action('retry_parse', reply.id, { locale: 'en' })).toMatchObject({
      success: false,
      code: 'parse_not_retryable'
    })
    await db
      .getRepository(SupplierReply)
      .update(reply.id, { parseRequestedAt: new Date(Date.now() - PARSE_TIMEOUT_MS - 1000).toISOString() })
    expect((await query('reply', reply.id)).parseTimedOut).toBe(true)
    expect((await query('replies')).items[0].parseTimedOut).toBe(true)
    expect(await action('retry_parse', reply.id, { locale: 'en' })).toEqual({
      success: true,
      data: { replyId: reply.id, parseAttempt: 3 },
      command: {
        commandKey: 'assistant.chat.send_message',
        payload: { text: parseCommandText({ ...reply, parseAttempt: 3 }, 'en'), newThread: true }
      }
    })
    await service.reportParseFailure(reply.id, 'no_delivery_info', '供应商尚未明确交期', context)
    expect(await query('reply', reply.id)).toMatchObject({
      status: 'needs_followup',
      parseTimedOut: false,
      failureCode: 'no_delivery_info',
      failureMessage: '供应商尚未明确交期'
    })
    expect(await action('retry_parse', reply.id, { locale: 'zh-Hans' })).toMatchObject({
      success: true,
      command: { payload: { text: parseCommandText({ ...reply, parseAttempt: 4 }, 'zh-Hans'), newThread: true } }
    })
    await service.saveProposal(
      {
        replyId: reply.id,
        poNumber: 'DEMO-001',
        lineNo: 1,
        changeType: 'delay',
        proposedDate: '2026-11-29',
        confidence: 0.8,
        evidence: [{ field: 'poNumber', quote: 'DEMO-001' }]
      },
      context
    )
    expect((await query('reply', reply.id)).proposals).toEqual([
      expect.objectContaining({ id: reply.proposals[0].id, proposedDate: '2026-11-29' })
    ])
    expect(await db.getRepository(ChangeProposal).count()).toBe(1)
  })

  it.each([{ tenantId: 'other-tenant' }, { organizationId: 'other-org' }, { organizationId: null }])(
    'supplier-delivery-followup 验收 12: 更换 scope %j 后不能读取或修改且 input 不能伪造 scope',
    async (override) => {
      const reply = await parsed()
      const caller = { ...context, ...override }
      const forged = { tenantId: context.tenantId, organizationId: context.organizationId!, userId: context.userId }
      expect((await query('overview', undefined, {}, caller)).orderLineCount).toBe(0)
      expect((await query('replies', undefined, {}, caller)).total).toBe(0)
      expect((await query('orderLines', undefined, {}, caller)).total).toBe(0)
      for (const [table, id, code] of [
        ['reply', reply.id, 'reply_not_found'],
        ['orderLine', reply.proposals[0].orderLineId, 'order_line_not_found']
      ]) {
        expect(
          await provider.getViewData(caller, DELIVERY_WORKBENCH_KEY, { parameters: { table, id, ...forged } })
        ).toEqual({ error: { code } })
      }
      for (const key of ['request_parse', 'retry_parse', 'confirm_reply'] as const) {
        expect(await action(key, reply.id, { ...forged, expectedRevision: reply.revision }, caller)).toMatchObject({
          success: false,
          code: 'reply_not_found'
        })
      }
      expect(
        await action('decide_proposal', reply.proposals[0].id, { ...forged, decision: 'accepted' }, caller)
      ).toMatchObject({ success: false, code: 'proposal_not_found' })
      expect((await query('reply', reply.id)).proposals[0].decision).toBe('pending')
    }
  )

  it('view: 缺失身份和未知查询动作有结构化错误', async () => {
    const invalid = { ...context, userId: '' }
    expect(await provider.getViewData(invalid, DELIVERY_WORKBENCH_KEY, { parameters: { table: 'overview' } })).toEqual({
      error: { code: 'invalid_scope' }
    })
    expect(await action('import_demo_data', '', {}, invalid)).toEqual({ success: false, code: 'invalid_scope' })
    expect(await provider.getViewData(context, DELIVERY_WORKBENCH_KEY, { parameters: { table: 'unknown' } })).toEqual({
      error: { code: 'unsupported_query' }
    })
    expect(await provider.executeViewAction(context, DELIVERY_WORKBENCH_KEY, 'unknown', {})).toEqual({
      success: false,
      code: 'unsupported_action'
    })
    expect(await provider.getViewData(context, 'unknown', {})).toEqual({ error: { code: 'unsupported_view' } })
  })

  it('view: iframe 渲染包含实际 JS/CSS 和 React，且不嵌入视图身份', async () => {
    const entry = await provider.getRemoteComponentEntry(context, DELIVERY_WORKBENCH_KEY, {
      entry: 'supplier-delivery-workbench',
      isolation: 'iframe'
    })
    expect(entry.contentType).toBe('text/html; charset=utf-8')
    expect(
      entry.html.includes(
        readFileSync(join(__dirname, 'remote-components/supplier-delivery-workbench/app.css'), 'utf8')
      )
    ).toBe(true)
    expect(entry.html.includes('Supplier delivery follow-up')).toBe(true)
    expect(entry.html.includes('ReactDOM')).toBe(true)
    expect(entry.html.includes('requestData')).toBe(true)
    for (const secret of [context.tenantId, context.organizationId!, context.userId, context.hostId])
      expect(entry.html.includes(secret)).toBe(false)
    await expect(
      provider.getRemoteComponentEntry(context, DELIVERY_WORKBENCH_KEY, { entry: '../other', isolation: 'iframe' })
    ).rejects.toThrow('unsupported_component')
  })
})

it('view: 两份语言文件键完全一致且远程组件源码无 localStorage/sessionStorage', () => {
  const root = join(__dirname, 'remote-components/supplier-delivery-workbench')
  const en = JSON.parse(readFileSync(join(root, 'locales/en.json'), 'utf8'))
  const zh = JSON.parse(readFileSync(join(root, 'locales/zh-Hans.json'), 'utf8'))
  expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  function check(directory: string) {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) check(path)
      else expect(readFileSync(path, 'utf8')).not.toMatch(/localStorage|sessionStorage/)
    }
  }
  check(join(root, 'src'))
})
