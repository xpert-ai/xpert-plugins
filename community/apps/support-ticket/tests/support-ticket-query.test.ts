import 'reflect-metadata'
import assert from 'node:assert/strict'
import { describe, it } from 'node:test'
import { SupportTicketService } from '../src/lib/support-ticket.service'
import type { SupportTicketScope } from '../src/lib/types'
import { asRepository, FakeTicketRepository } from './fake-ticket-repository'

const scope: SupportTicketScope = { tenantId: 'tenant-1', organizationId: 'org-1', userId: 'agent-1' }
const otherOrganization: SupportTicketScope = { tenantId: 'tenant-1', organizationId: 'org-2', userId: 'agent-2' }

function createService() {
  const repository = new FakeTicketRepository()
  return { repository, service: new SupportTicketService(asRepository(repository)) }
}

/** Creation order is normalised so ordering assertions do not depend on clock resolution. */
function stampCreatedAt(repository: FakeTicketRepository) {
  repository.rows.forEach((row, index) => {
    row.createdAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index))
  })
}

async function submit(service: SupportTicketService, target: SupportTicketScope, requestId: string, message: string) {
  const { ticket } = await service.createTicket(target, {
    requestId,
    customerName: `客户 ${requestId}`,
    channel: 'email',
    originalMessage: message
  })
  return ticket
}

async function triage(
  service: SupportTicketService,
  ticketId: string,
  category: 'billing' | 'delivery' | 'account_access',
  priority: 'p0' | 'p1' | 'p2'
) {
  return service.saveTriage(scope, {
    ticketId,
    category,
    priority,
    priorityReason: `${category} ${priority}`,
    draftReply: `AI 草稿：${category}`
  })
}

describe('SupportTicketService database side queries', () => {
  it('pages the scoped list with a bounded read instead of loading every ticket', async () => {
    const { repository, service } = createService()
    for (let index = 1; index <= 7; index += 1) {
      await submit(service, scope, `request-${index}`, `第 ${index} 条客户消息`)
    }
    await submit(service, otherOrganization, 'request-foreign', '其它组织的客户消息')
    stampCreatedAt(repository)
    const newest = repository.rows[6]

    const firstPage = await service.searchTickets(scope, { page: 1, pageSize: 3 })
    const lastPage = await service.searchTickets(scope, { page: 3, pageSize: 3 })

    assert.equal(firstPage.total, 7)
    assert.equal(firstPage.items.length, 3)
    assert.equal(firstPage.items[0].id, newest.id)
    assert.deepEqual(
      firstPage.items.map((item) => item.id),
      [repository.rows[6].id, repository.rows[5].id, repository.rows[4].id]
    )
    assert.equal(lastPage.items.length, 1)
    assert.equal(lastPage.items[0].id, repository.rows[0].id)
    assert.equal(repository.queries[0].take, 3)
    assert.equal(repository.queries[0].skip, 0)
  })

  it('filters status, category, priority and keyword in the database layer', async () => {
    const { repository, service } = createService()
    const billing = await submit(service, scope, 'request-1', '付款后订单状态一直显示待付款。')
    const delivery = await submit(service, scope, 'request-2', '物流停滞在杭州分拨中心。')
    await submit(service, scope, 'request-3', '发票抬头需要改成「宁波启明医疗器械有限公司」。')
    await triage(service, billing.id as string, 'billing', 'p1')
    await triage(service, delivery.id as string, 'delivery', 'p2')
    stampCreatedAt(repository)

    assert.equal((await service.searchTickets(scope, { status: 'pending_review' })).total, 2)
    assert.equal((await service.searchTickets(scope, { category: 'billing' })).total, 1)
    assert.equal((await service.searchTickets(scope, { priority: 'p2' })).total, 1)
    assert.equal((await service.searchTickets(scope, { search: '发票抬头', status: 'confirmed' })).total, 0)
    assert.equal((await service.searchTickets(scope, { search: '不存在的关键词' })).total, 0)

    const recorded = repository.queries.length
    assert.equal((await service.searchTickets(scope, { search: '发票抬头' })).total, 1)
    assert.ok(
      Array.isArray(repository.queries[recorded].where),
      'keyword search must be expanded into SQL where alternatives'
    )
  })

  it('treats LIKE wildcards in a keyword as literal characters', async () => {
    const { service } = createService()
    await submit(service, scope, 'request-1', '促销 100% 折扣没有生效。')
    await submit(service, scope, 'request-2', '普通折扣问题，未提及比例。')

    assert.equal((await service.searchTickets(scope, { search: '100%' })).total, 1)
  })

  it('counts statuses over the whole scope even when the list is filtered and paged', async () => {
    const { repository, service } = createService()
    const confirmed = await submit(service, scope, 'request-1', '第 1 条客户消息')
    const firstFailure = await submit(service, scope, 'request-2', '第 2 条客户消息')
    const secondFailure = await submit(service, scope, 'request-3', '第 3 条客户消息')
    await submit(service, scope, 'request-4', '第 4 条客户消息')
    await submit(service, scope, 'request-5', '第 5 条客户消息')

    await triage(service, confirmed.id as string, 'billing', 'p1')
    await service.confirmTicket(scope, confirmed.id as string, {
      expectedRevision: 2,
      draftReply: 'AI 草稿：billing'
    })
    await service.markFailed(scope, firstFailure.id as string, { reason: '模型超时', code: 'ai_timeout' })
    await service.markFailed(scope, secondFailure.id as string, { reason: '模型超时', code: 'ai_timeout' })
    await submit(service, otherOrganization, 'request-foreign', '其它组织的客户消息')
    stampCreatedAt(repository)

    const viewData = await service.getViewData(scope, { page: 1, pageSize: 2 })

    assert.equal(viewData.total, 5)
    assert.equal(viewData.items.length, 2)
    assert.deepEqual(viewData.summary.stats, {
      total: 5,
      processing: 2,
      pending_review: 0,
      confirmed: 1,
      failed: 2
    })
    assert.ok(repository.counts.length >= 5, 'status counters must be aggregated by the repository')
  })

  it('keeps a selected ticket visible even when it is not on the current page', async () => {
    const { repository, service } = createService()
    const oldest = await submit(service, scope, 'request-1', '最早的客户消息')
    for (let index = 2; index <= 4; index += 1) {
      await submit(service, scope, `request-${index}`, `第 ${index} 条客户消息`)
    }
    stampCreatedAt(repository)

    const viewData = await service.getViewData(scope, { page: 1, pageSize: 2, ticketId: oldest.id as string })

    assert.equal(viewData.summary.mode, 'detail')
    assert.equal(viewData.item?.id, oldest.id)
    assert.equal(viewData.total, 4)
    assert.equal(viewData.items.length, 2)
  })

  it('keeps another organization out of the list, the selected detail and the counters', async () => {
    const { repository, service } = createService()
    const own = await submit(service, scope, 'request-1', '本组织的客户消息')
    const foreign = await submit(service, otherOrganization, 'request-2', '其它组织的客户消息')
    stampCreatedAt(repository)

    const ownView = await service.getViewData(scope)
    const foreignView = await service.getViewData(otherOrganization)

    assert.equal(ownView.total, 1)
    assert.equal(ownView.items[0].id, own.id)
    assert.equal(ownView.summary.stats.total, 1)
    assert.equal(foreignView.total, 1)
    assert.equal(foreignView.items[0].id, foreign.id)

    const crossScope = await service.getViewData(scope, { ticketId: foreign.id as string })
    assert.equal(crossScope.item, undefined)
    assert.equal(crossScope.summary.mode, 'empty')
  })
})
