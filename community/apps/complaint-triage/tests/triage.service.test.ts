import assert from 'node:assert/strict'
import test from 'node:test'
import { ZodError } from 'zod/v3'
import { ANALYSIS_TIMEOUT_MS } from '../src/lib/constants.js'
import type { TicketDetail } from '../src/lib/domain/contracts.js'
import type { TicketScope } from '../src/lib/domain/contracts.js'
import { ComplaintAnalysisAttempt, ComplaintTicket } from '../src/lib/ticket.entity.js'
import { ComplaintTriageService } from '../src/lib/triage.service.js'
import { advance, analysisInput, harness, scope, ticketInput } from './fixtures.js'

class RaceProbe extends ComplaintTriageService {
  begin(ticketScope: TicketScope, snapshot: ComplaintTicket) {
    return this.beginAttempt(ticketScope, snapshot)
  }
}

const resolution = (ticket: TicketDetail) => ({
  category: ticket.analysis!.category,
  severity: ticket.analysis!.severity,
  summary: ticket.analysis!.summary,
  handling: '专员 2 小时内回电；全额退款；回收产品送检。',
  replyDraft: ticket.analysis!.replyDraft
})

test('full loop: create -> AI analysis -> human confirmation, and the result survives a reload', async () => {
  const { db, service, reopen } = await harness()
  try {
    const created = await service.createTicket(scope, ticketInput)
    assert.equal(created.status, 'draft')
    assert.match(created.ticketNo, /^TCK-20260917-[2-9A-HJ-NP-Z]{4}$/)

    const started = await service.requestAnalysis(scope, created.id)
    assert.deepEqual([started.started, started.attemptNo, started.ticket.status], [true, 1, 'analyzing'])

    const brief = await service.openTicketForAgent(scope, created.ticketNo)
    assert.ok(brief.success && 'sentences' in brief)
    assert.deepEqual(brief.sentences.map((sentence) => sentence.id), ['s1', 's2', 's3', 's4', 's5'])
    assert.equal(brief.attemptNo, 1, 'opening a running analysis must not start a second attempt')
    assert.ok(brief.policy.severities.P1.rule.length > 0)

    const saved = await service.saveAnalysis(scope, analysisInput(created.ticketNo))
    assert.deepEqual([saved.success, saved.success && saved.status], [true, 'pending_review'])

    const reviewed = await service.getTicket(scope, created.id)
    // Quotes are restored by the server from its own copy of the complaint, never supplied by the model.
    assert.equal(reviewed.analysis!.keyFacts[1].evidence[0].quote, '我联系过客服两次都没人回电。')
    assert.equal(reviewed.analysis!.keyFacts[1].evidenceVerified, true)
    assert.equal(reviewed.resolution, null, 'an AI suggestion is not a resolution')

    const confirmed = await service.confirmTicket(scope, { ticketId: created.id, attemptNo: 1, resolution: { ...resolution(reviewed), severity: 'P2', reviewerNote: '已电话核实' } })
    assert.equal(confirmed.status, 'confirmed')

    const reloaded = await reopen().getTicket(scope, created.id)
    assert.equal(reloaded.status, 'confirmed')
    assert.equal(reloaded.resolution!.severity, 'P2', 'the reviewer’s grade is final')
    assert.equal(reloaded.analysis!.severity, 'P1', 'the AI suggestion is kept for audit')
    assert.equal(reloaded.severity, 'P2')
    assert.deepEqual(reloaded.attempts.map((attempt) => attempt.status), ['succeeded'])
    assert.equal((await reopen().listTickets(scope)).items[0].ticketNo, created.ticketNo)
  } finally {
    await db.destroy()
  }
})

test('input validation rejects missing or oversized complaint text before anything is stored', async () => {
  const { db, service } = await harness()
  try {
    await assert.rejects(service.createTicket(scope, { ...ticketInput, content: '太短' }), ZodError)
    await assert.rejects(service.createTicket(scope, { ...ticketInput, content: '字'.repeat(4001) }), ZodError)
    assert.equal((await service.listTickets(scope)).total, 0)
  } finally {
    await db.destroy()
  }
})

test('injected downstream failure: the reason is recorded and a retry yields one ticket and one analysis', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, { ...ticketInput, faultInjection: 'first_attempt' })
    await service.requestAnalysis(scope, ticket.id)

    const failed = await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))
    assert.deepEqual([failed.success, !failed.success && failed.code, !failed.success && failed.retryable], [false, 'simulated_downstream_failure', true])
    const afterFailure = await service.getTicket(scope, ticket.id)
    assert.deepEqual([afterFailure.status, afterFailure.failureCode, afterFailure.analysis], ['analysis_failed', 'simulated_downstream_failure', null])

    // The model must not be able to slip a result in without a new attempt.
    const sneaky = await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))
    assert.deepEqual([sneaky.success, !sneaky.success && sneaky.code], [false, 'not_analyzing'])

    const retry = await service.requestAnalysis(scope, ticket.id)
    assert.deepEqual([retry.started, retry.attemptNo], [true, 2])
    assert.equal((await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))).success, true)

    const done = await service.getTicket(scope, ticket.id)
    assert.deepEqual([done.status, done.failureCode, done.analysis!.attemptNo], ['pending_review', null, 2])
    assert.deepEqual(done.attempts.map((attempt) => [attempt.attemptNo, attempt.status, attempt.failureCode]), [
      [1, 'failed', 'simulated_downstream_failure'],
      [2, 'succeeded', null]
    ])
    assert.equal(await db.getRepository(ComplaintTicket).count(), 1, 'a retry must not create a second ticket')
    assert.equal(await db.getRepository(ComplaintAnalysisAttempt).count(), 2)
  } finally {
    await db.destroy()
  }
})

test('repeated requests and repeated tool calls are idempotent', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    const first = await service.requestAnalysis(scope, ticket.id)
    const second = await service.requestAnalysis(scope, ticket.id)
    assert.deepEqual([first.started, second.started, second.attemptNo], [true, false, 1], 'a double click starts exactly one attempt')

    // A real race: two requests read the same `draft` row before either writes. sql.js has a single
    // connection, so instead of running them in parallel both callers are handed one stale snapshot.
    const raced = await service.createTicket(scope, ticketInput)
    const snapshot = await db.getRepository(ComplaintTicket).findOneByOrFail({ id: raced.id })
    const probe = new RaceProbe(db.getRepository(ComplaintTicket), db.getRepository(ComplaintAnalysisAttempt))
    assert.deepEqual([await probe.begin(scope, snapshot), await probe.begin(scope, snapshot)], [true, false])
    assert.equal((await service.getTicket(scope, raced.id)).attemptCount, 1)
    assert.equal(await db.getRepository(ComplaintAnalysisAttempt).countBy({ ticketId: raced.id }), 1)

    await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))
    const duplicate = await service.saveAnalysis(scope, { ...analysisInput(ticket.ticketNo), severity: 'P4', summary: '被篡改的第二次写入' })
    assert.deepEqual([duplicate.success, duplicate.success && duplicate.duplicate], [true, true])
    const kept = await service.getTicket(scope, ticket.id)
    assert.equal(kept.analysis!.severity, 'P1', 'the duplicate call must not overwrite the first result')
  } finally {
    await db.destroy()
  }
})

test('a silent model failure times out on read, stays retryable, and a late result is still accepted', async () => {
  const { db, service, clock } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, ticket.id)

    advance(clock, ANALYSIS_TIMEOUT_MS - 1000)
    assert.equal((await service.getTicket(scope, ticket.id)).status, 'analyzing')

    advance(clock, 2000)
    const expired = await service.getTicket(scope, ticket.id)
    assert.deepEqual([expired.status, expired.failureCode, expired.attempts[0].status], ['analysis_failed', 'timeout', 'failed'])

    // The Assistant was only slow: its answer belongs to the latest attempt and is kept.
    assert.equal((await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))).success, true)
    const late = await service.getTicket(scope, ticket.id)
    assert.deepEqual([late.status, late.failureCode, late.attempts[0].status, late.attempts[0].failureCode], ['pending_review', null, 'succeeded', null])

    // A truly dead run is retried instead, and the expired attempt stays in the audit trail.
    const other = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, other.id)
    advance(clock, ANALYSIS_TIMEOUT_MS + 1)
    const retried = await service.requestAnalysis(scope, other.id)
    assert.deepEqual([retried.started, retried.attemptNo, retried.ticket.attempts.map((attempt) => attempt.status)], [true, 2, ['failed', 'running']])
  } finally {
    await db.destroy()
  }
})

test('a confirmed ticket is final: no re-analysis, no late AI write, no second confirmation', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, ticket.id)
    await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))
    const reviewed = await service.getTicket(scope, ticket.id)
    await service.confirmTicket(scope, { ticketId: ticket.id, attemptNo: 1, resolution: resolution(reviewed) })

    await assert.rejects(service.requestAnalysis(scope, ticket.id), /already_confirmed/)
    await assert.rejects(service.confirmTicket(scope, { ticketId: ticket.id, attemptNo: 1, resolution: resolution(reviewed) }), /already_confirmed/)
    const late = await service.saveAnalysis(scope, { ...analysisInput(ticket.ticketNo), severity: 'P4' })
    assert.deepEqual([late.success, !late.success && late.code], [false, 'already_confirmed'])
    const opened = await service.openTicketForAgent(scope, ticket.ticketNo)
    assert.deepEqual([opened.success, !opened.success && opened.code], [false, 'already_confirmed'])
    assert.equal((await service.getTicket(scope, ticket.id)).resolution!.severity, 'P1')
  } finally {
    await db.destroy()
  }
})

test('the reviewer can only confirm the analysis they saw; a re-analysis supersedes the old one', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, ticket.id)
    await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))
    const seen = await service.getTicket(scope, ticket.id)

    const again = await service.requestAnalysis(scope, ticket.id)
    assert.deepEqual([again.started, again.attemptNo, again.ticket.analysis], [true, 2, null])
    await assert.rejects(service.confirmTicket(scope, { ticketId: ticket.id, attemptNo: 1, resolution: resolution(seen) }), /invalid_state/)

    await service.saveAnalysis(scope, { ...analysisInput(ticket.ticketNo), severity: 'P2' })
    await assert.rejects(service.confirmTicket(scope, { ticketId: ticket.id, attemptNo: 1, resolution: resolution(seen) }), /stale_view/)
    const current = await service.getTicket(scope, ticket.id)
    assert.deepEqual(current.attempts.map((attempt) => attempt.status), ['superseded', 'succeeded'])
    assert.equal((await service.confirmTicket(scope, { ticketId: ticket.id, attemptNo: 2, resolution: resolution(current) })).status, 'confirmed')
  } finally {
    await db.destroy()
  }
})

test('chat-first: opening a new or failed ticket starts the attempt; a reviewed suggestion is never replaced by the Agent', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    const brief = await service.openTicketForAgent(scope, ` ${ticket.ticketNo.toLowerCase()} `)
    assert.ok(brief.success && 'sentences' in brief)
    assert.deepEqual([brief.status, brief.attemptNo], ['analyzing', 1])

    const reported = await service.reportFailure(scope, { ticketNo: ticket.ticketNo, reason: '这段文字不是投诉，而是一条商品咨询。' })
    assert.equal(reported.success, true)
    const failed = await service.getTicket(scope, ticket.id)
    assert.deepEqual([failed.status, failed.failureCode, failed.failureMessage], ['analysis_failed', 'model_reported', '这段文字不是投诉，而是一条商品咨询。'])

    await service.openTicketForAgent(scope, ticket.ticketNo)
    await service.saveAnalysis(scope, analysisInput(ticket.ticketNo))
    const blocked = await service.openTicketForAgent(scope, ticket.ticketNo)
    assert.deepEqual([blocked.success, !blocked.success && blocked.code], [false, 'already_analyzed'])
    assert.equal((await service.getTicket(scope, ticket.id)).attemptCount, 2)

    const missing = await service.openTicketForAgent(scope, 'TCK-00000000-XXXX')
    assert.deepEqual([missing.success, !missing.success && missing.code], [false, 'not_found'])
  } finally {
    await db.destroy()
  }
})

test('evidence ids that do not exist are dropped and the fact is flagged for manual verification', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, ticket.id)
    const input = analysisInput(ticket.ticketNo)
    input.keyFacts = [
      { fact: '客户称已拍摄视频', evidenceIds: ['s99'] },
      { fact: '产品冒烟', evidenceIds: ['S1', 's42'] }
    ]
    const saved = await service.saveAnalysis(scope, input)
    assert.ok(saved.success)
    assert.deepEqual(saved.unknownEvidenceIds?.sort(), ['s42', 's99'])

    const { analysis } = await service.getTicket(scope, ticket.id)
    assert.deepEqual([analysis!.keyFacts[0].evidenceVerified, analysis!.keyFacts[0].evidence], [false, []])
    assert.deepEqual([analysis!.keyFacts[1].evidenceVerified, analysis!.keyFacts[1].evidence[0].sentenceId], [true, 's1'])
  } finally {
    await db.destroy()
  }
})

test('tickets are isolated by tenant and organization on every read and write path', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, ticket.id)

    for (const stranger of [{ ...scope, organizationId: 'org-b' }, { ...scope, tenantId: 'tenant-b' }]) {
      assert.equal((await service.listTickets(stranger)).total, 0)
      await assert.rejects(service.getTicket(stranger, ticket.id), /not_found/)
      await assert.rejects(service.requestAnalysis(stranger, ticket.id), /not_found/)
      const opened = await service.openTicketForAgent(stranger, ticket.ticketNo)
      assert.deepEqual([opened.success, !opened.success && opened.code], [false, 'not_found'])
      const saved = await service.saveAnalysis(stranger, analysisInput(ticket.ticketNo))
      assert.deepEqual([saved.success, !saved.success && saved.code], [false, 'not_found'])
    }
    assert.equal((await service.getTicket(scope, ticket.id)).status, 'analyzing', 'the stranger’s calls changed nothing')
  } finally {
    await db.destroy()
  }
})

test('a dispatch failure is recorded only for the attempt that failed to reach the Assistant', async () => {
  const { db, service } = await harness()
  try {
    const ticket = await service.createTicket(scope, ticketInput)
    await service.requestAnalysis(scope, ticket.id)
    assert.equal((await service.reportDispatchFailure(scope, ticket.id, 7, 'stale tab')).status, 'analyzing')
    const failed = await service.reportDispatchFailure(scope, ticket.id, 1, 'Assistant ChatKit is not ready.')
    assert.deepEqual([failed.status, failed.failureCode, failed.failureMessage], ['analysis_failed', 'dispatch_failed', 'Assistant ChatKit is not ready.'])
  } finally {
    await db.destroy()
  }
})

test('the list supports status filter, search, pagination and per-status counts', async () => {
  const { db, service, clock } = await harness()
  try {
    for (let index = 0; index < 5; index += 1) {
      advance(clock, 1000)
      await service.createTicket(scope, { ...ticketInput, customerName: `客户${index}`, content: `${ticketInput.content} 第 ${index} 条` })
    }
    const all = await service.listTickets(scope, { pageSize: 2 })
    assert.deepEqual([all.total, all.items.length, all.items[0].customerName, all.counts.draft], [5, 2, '客户4', 5])
    assert.equal((await service.listTickets(scope, { pageSize: 2, page: 3 })).items[0].customerName, '客户0')

    await service.requestAnalysis(scope, all.items[0].id)
    const analyzing = await service.listTickets(scope, { status: 'analyzing' })
    assert.deepEqual([analyzing.total, analyzing.counts.analyzing, analyzing.counts.draft], [1, 1, 4])

    assert.equal((await service.listTickets(scope, { search: '客户3' })).total, 1)
    assert.equal((await service.listTickets(scope, { search: '100%_' })).total, 0, 'LIKE wildcards in user input are literals')
  } finally {
    await db.destroy()
  }
})
