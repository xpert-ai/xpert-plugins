import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SUPPORT_TICKET_MAX_MESSAGE_LENGTH } from '../src/lib/constants'
import { SupportTicketService } from '../src/lib/support-ticket.service'
import type { SupportTicketScope } from '../src/lib/types'
import { asRepository, FakeTicketRepository } from './fake-ticket-repository'

const scopeA: SupportTicketScope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'user-1' }

function createService() {
  const repository = new FakeTicketRepository()
  return { repository, service: new SupportTicketService(asRepository(repository)) }
}

function submitInput(overrides: Partial<Parameters<SupportTicketService['createTicket']>[1]> = {}) {
  return {
    requestId: 'request-1',
    customerName: '杭州云启智能设备有限公司',
    channel: 'email' as const,
    originalMessage: '上周五下单的设备开机后频繁重启，订单号 SO-20260918-771，产线已经停了两小时。',
    ...overrides
  }
}

async function createTicket(service: SupportTicketService, requestId = 'request-1') {
  const { ticket } = await service.createTicket(scopeA, submitInput({ requestId }))
  return ticket
}

describe('SupportTicketService intake rules', () => {
  it('creates one processing ticket with a scoped ticket number and a submitted event', async () => {
    const { repository, service } = createService()
    const { ticket, duplicated } = await service.createTicket(scopeA, submitInput())

    assert.equal(duplicated, false)
    assert.equal(ticket.status, 'processing')
    assert.match(ticket.ticketNo as string, /^ST-\d{8}-0001$/)
    assert.equal(ticket.attemptCount, 1)
    assert.equal(ticket.tenantId, 'tenant-1')
    assert.equal(ticket.organizationId, 'org-1')
    assert.deepEqual(
      (ticket.events ?? []).map((event) => event.action),
      ['submitted']
    )
    assert.equal(repository.rows.length, 1)
  })

  it('reuses the ticket for a repeated requestId instead of creating a second business record', async () => {
    const { repository, service } = createService()
    const first = await service.createTicket(scopeA, submitInput())

    const second = await service.createTicket(scopeA, submitInput({ customerName: '重复提交的公司' }))

    assert.equal(second.duplicated, true)
    assert.equal(second.ticket.id, first.ticket.id)
    assert.equal(second.ticket.customerName, '杭州云启智能设备有限公司')
    assert.equal(repository.rows.length, 1)
  })

  it('rejects incomplete, oversized or unsupported input', async () => {
    const { service } = createService()

    await assert.rejects(() => service.createTicket(scopeA, submitInput({ customerName: '  ' })), /customerName is required/)
    await assert.rejects(() => service.createTicket(scopeA, submitInput({ originalMessage: '' })), /originalMessage is required/)
    await assert.rejects(
      () =>
        service.createTicket(
          scopeA,
          submitInput({ originalMessage: 'a'.repeat(SUPPORT_TICKET_MAX_MESSAGE_LENGTH + 1) })
        ),
      /exceeds 2000 characters/
    )
    await assert.rejects(
      () => service.createTicket(scopeA, submitInput({ channel: 'fax' as never })),
      /channel 'fax' is not supported/
    )
  })
})

describe('SupportTicketService triage and confirmation', () => {
  it('stores the AI triage result and moves the ticket to pending_review', async () => {
    const { service } = createService()
    const ticket = await createTicket(service)

    const result = await service.saveTriage(scopeA, {
      ticketId: ticket.id as string,
      category: 'product_issue',
      priority: 'p1',
      priorityReason: '客户产线已停工两小时，属于业务中断风险',
      draftReply: '已收到您的反馈，我们会在今天 18:00 前安排工程师远程排查。',
      confidence: 0.82,
      missingInfo: ['设备序列号']
    })

    assert.equal(result.outcome, 'applied')
    assert.equal(result.ticket.status, 'pending_review')
    assert.equal(result.ticket.aiCategory, 'product_issue')
    assert.equal(result.ticket.aiPriority, 'p1')
    assert.equal(result.ticket.revision, 2)
    assert.deepEqual(result.ticket.aiMissingInfo, ['设备序列号'])
    assert.deepEqual(
      (result.ticket.events ?? []).map((event) => event.action),
      ['submitted', 'ai_completed']
    )
  })

  it('rejects unsupported category or priority values from the model', async () => {
    const { service } = createService()
    const ticket = await createTicket(service)

    await assert.rejects(
      () =>
        service.saveTriage(scopeA, {
          ticketId: ticket.id as string,
          category: 'unknown_category' as never,
          priority: 'p1',
          priorityReason: 'reason',
          draftReply: 'reply'
        }),
      /category 'unknown_category' is not supported/
    )
  })

  it('keeps a confirmed ticket immutable for later AI or failure writes', async () => {
    const { service } = createService()
    const ticket = await createTicket(service)
    await service.saveTriage(scopeA, {
      ticketId: ticket.id as string,
      category: 'billing',
      priority: 'p2',
      priorityReason: '付款后状态未更新',
      draftReply: '已为您核对账单，预计 2 小时内恢复。'
    })
    const confirmed = await service.confirmTicket(scopeA, ticket.id as string, {
      expectedRevision: 2,
      category: 'billing',
      priority: 'p1',
      draftReply: '已为您核对账单，并升级为优先级 P1 处理。'
    })
    assert.equal(confirmed.outcome, 'applied')
    assert.equal(confirmed.ticket.status, 'confirmed')

    const triageAfterConfirm = await service.saveTriage(scopeA, {
      ticketId: ticket.id as string,
      category: 'other',
      priority: 'p3',
      priorityReason: 'stale result',
      draftReply: 'stale reply'
    })
    assert.equal(triageAfterConfirm.outcome, 'already_confirmed')
    assert.equal(triageAfterConfirm.ticket.confirmedReply, '已为您核对账单，并升级为优先级 P1 处理。')

    const failureAfterConfirm = await service.markFailed(scopeA, ticket.id as string, { reason: 'late failure' })
    assert.equal(failureAfterConfirm.outcome, 'already_confirmed')
    assert.equal(failureAfterConfirm.ticket.status, 'confirmed')

    const retryAfterConfirm = await service.retryTicket(scopeA, ticket.id as string)
    assert.equal(retryAfterConfirm.outcome, 'already_confirmed')
  })

  it('reports a revision conflict without overwriting the stored record', async () => {
    const { service } = createService()
    const ticket = await createTicket(service)
    await service.saveTriage(scopeA, {
      ticketId: ticket.id as string,
      category: 'delivery',
      priority: 'p2',
      priorityReason: '物流延迟',
      draftReply: 'AI 草稿：我们已催促承运商。'
    })

    const stale = await service.saveDraft(scopeA, ticket.id as string, {
      expectedRevision: 1,
      draftReply: '人工草稿：已为您补发。'
    })
    assert.equal(stale.outcome, 'revision_conflict')
    assert.equal(stale.ticket.confirmedReply, undefined)

    const applied = await service.saveDraft(scopeA, ticket.id as string, {
      expectedRevision: 2,
      category: 'delivery',
      priority: 'p2',
      draftReply: '人工草稿：已为您补发。'
    })
    assert.equal(applied.outcome, 'applied')
    assert.equal(applied.ticket.confirmedReply, '人工草稿：已为您补发。')
    assert.equal(applied.ticket.status, 'pending_review')
    assert.equal(applied.ticket.revision, 3)
  })
})

describe('SupportTicketService scope isolation', () => {
  const otherOrganization: SupportTicketScope = { tenantId: 'tenant-1', organizationId: 'org-2', userId: 'user-2' }
  const otherTenant: SupportTicketScope = { tenantId: 'tenant-2', organizationId: 'org-1', userId: 'user-3' }

  it('does not expose another organization ticket by id', async () => {
    const { service } = createService()
    const ticket = await createTicket(service)

    await assert.rejects(() => service.getTicketDetail(otherOrganization, ticket.id as string), /was not found/)
  })

  it('does not let another organization reuse the same requestId', async () => {
    const { repository, service } = createService()
    await createTicket(service)

    await assert.rejects(() => service.createTicket(otherOrganization, submitInput()), /was not found/)
    assert.equal(repository.rows.length, 1)
  })

  it('lists only tickets of the current organization', async () => {
    const { service } = createService()
    await createTicket(service, 'request-1')
    await service.createTicket(otherOrganization, submitInput({ requestId: 'request-2' }))

    const own = await service.getViewData(scopeA)
    const other = await service.getViewData(otherOrganization)
    const foreign = await service.getViewData(otherTenant)

    assert.equal(own.total, 1)
    assert.equal(other.total, 1)
    assert.equal(foreign.total, 0)
    assert.notEqual(own.items[0].id, other.items[0].id)
  })
})
