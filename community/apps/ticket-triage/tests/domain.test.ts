import assert from 'node:assert/strict'
import { test } from 'node:test'
import { proposeTriageSchema, scopeSchema, TicketTriageError } from '../src/lib/domain/contracts.js'
import type { TicketScope } from '../src/lib/domain/contracts.js'
import { TicketRecord } from '../src/lib/ticket.entity.js'
import { TicketTriageService } from '../src/lib/ticket.service.js'

/** In-memory stand-in for the TypeORM repository: same unique key, same optimistic update. */
class FakeTicketRepository {
  rows: TicketRecord[] = []
  private key(record: { tenantId: string; organizationId: string; workspaceId: string; userId: string; xpertId: string; ticketCode: string }) {
    return [record.tenantId, record.organizationId, record.workspaceId, record.userId, record.xpertId, record.ticketCode].join('|')
  }
  private matches(record: TicketRecord, where: Record<string, unknown>) {
    return Object.entries(where).every(([field, value]) => (record as unknown as Record<string, unknown>)[field] === value)
  }
  async find(options: { where: Record<string, unknown> }) {
    return this.rows.filter(row => this.matches(row, options.where)).map(row => ({ ...row }))
  }
  async findOne(options: { where: Record<string, unknown> }) {
    const row = this.rows.find(candidate => this.matches(candidate, options.where))
    return row ? { ...row } : null
  }
  manager = {
    insert: async (_entity: unknown, values: Record<string, unknown>[]) => {
      const seen = new Set(this.rows.map(row => this.key(row)))
      for (const value of values) {
        const record = value as unknown as TicketRecord
        if (seen.has(this.key(record))) throw new Error('UNIQUE constraint failed: plugin_ticket_triage_ticket.ticket_code')
        this.rows.push({ ...record })
      }
    },
    update: async (_entity: unknown, where: Record<string, unknown>, patch: Record<string, unknown>) => {
      const row = this.rows.find(candidate => this.matches(candidate, where))
      if (!row) return { affected: 0 }
      Object.assign(row, patch)
      return { affected: 1 }
    }
  }
}

const scope: TicketScope = {
  tenantId: 'tenant-1', organizationId: 'org-1', workspaceId: 'ws-1', userId: 'user-1', xpertId: 'xpert-1'
}

const build = () => {
  const repository = new FakeTicketRepository()
  const service = new TicketTriageService(repository as never)
  return { repository, service }
}

const first = async (service: TicketTriageService) => {
  const board = await service.seedDemoTickets(scope)
  return board.items[0]
}

test('seeding is idempotent and produces a full board', async () => {
  const { service } = build()
  const seeded = await service.seedDemoTickets(scope)
  assert.equal(seeded.summary.total, 4)
  assert.equal(seeded.summary.pending, 4)
  const again = await service.seedDemoTickets(scope)
  assert.equal(again.summary.total, 4, 'seeding twice must not duplicate tickets')
})

test('a proposal does not close the ticket: it waits for a human', async () => {
  const { service } = build()
  const ticket = await first(service)
  await service.proposeTriage(scope, {
    ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P1', team: 'billing',
    rationale: '客户已付款但权益未生效。', draftReply: '已为您加急处理，今天内回复。'
  })
  const board = await service.board(scope)
  const proposed = board.items.find(item => item.ticketCode === ticket.ticketCode)!
  assert.equal(proposed.status, 'proposed')
  assert.equal(proposed.priority, 'P1')
  assert.equal(proposed.attemptCount, 1)
  assert.equal(board.summary.confirmed, 0)
})

test('confirm is the only transition that closes a ticket', async () => {
  const { service } = build()
  const ticket = await first(service)
  const proposal = await service.proposeTriage(scope, {
    ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P0', team: 'technical_support',
    rationale: '支付成功但未开通，涉及已付金额。', draftReply: '正在核查订单，稍后同步。'
  })
  await service.confirmTriage(scope, { ticketCode: ticket.ticketCode, expectedRevision: proposal.revision, reviewNote: '已核实' })
  const board = await service.board(scope)
  assert.equal(board.summary.confirmed, 1)
  assert.equal(board.summary.proposed, 0)
})

test('reject returns the ticket to pending and clears the rejected proposal', async () => {
  const { service } = build()
  const ticket = await first(service)
  const proposal = await service.proposeTriage(scope, {
    ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P2', team: 'product',
    rationale: '看起来是产品问题。', draftReply: '我们会评估。'
  })
  await service.rejectTriage(scope, { ticketCode: ticket.ticketCode, expectedRevision: proposal.revision, reason: '应转技术支持' })
  const board = await service.board(scope)
  const rejected = board.items.find(item => item.ticketCode === ticket.ticketCode)!
  assert.equal(rejected.status, 'pending')
  assert.equal(rejected.priority, null)
  assert.equal(rejected.rationale, null)
  assert.equal(rejected.reviewNote, '应转技术支持')
})

test('a stale revision is a conflict, not a silent overwrite', async () => {
  const { service } = build()
  const ticket = await first(service)
  await service.proposeTriage(scope, {
    ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P1', team: 'billing',
    rationale: '第一次判断。', draftReply: '草稿一。'
  })
  await assert.rejects(
    () => service.proposeTriage(scope, {
      ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P2', team: 'logistics',
      rationale: '第二次判断。', draftReply: '草稿二。'
    }),
    (error: unknown) => error instanceof TicketTriageError && error.code === 'conflict'
  )
  const board = await service.board(scope)
  const current = board.items.find(item => item.ticketCode === ticket.ticketCode)!
  assert.equal(current.priority, 'P1', 'the first proposal must survive the conflict')
  assert.equal(current.revision, ticket.revision + 1, 'a rejected write must not bump the revision')
})

test('retry after a failed attempt returns the ticket to the queue without duplicating results', async () => {
  const { service } = build()
  const ticket = await first(service)
  await service.markFailed(scope, ticket.ticketCode, ticket.revision, 'model_timeout')
  let board = await service.board(scope)
  let failed = board.items.find(item => item.ticketCode === ticket.ticketCode)!
  assert.equal(failed.status, 'failed')
  assert.equal(failed.lastErrorCode, 'model_timeout')
  assert.equal(failed.attemptCount, 1)

  await service.resetTicket(scope, { ticketCode: ticket.ticketCode, expectedRevision: failed.revision })
  board = await service.board(scope)
  failed = board.items.find(item => item.ticketCode === ticket.ticketCode)!
  assert.equal(failed.status, 'pending')
  assert.equal(failed.lastErrorCode, null)
  assert.equal(board.summary.total, 4, 'retry must not create a second ticket')
  assert.equal(board.summary.proposed, 0)
})

test('confirmed tickets cannot be proposed again or reset', async () => {
  const { service } = build()
  const ticket = await first(service)
  const proposal = await service.proposeTriage(scope, {
    ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P3', team: 'customer_success',
    rationale: '普通咨询。', draftReply: '已回复。'
  })
  const confirmed = await service.confirmTriage(scope, { ticketCode: ticket.ticketCode, expectedRevision: proposal.revision })
  await assert.rejects(
    () => service.proposeTriage(scope, {
      ticketCode: ticket.ticketCode, expectedRevision: confirmed.revision, priority: 'P1', team: 'billing',
      rationale: '再判一次。', draftReply: '草稿。'
    }),
    (error: unknown) => error instanceof TicketTriageError && error.code === 'invalid_state'
  )
  await assert.rejects(
    () => service.resetTicket(scope, { ticketCode: ticket.ticketCode, expectedRevision: confirmed.revision }),
    (error: unknown) => error instanceof TicketTriageError && error.code === 'invalid_state'
  )
})

test('unknown tickets are not found, other tenants are not visible', async () => {
  const { service } = build()
  await service.seedDemoTickets(scope)
  await assert.rejects(
    () => service.proposeTriage(scope, {
      ticketCode: 'T-9999', expectedRevision: 1, priority: 'P2', team: 'billing', rationale: 'x', draftReply: 'y'
    }),
    (error: unknown) => error instanceof TicketTriageError && error.code === 'not_found'
  )
  const other = await service.board({ ...scope, tenantId: 'tenant-2' })
  assert.equal(other.summary.total, 0)
})

test('the assistant view hides confirmed tickets and never leaks scope ids', async () => {
  const { service } = build()
  const ticket = await first(service)
  const proposal = await service.proposeTriage(scope, {
    ticketCode: ticket.ticketCode, expectedRevision: ticket.revision, priority: 'P2', team: 'logistics',
    rationale: '物流问题。', draftReply: '已联系快递。'
  })
  await service.confirmTriage(scope, { ticketCode: ticket.ticketCode, expectedRevision: proposal.revision })
  const view = await service.listForAssistant(scope)
  assert.equal(view.items.length, 3)
  assert.ok(!view.items.some(item => item.ticketCode === ticket.ticketCode))
  assert.ok(!JSON.stringify(view).includes('tenant-1'), 'scope ids must not reach the model')
})

test('input schemas reject bad priorities, unknown teams and oversized text', () => {
  const base = { ticketCode: 'T-1001', expectedRevision: 1, priority: 'P1', team: 'billing', rationale: 'ok', draftReply: 'ok' }
  assert.equal(proposeTriageSchema.safeParse(base).success, true)
  assert.equal(proposeTriageSchema.safeParse({ ...base, priority: 'P9' }).success, false)
  assert.equal(proposeTriageSchema.safeParse({ ...base, team: 'legal' }).success, false)
  assert.equal(proposeTriageSchema.safeParse({ ...base, rationale: 'x'.repeat(2001) }).success, false)
  assert.equal(proposeTriageSchema.safeParse({ ...base, ticketCode: 'bad code/../x' }).success, false)
  assert.equal(scopeSchema.safeParse({ tenantId: 't', organizationId: '', workspaceId: '', userId: 'u', xpertId: 'x' }).success, true)
})

test('plugin metadata is tenant scoped, targets xpert and ships a connected Assistant template', async () => {
  const { default: plugin } = await import('../src/index.js')
  assert.equal(plugin.meta.level, 'tenant')
  assert.deepEqual(plugin.meta.targetApps, ['xpert'])
  assert.equal(plugin.meta.artifactNamespace, 'ticket_triage')
  const runtime = plugin.meta.targetAppMeta?.xpert?.runtime
  assert.ok(runtime?.viewProviders.includes('ticket_triage.board'))
  assert.ok(runtime?.middlewareProviders.includes('TicketTriageMiddleware'))
  const template = plugin.templates?.[0]
  assert.ok(template, 'the plugin must ship at least one Assistant template')
  assert.ok(template.dslContent.includes('TicketTriageMiddleware'), 'the template must wire the middleware into the agent')
  assert.ok(template.dslContent.includes('Agent_TicketTriage'))
})
