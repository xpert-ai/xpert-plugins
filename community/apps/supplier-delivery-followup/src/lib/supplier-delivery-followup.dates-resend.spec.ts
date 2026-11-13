import { createTestDataSource } from '../testing/test-data-source'
import 'reflect-metadata'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { DataSource, ILike } from 'typeorm'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import type { XpertResolvedViewHostContext } from '@xpert-ai/contracts'
import { DELIVERY_TIME_ZONE, DELIVERY_WORKBENCH_KEY } from './constants'
import { DEMO_REPLIES } from './demo-data'
import { parseCommandText } from './domain-utils'
import { ChangeProposal, DeliveryChangeLog, OrderLine, SupplierReply } from './entities'
import { SupplierDeliveryFollowupMiddleware } from './supplier-delivery-followup.middleware'
import { SupplierDeliveryFollowupService, PARSE_TIMEOUT_MS } from './supplier-delivery-followup.service'
import { SupplierDeliveryFollowupViewProvider } from './supplier-delivery-followup-view.provider'
import type { SaveProposalInput } from './types'
import type { ReplyDetailDto, WorkbenchActionKey } from './workbench-contract'

const scope: XpertResolvedViewHostContext = {
  tenantId: 'tenant-a',
  organizationId: 'org-a',
  userId: 'buyer-a',
  hostType: 'agent',
  hostId: 'assistant-a',
  slots: []
}
const rawText = DEMO_REPLIES.find((reply) => reply.kind === 'single_delay')!.rawText

describe('Supplier delivery date anchors and parse resend (real TypeORM)', () => {
  let db: DataSource
  let service: SupplierDeliveryFollowupService
  let provider: SupplierDeliveryFollowupViewProvider
  let tools: ReturnType<SupplierDeliveryFollowupMiddleware['createMiddleware']>['tools']
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
    tools = new SupplierDeliveryFollowupMiddleware(service).createMiddleware(
      {},
      scope as unknown as IAgentMiddlewareContext
    ).tools
  })
  afterEach(async () => {
    jest.restoreAllMocks()
    jest.useRealTimers()
    await db.destroy()
  })
  const invoke = async (index: number, input: unknown) =>
    JSON.parse(await (tools[index] as { invoke(input: unknown): Promise<string> }).invoke(input))
  const action = (key: WorkbenchActionKey, replyId: string, locale = 'en', caller = scope) =>
    provider.executeViewAction(caller, DELIVERY_WORKBENCH_KEY, key, { targetId: replyId, input: { locale } })
  async function detail(replyId: string) {
    const result = await provider.getViewData(scope, DELIVERY_WORKBENCH_KEY, {
      parameters: { table: 'reply', id: replyId }
    })
    return result.meta as ReplyDetailDto
  }
  const proposal = (replyId: string): SaveProposalInput => ({
    replyId,
    poNumber: 'DEMO-001',
    lineNo: 1,
    changeType: 'delay',
    proposedDate: '2026-11-28',
    confidence: 0.9,
    evidence: [
      { field: 'poNumber', quote: 'DEMO-001' },
      { field: 'proposedDate', quote: '2026-11-28' }
    ]
  })
  async function parsed(text: string = rawText) {
    await service.importDemoData(scope)
    const { reply } = await service.createReply(text, scope)
    await action('request_parse', reply.id)
    expect(await invoke(2, proposal(reply.id))).toMatchObject({ created: true })
    expect(await invoke(3, { replyId: reply.id, summary: 'Delivery update' })).toMatchObject({
      status: 'pending_review'
    })
    return detail(reply.id)
  }

  it('tool: get_reply returns Shanghai receipt anchors across the UTC date boundary', async () => {
    jest.useFakeTimers({ now: new Date('2026-11-09T16:30:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
    const { reply } = await service.createReply(rawText, scope)
    jest.setSystemTime(new Date('2027-01-01T00:00:00Z'))
    expect(DELIVERY_TIME_ZONE).toBe('Asia/Shanghai')
    expect(await invoke(0, { replyId: reply.id })).toMatchObject({
      receivedAt: '2026-11-09T16:30:00.000Z',
      receivedDate: '2026-11-10',
      receivedWeekday: 'Tuesday'
    })
  })

  it.each([false, true])('view: resend_parse resets timeout without a new attempt (timedOut=%s)', async (timedOut) => {
    jest.useFakeTimers({ now: new Date('2026-11-09T16:30:00Z'), doNotFake: ['nextTick', 'setImmediate'] })
    const { reply } = await service.createReply(rawText, scope)
    const requested = await action('request_parse', reply.id)
    const before = await service.getReply(reply.id, scope)
    jest.setSystemTime(Date.now() + (timedOut ? PARSE_TIMEOUT_MS + 1 : 1000))
    expect((await detail(reply.id)).parseTimedOut).toBe(timedOut)
    expect(await action('resend_parse', reply.id)).toEqual(requested)
    const after = await service.getReply(reply.id, scope)
    expect(after).toMatchObject({
      status: 'parsing',
      parseAttempt: before.parseAttempt,
      parseTimedOut: false,
      revision: before.revision + 1,
      parseRequestedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    })
    expect(after.parseRequestedAt).not.toBe(before.parseRequestedAt)
  })

  it.each(['received', 'pending_review', 'confirmed', 'needs_followup', 'failed'] as const)(
    'view: resend_parse rejects %s without mutation',
    async (status) => {
      const { reply } = await service.createReply(rawText, scope)
      await db.getRepository(SupplierReply).update(reply.id, { status })
      const before = await service.getReply(reply.id, scope)
      expect(await action('resend_parse', reply.id)).toEqual({ success: false, code: 'invalid_reply_state' })
      expect(await service.getReply(reply.id, scope)).toEqual(before)
    }
  )

  it('view: resend_parse cannot read or mutate a reply in another scope', async () => {
    const { reply } = await service.createReply(rawText, scope)
    await action('request_parse', reply.id)
    const before = await service.getReply(reply.id, scope)
    for (const caller of [
      { ...scope, tenantId: 'tenant-b' },
      { ...scope, organizationId: 'org-b' },
      { ...scope, organizationId: null }
    ]) {
      await expect(service.getReply(reply.id, caller)).rejects.toMatchObject({ code: 'reply_not_found' })
      await expect(service.resendParse(reply.id, caller)).rejects.toMatchObject({ code: 'reply_not_found' })
      expect(await action('resend_parse', reply.id, 'en', caller)).toMatchObject({
        success: false,
        code: 'reply_not_found'
      })
    }
    expect(await service.getReply(reply.id, scope)).toEqual(before)
  })

  it.each(['zh-Hans', 'en', 'fr'])(
    'view: resend_parse uses the same localized command as request_parse (%s)',
    async (locale) => {
      const { reply } = await service.createReply(rawText, scope)
      const requested = await action('request_parse', reply.id, locale)
      const resent = await action('resend_parse', reply.id, locale)
      expect(resent).toEqual(requested)
      expect(resent).toEqual({
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
    }
  )

  it('view: pending_review stale proposal becomes current after request_parse and agent save_proposal', async () => {
    const first = await parsed()
    const other = await parsed(`${rawText}\n另一封回复`)
    await service.decideProposal(other.proposals[0].id, 'accepted', undefined, undefined, scope)
    await service.confirmReply(other.id, scope.userId, scope)
    expect((await detail(first.id)).proposals[0].stale).toBe(true)
    expect(await action('request_parse', first.id)).toMatchObject({ success: true, data: { parseAttempt: 2 } })
    expect((await detail(first.id)).proposals).toEqual([])
    expect(await invoke(2, { ...proposal(first.id), changeType: 'unchanged' })).toMatchObject({
      proposalId: first.proposals[0].id,
      created: false
    })
    expect(await invoke(3, { replyId: first.id, summary: 'Reparsed' })).toMatchObject({ status: 'pending_review' })
    expect((await detail(first.id)).proposals).toEqual([
      expect.objectContaining({
        id: first.proposals[0].id,
        stale: false,
        baseDate: '2026-11-28',
        currentDate: '2026-11-28',
        decision: 'pending'
      })
    ])
  })

  it('tool: order search is case-insensitive, and exact filters read % and _ literally', async () => {
    await service.importDemoData(scope)
    const repo = db.getRepository(OrderLine)
    const line = await repo.findOneByOrFail({ poNumber: 'DEMO-001', lineNo: 1 })
    await repo.update(line.id, { materialName: 'Spring Assembly', supplierName: 'Demo Supplier' })
    const find = jest.spyOn(repo, 'findAndCount')
    for (const keyword of ['mat-01', 'MAT-01', 'spring', 'SPRING']) {
      expect(await invoke(1, { keyword })).toMatchObject({ total: 1, items: [{ orderLineId: line.id }] })
      // SQLite LIKE is also case-insensitive; assert ILike to protect the PostgreSQL behavior.
      expect(find).toHaveBeenLastCalledWith(
        expect.objectContaining({
          where: [
            expect.objectContaining({ materialName: ILike(`%${keyword}%`) }),
            expect.objectContaining({ materialCode: ILike(`%${keyword}%`) })
          ]
        })
      )
    }
    // Exact filters compare LOWER() values, which test:pg also checks on PostgreSQL.
    expect(await invoke(1, { poNumber: 'demo-001', supplierName: 'demo supplier' })).toMatchObject({ total: 1 })
    expect(await invoke(1, { poNumber: 'demo-00_', supplierName: 'demo%' })).toMatchObject({ total: 0 })
  })

  it('view: manifest exposes seven actions including localized resend_parse', () => {
    for (const slot of ['agent.workbench.main', 'agent.workbench.fixed']) {
      const [manifest] = provider.getViewManifests(scope, slot)
      expect(manifest.actions).toHaveLength(7)
      expect(manifest.actions).toContainEqual({
        key: 'resend_parse',
        actionType: 'invoke',
        label: { en_US: 'Resend to assistant', zh_Hans: '重新发送给助手' }
      })
    }
  })
})

it('tool: assistant template anchors relative dates to receivedDate and preserves original evidence', () => {
  const yaml = readFileSync(join(__dirname, '..', 'xpert-supplier-delivery-followup-assistant.yaml'), 'utf8')
  for (const rule of [
    'current promisedDate',
    'from receivedDate and receivedWeekday',
    'nearest occurrence on or after receivedDate',
    'Write reason in the language of the supplier reply',
    'Evidence must quote the original relative wording',
    'confidence no higher than 0.7',
    'requires no_delivery_info',
    'Do not create proposals for invoices, payments or greetings',
    'stays on schedule (changeType unchanged)'
  ])
    expect(yaml).toContain(rule)
})

it('view: weekly_update is first, verbatim and browser-safe', () => {
  expect(DEMO_REPLIES[0]).toEqual({
    kind: 'weekly_update',
    rawText:
      '王工好，同步下本周情况：\n1、弹簧组件热处理炉检修，要比原计划晚一周出货，数量不变；\n2、滑轨那单按原计划先发一半，剩下的 12 月 5 号前补齐；\n3、锁扣组件按原计划；\n4、铰链可以提前三天给到。\n发票下周一一起寄出。\n—— 虚构月榫组件屋 小李'
  })
  expect(readFileSync(join(__dirname, 'demo-data.ts'), 'utf8')).not.toMatch(/\bimport\b|\brequire\s*\(/)
})

it('view: preview resend_parse preserves attempts, refreshes timeout and localizes commands', () => {
  const previewPath = join(__dirname, 'remote-components/supplier-delivery-workbench/preview.config.mjs')
  const output = execFileSync(
    process.execPath,
    [
      '--input-type=module',
      '-e',
      `
    import { pathToFileURL } from 'node:url'
    const { default: preview } = await import(pathToFileURL(process.argv[1]).href)
    const state = preview.state
    const reply = state.replies.find(reply => reply.status === 'parsing')
    const before = { ...reply }
    const invoke = message => preview.handleRequest(message, { state })
    const results = []
    for (const locale of ['zh-Hans', 'en', 'fr']) {
      results.push((await invoke({ type: 'executeAction', actionKey: 'resend_parse', targetId: reply.id, input: { locale } })).result)
    }
    const detail = (await invoke({ type: 'requestData', query: { parameters: { table: 'reply', id: reply.id } } })).data.meta
    const invalid = []
    for (const status of ['received', 'pending_review', 'confirmed']) {
      reply.status = status
      invalid.push((await invoke({ type: 'executeAction', actionKey: 'resend_parse', targetId: reply.id })).result)
    }
    reply.status = 'pending_review'
    const reparse = (await invoke({ type: 'executeAction', actionKey: 'request_parse', targetId: reply.id })).result
    console.log(JSON.stringify({ before, results, detail, invalid, reparse }))
  `,
      previewPath
    ],
    { encoding: 'utf8', env: { ...process.env, PREVIEW_SCENARIO: 'demo' } }
  )
  const { before, results, detail, invalid, reparse } = JSON.parse(output)
  expect(detail).toMatchObject({
    parseAttempt: before.parseAttempt,
    revision: before.revision + 3,
    parseTimedOut: false
  })
  expect(Date.parse(detail.parseRequestedAt)).toBeGreaterThan(Date.parse(before.parseRequestedAt))
  for (const [index, result] of results.entries()) {
    expect(result).toEqual({
      success: true,
      data: { replyId: before.id, parseAttempt: before.parseAttempt },
      command: {
        commandKey: 'assistant.chat.send_message',
        payload: {
          newThread: true,
          text: parseCommandText(before, index === 0 ? 'zh-Hans' : 'en')
        }
      }
    })
  }
  expect(invalid).toEqual(Array(3).fill({ success: false, code: 'invalid_reply_state' }))
  expect(reparse).toMatchObject({ success: true, data: { parseAttempt: before.parseAttempt + 1 } })
})
