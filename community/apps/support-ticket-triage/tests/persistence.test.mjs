import 'reflect-metadata'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { test } from 'node:test'

const url = process.env.XPERT_TRIAGE_TEST_DATABASE_URL
test('ticket retry and review through PostgreSQL', { skip: url ? false : 'set a disposable test database URL' }, async () => {
  const { DataSource } = await import('typeorm')
  const { Ticket } = await import('../dist/ticket.entity.js')
  const { TicketService } = await import('../dist/ticket.service.js')
  const schema = `triage_test_${randomUUID().replaceAll('-', '')}`
  const db = new DataSource({ type: 'postgres', url, schema, entities: [Ticket] })
  await db.initialize()
  try {
    const setup = db.createQueryRunner()
    try { await setup.createSchema(schema, true) }
    finally { await setup.release() }
    await db.synchronize()
    const tickets = new TicketService(db.getRepository(Ticket))
    const scope = { tenantId: randomUUID(), organizationId: randomUUID(), ownerId: randomUUID() }
    const id = randomUUID()
    const ticket = { id, title: 'Login outage', description: 'All twelve users are unable to sign in.' }
    const draft = {
      category: 'access',
      priority: 'P0',
      summary: 'Team login outage.',
      rationale: 'All users cannot sign in.',
      reply: 'Which workspace is affected?',
      needsClarification: true
    }
    assert.deepEqual(await tickets.create(scope, ticket), { id, status: 'new' })
    assert.deepEqual(await tickets.create(scope, ticket), { id, status: 'new' })
    assert.equal((await tickets.list(scope)).total, 1)
    await assert.rejects(tickets.get({ ...scope, ownerId: randomUUID() }, id), /ticket_unavailable/)
    await assert.rejects(tickets.get({ ...scope, organizationId: randomUUID() }, id), /ticket_unavailable/)

    const first = await tickets.saveDraft(scope, id, draft)
    const repeated = await tickets.saveDraft(scope, id, { ...draft, priority: 'P1' })
    assert.equal(first.changed, true)
    assert.equal(repeated.changed, false)
    assert.equal((await tickets.get(scope, id)).draft.priority, 'P0')

    const review = { id, draftRevision: first.revision, category: 'access', priority: 'P1', reply: 'Please provide your workspace name.' }
    await assert.rejects(tickets.review(scope, { ...review, draftRevision: 2 }), /state_conflict/)
    await tickets.review(scope, review)
    await tickets.review(scope, review)
    const reopened = await new TicketService(db.getRepository(Ticket)).get(scope, id)
    assert.equal(reopened.review.reply, review.reply)
    assert.equal(reopened.status, 'reviewed')
    assert.equal(reopened.draft.priority, 'P0')
    assert.equal((await tickets.list(scope)).total, 1)
  } finally {
    const runner = db.createQueryRunner()
    try { await runner.dropSchema(schema, true, true) }
    finally { await runner.release(); await db.destroy() }
  }
})
