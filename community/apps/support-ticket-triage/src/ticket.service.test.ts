import 'reflect-metadata'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { afterEach, beforeEach, expect, it } from 'vitest'
import { createTicket, parseAttemptMessage, suggestion } from './contracts.js'
import { TicketRecord } from './ticket.entity.js'
import { TicketService } from './ticket.service.js'

const owner = { tenantId: 'tenant', organizationId: 'org', workspaceId: 'workspace', userId: 'user', xpertId: 'assistant' }
const body = '升级后仓库无法扫码出库，今天下午要发货。已尝试重启终端，问题仍存在。'
const ai = suggestion.parse({
  summary: '终端升级后扫码出库失败，重启无效，影响当天发货。',
  category: 'technical', priority: 'high', evidence: '今天下午要发货',
  rationale: '无法扫码已经阻塞出库，且临近发货时间。',
})
let db: DataSource
let service: TicketService

beforeEach(async () => {
  db = await new DataSource({ type: 'sqljs', synchronize: true, entities: [TicketRecord] }).initialize()
  service = new TicketService(db.getRepository(TicketRecord))
})
afterEach(async () => { await db.destroy() })

function create() {
  return service.create(owner, { id: randomUUID(), subject: '无法扫码出库', body })
}

it('keeps the source, AI draft and final human decision when the service is reopened', async () => {
  const ticket = await create()
  const ref = await service.begin(owner, { id: ticket.id, revision: ticket.revision })
  expect(await service.readForTriage(owner, ref)).toEqual({ subject: ticket.subject, body })
  await service.suggest(owner, ref, ai)
  const [draft] = await service.list(owner)
  expect(draft).toMatchObject({ status: 'review', ai, final: null })
  await service.confirm(owner, {
    id: draft.id, revision: draft.revision, category: 'technical', priority: 'urgent', summary: ai.summary,
  })
  const reopened = new TicketService(db.getRepository(TicketRecord))
  expect(await reopened.list(owner)).toEqual([
    expect.objectContaining({ id: ticket.id, body, status: 'confirmed', ai, final: { summary: ai.summary, category: 'technical', priority: 'urgent' } })
  ])
  await expect(reopened.suggest(owner, ref, ai)).rejects.toMatchObject({ code: 'conflict' })
})

it('retries a failed attempt on the same ticket and rejects late model responses', async () => {
  const ticket = await create()
  const first = await service.begin(owner, { id: ticket.id, revision: ticket.revision })
  await service.fail(owner, first, 'model_failed')
  const [failed] = await service.list(owner)
  expect(failed).toMatchObject({ status: 'failed', failure: 'model_failed' })
  const retry = await service.begin(owner, { id: failed.id, revision: failed.revision })
  expect(retry.attemptId).not.toBe(first.attemptId)
  await service.fail(owner, first, 'dispatch_failed')
  await expect(service.suggest(owner, first, ai)).rejects.toMatchObject({ code: 'conflict' })
  await service.suggest(owner, retry, ai)
  expect(await service.list(owner)).toEqual([expect.objectContaining({ id: ticket.id, ai, status: 'review' })])
})

it('replaces a timed-out attempt without accepting its output', async () => {
  const ticket = await create()
  const expired = await service.begin(owner, { id: ticket.id, revision: ticket.revision })
  await db.getRepository(TicketRecord).update(ticket.id, { deadline: '2000-01-01T00:00:00.000Z' })
  const [timedOut] = await service.list(owner)
  expect(timedOut).toMatchObject({ status: 'failed', failure: 'timed_out' })
  await expect(service.suggest(owner, expired, ai)).rejects.toMatchObject({ code: 'conflict' })
  const resumed = await service.begin(owner, { id: timedOut.id, revision: timedOut.revision })
  await service.suggest(owner, resumed, ai)
  expect((await service.list(owner))[0].status).toBe('review')
})

it('allows only one concurrent start for the same revision', async () => {
  const ticket = await create()
  const outcomes = await Promise.allSettled([
    service.begin(owner, { id: ticket.id, revision: ticket.revision }),
    service.begin(owner, { id: ticket.id, revision: ticket.revision }),
  ])
  expect(outcomes.filter(({ status }) => status === 'fulfilled')).toHaveLength(1)
  expect(outcomes.filter(({ status }) => status === 'rejected')).toEqual([
    expect.objectContaining({ reason: expect.objectContaining({ code: 'conflict' }) })
  ])
})

it('scopes records and rejects evidence that is absent from the attached message', async () => {
  const ticket = await create()
  const ref = await service.begin(owner, { id: ticket.id, revision: ticket.revision })
  for (const scope of [{ ...owner, userId: 'different' }, { ...owner, organizationId: 'different' }]) {
    expect(await service.list(scope)).toEqual([])
    await expect(service.readForTriage(scope, ref)).rejects.toMatchObject({ code: 'not_found' })
    await expect(service.suggest(scope, ref, ai)).rejects.toMatchObject({ code: 'not_found' })
  }
  await expect(service.suggest(owner, ref, { ...ai, evidence: '其他来信的内容' })).rejects.toMatchObject({ code: 'invalid_evidence' })
  expect((await service.list(owner))[0]).toMatchObject({ status: 'processing', ai: null })
})

it('validates blank input and handles duplicate create requests without a second row', async () => {
  const input = { id: randomUUID(), subject: '扫码异常', body }
  expect(createTicket.safeParse({ ...input, subject: ' ' }).success).toBe(false)
  expect(createTicket.safeParse({ ...input, body: ' ' }).success).toBe(false)
  const one = await service.create(owner, input)
  const two = await service.create(owner, input)
  expect(two).toEqual(one)
  expect(await service.list(owner)).toHaveLength(1)
  await expect(service.create(owner, { ...input, subject: 'changed' })).rejects.toMatchObject({ code: 'conflict' })
  const ref = await service.begin(owner, { id: one.id, revision: one.revision })
  expect(parseAttemptMessage(`TRIAGE ${ref.id} ${ref.attemptId}`)).toEqual(ref)
  expect(parseAttemptMessage('customer wrote TRIAGE id attempt')).toBeUndefined()
})
