import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SupportTicketService } from '../src/lib/support-ticket.service'
import type { SupportTicketScope } from '../src/lib/types'
import { asRepository, FakeTicketRepository } from './fake-ticket-repository'

const scope: SupportTicketScope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'agent-1' }

function createService() {
  const repository = new FakeTicketRepository()
  return { repository, service: new SupportTicketService(asRepository(repository)) }
}

async function submit(
  service: SupportTicketService,
  requestId: string,
  originalMessage = '结算页面提示「支付成功」但订单仍是待付款，订单号 SO-20260921-1188，客户已重复支付两次。'
) {
  const { ticket } = await service.createTicket(scope, {
    requestId,
    customerName: '宁波启明医疗器械有限公司',
    channel: 'im',
    originalMessage
  })
  return ticket
}

async function runTriage(service: SupportTicketService, ticketId: string, reply = 'AI 草稿：已定位重复扣款，正在为您发起退款。') {
  return service.saveTriage(scope, {
    ticketId,
    category: 'billing',
    priority: 'p1',
    priorityReason: '客户已重复支付两次，存在资损风险',
    draftReply: reply
  })
}

describe('Support Ticket closed loop', () => {
  it('runs submit -> AI triage -> human edit -> confirm -> archive', async () => {
    const { repository, service } = createService()
    const ticket = await submit(service, 'request-1')

    await service.markProcessing(scope, ticket.id as string)
    const triage = await runTriage(service, ticket.id as string)
    assert.equal(triage.outcome, 'applied')

    const draft = await service.saveDraft(scope, ticket.id as string, {
      expectedRevision: triage.ticket.revision as number,
      category: 'billing',
      priority: 'p0',
      draftReply: '人工草稿：已确认重复扣款，今天 18:00 前原路退回并升级为 P0 处理。'
    })
    assert.equal(draft.outcome, 'applied')

    const confirmed = await service.confirmTicket(scope, ticket.id as string, {
      expectedRevision: draft.ticket.revision as number,
      category: 'billing',
      priority: 'p0',
      draftReply: draft.ticket.confirmedReply as string,
      reviewerNote: '已与财务确认退款通道'
    })
    assert.equal(confirmed.outcome, 'applied')
    assert.equal(confirmed.ticket.status, 'confirmed')
    assert.equal(confirmed.ticket.confirmedPriority, 'p0')
    assert.equal(confirmed.ticket.reviewedById, 'agent-1')
    assert.ok(confirmed.ticket.reviewedAt instanceof Date)

    const detail = await service.getTicketDetail(scope, ticket.id as string)
    assert.equal(detail.status, 'confirmed')
    assert.equal(detail.ai?.priority, 'p1')
    assert.equal(detail.confirmed?.priority, 'p0')
    assert.deepEqual(
      detail.events.map((event) => event.action),
      ['submitted', 'ai_completed', 'draft_saved', 'confirmed']
    )

    const viewData = await service.getViewData(scope)
    assert.equal(viewData.summary.stats.confirmed, 1)
    assert.equal(viewData.summary.stats.processing, 0)
    assert.equal(repository.rows.length, 1)
  })

  it('keeps one ticket and one business result across failure and retry', async () => {
    const { repository, service } = createService()
    const ticket = await submit(service, 'request-1')

    const failed = await service.markFailed(scope, ticket.id as string, {
      reason: '模型未在 90 秒内返回结果',
      code: 'ai_timeout'
    })
    assert.equal(failed.outcome, 'applied')
    assert.equal(failed.ticket.status, 'failed')
    assert.equal(failed.ticket.failureCode, 'ai_timeout')

    const retried = await service.retryTicket(scope, ticket.id as string)
    assert.equal(retried.outcome, 'applied')
    assert.equal(retried.ticket.status, 'processing')
    assert.equal(retried.ticket.failureReason, undefined)
    assert.equal(retried.ticket.attemptCount, 2)
    assert.equal(repository.rows.length, 1)

    const triage = await runTriage(service, ticket.id as string, 'AI 草稿（重试后）：退款已受理，附上退款流水号。')
    assert.equal(triage.outcome, 'applied')
    assert.equal(triage.ticket.failureCode, undefined)

    const confirmed = await service.confirmTicket(scope, ticket.id as string, {
      expectedRevision: triage.ticket.revision as number,
      draftReply: triage.ticket.aiDraftReply as string
    })
    assert.equal(confirmed.ticket.status, 'confirmed')
    assert.equal(repository.rows.length, 1)
    assert.equal(
      (confirmed.ticket.events ?? []).filter((event) => event.action === 'submitted').length,
      1
    )
    assert.deepEqual(
      (confirmed.ticket.events ?? []).map((event) => event.action),
      ['submitted', 'ai_failed', 'retry_requested', 'ai_completed', 'confirmed']
    )
  })

  it('refuses to confirm without a reply draft', async () => {
    const { service } = createService()
    const ticket = await submit(service, 'request-1')
    await runTriage(service, ticket.id as string)
    const detail = await service.getTicketDetail(scope, ticket.id as string)

    await assert.rejects(
      () =>
        service.confirmTicket(scope, ticket.id as string, {
          expectedRevision: detail.revision,
          draftReply: '   '
        }),
      /draftReply is required/
    )
  })

  it('filters and paginates the ticket list for the workbench', async () => {
    const { service } = createService()
    const first = await submit(service, 'request-1')
    await submit(service, 'request-2', '发票抬头需要改成「宁波启明医疗器械有限公司（杭州分公司）」。')
    const third = await submit(service, 'request-3', '账号被锁定了，管理员离职后没有人能重置密码。')

    await runTriage(service, third.id as string, 'AI 草稿：已为您重置管理员权限并发送新的登录链接。')
    await service.getTicketDetail(scope, first.id as string)

    const all = await service.searchTickets(scope, { pageSize: 2 })
    assert.equal(all.total, 3)
    assert.equal(all.items.length, 2)

    const pending = await service.searchTickets(scope, { status: 'pending_review' })
    assert.equal(pending.total, 1)
    assert.equal(pending.items[0].id, third.id)

    const keyword = await service.searchTickets(scope, { search: '发票抬头' })
    assert.equal(keyword.total, 1)

    const byCategory = await service.searchTickets(scope, { category: 'billing' })
    assert.equal(byCategory.total, 1)
  })

  it('exposes option lists, stats and the rejection reason for the workbench', async () => {
    const { service } = createService()
    const ticket = await submit(service, 'request-1')
    await service.markFailed(scope, ticket.id as string, { reason: '助手未返回结果', code: 'ai_tool_error' })

    const viewData = await service.getViewData(scope, { ticketId: ticket.id as string })

    assert.equal(viewData.meta.categories.length, 7)
    assert.equal(viewData.meta.statuses.length, 4)
    assert.equal(viewData.meta.maxMessageLength, 2000)
    assert.equal(viewData.summary.stats.failed, 1)
    assert.equal(viewData.summary.mode, 'detail')
    assert.equal(viewData.item?.failure?.reason, '助手未返回结果')
    assert.equal(viewData.item?.failure?.code, 'ai_tool_error')
    assert.equal(viewData.items[0].status, 'failed')
    assert.equal(viewData.items[0].id, ticket.id)
    assert.equal(viewData.total, 1)
  })
})
