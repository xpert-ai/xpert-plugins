import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { AIMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import { DEFAULT_PROMPT } from '../src/lib/domain/evaluation.js'
import { answer, confirmedCase, createService, newCase, PNG_DATA_URL, runtimeFor, scope } from './fixtures.js'

const code = (expected: string) => (error: Error & { code?: string }) => error.code === expected

test('one recognition makes one model call with the prompt in effect and leaves a suggestion for a person', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase('PRIVATE_CASE_TITLE'))
    const seen: BaseMessage[][] = []
    const detail = await f.analyzer.analyze(scope, created.id, runtimeFor(async messages => { seen.push(messages); return answer('plumbing') }))

    assert.equal(seen.length, 1)
    assert.ok(String(seen[0][0].content).startsWith(DEFAULT_PROMPT))
    assert.ok(JSON.stringify(seen[0][1].content).includes('image_url'))
    assert.ok(!JSON.stringify(seen[0]).includes('PRIVATE_CASE_TITLE'), 'the description is not shown to the model')

    assert.equal(detail.status, 'suggested')
    assert.deepEqual(detail.suggestion, {
      categoryId: 'plumbing', reason: 'A pipe is visibly leaking.', model: 'test-vision', promptSource: { type: 'default' }
    })
    assert.equal(detail.suggestedCategoryId, 'plumbing')
    assert.equal(detail.confirmedCategoryId, null, 'the model does not decide')
    assert.equal(detail.canConfirm, true)
  } finally { await f.db.destroy() }
})

test('a person accepts or corrects the suggestion; the case is then final and keeps what was suggested', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    const suggested = await f.analyzer.analyze(scope, created.id, runtimeFor(async () => answer('plumbing')))
    const other = { ...scope, userId: 'user-2' }
    await assert.rejects(f.service.confirmCase(other, { caseId: created.id, revision: suggested.revision, categoryId: 'surfaces' }), code('not_found'))
    await assert.rejects(f.service.confirmCase(scope, { caseId: created.id, revision: suggested.revision - 1, categoryId: 'surfaces' }), code('conflict'))
    await assert.rejects(f.service.confirmCase(scope, { caseId: created.id, revision: suggested.revision, categoryId: 'roof' }), /Unknown category/)

    const confirmed = await f.service.confirmCase(scope, { caseId: created.id, revision: suggested.revision, categoryId: 'surfaces' })
    assert.equal(confirmed.status, 'confirmed')
    assert.equal(confirmed.confirmedCategoryId, 'surfaces')
    assert.equal(confirmed.suggestedCategoryId, 'plumbing', 'the correction stays visible')
    assert.deepEqual([confirmed.canAnalyze, confirmed.canConfirm], [false, false])

    let calls = 0
    await assert.rejects(f.analyzer.analyze(scope, created.id, runtimeFor(async () => { calls++; return answer() })), code('invalid_state'))
    assert.equal(calls, 0)
    await assert.rejects(f.service.confirmCase(scope, { caseId: created.id, revision: confirmed.revision, categoryId: 'plumbing' }), code('invalid_state'))
  } finally { await f.db.destroy() }
})

test('a failed recognition is saved without provider text, can be retried, and does not block the person', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    const malformed = await f.analyzer.analyze(scope, created.id, runtimeFor(async () => new AIMessage('Probably plumbing.')))
    assert.deepEqual([malformed.status, malformed.failureCode, malformed.suggestion], ['failed', 'invalid_output', null])
    assert.deepEqual([malformed.canAnalyze, malformed.canConfirm], [true, true])

    const crashed = await f.analyzer.analyze(scope, created.id, runtimeFor(async () => { throw new Error('Bearer SECRET_URL_CREDENTIAL') }))
    assert.equal(crashed.failureCode, 'model_call_failed')
    assert.ok(!JSON.stringify(crashed).includes('SECRET'))

    const unconfigured = runtimeFor(async () => answer())
    unconfigured.getDefaultChatModel = async () => undefined
    assert.equal((await f.analyzer.analyze(scope, created.id, unconfigured)).failureCode, 'model_unavailable')

    const retried = await f.analyzer.analyze(scope, created.id, runtimeFor(async () => answer('electrical')))
    assert.deepEqual([retried.status, retried.failureCode, retried.suggestion?.categoryId], ['suggested', null, 'electrical'])

    // A person can also decide straight away on a case whose recognition failed.
    const second = await f.service.createCase(scope, { ...newCase('No suggestion'), photo: { dataUrl: PNG_DATA_URL } })
    const failed = await f.analyzer.analyze(scope, second.id, runtimeFor(async () => new AIMessage('{}')))
    const confirmed = await f.service.confirmCase(scope, { caseId: second.id, revision: failed.revision, categoryId: 'unclear' })
    assert.deepEqual([confirmed.status, confirmed.suggestedCategoryId, confirmed.failureCode], ['confirmed', null, null])
  } finally { await f.db.destroy() }
})

test('a timeout is recorded and a late provider reply cannot replace it', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    f.analyzer.timeoutMs = 10
    let resolve!: (value: AIMessage) => void
    const timedOut = await f.analyzer.analyze(scope, created.id, runtimeFor(() => new Promise<AIMessage>(done => { resolve = done })))
    assert.equal(timedOut.failureCode, 'timeout')
    resolve(answer())
    await new Promise(done => setImmediate(done))
    const stored = await f.service.getCaseDetail(scope, created.id)
    assert.deepEqual([stored.status, stored.failureCode, stored.suggestion], ['failed', 'timeout', null])
  } finally { await f.db.destroy() }
})

test('simultaneous requests for the same case make a single model call', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const start = new Promise<void>(resolve => { entered = resolve })
    let calls = 0
    const runtime = runtimeFor(async () => { calls++; entered(); await gate; return answer() })
    const first = f.analyzer.analyze(scope, created.id, runtime)
    await start
    assert.deepEqual([(await f.service.getCase(scope, created.id)).canAnalyze, (await f.service.getCase(scope, created.id)).canConfirm], [false, false])
    await assert.rejects(f.analyzer.analyze(scope, created.id, runtime), code('conflict'))
    assert.equal(calls, 1)
    release()
    assert.equal((await first).status, 'suggested')
  } finally { await f.db.destroy() }
})

test('a result that arrives after the case moved on is refused and overwrites nothing', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const start = new Promise<void>(resolve => { entered = resolve })
    const slow = f.analyzer.analyze(scope, created.id, runtimeFor(async () => { entered(); await gate; return answer('electrical') }))
    await start
    // The call has been out for longer than an analysis is trusted to take; the person decides without it.
    const later = new Date(Date.now() + 4 * 60 * 1000)
    f.service.now = () => later
    const abandoned = await f.service.getCase(scope, created.id)
    assert.deepEqual([abandoned.status, abandoned.canAnalyze, abandoned.canConfirm], ['analyzing', true, true])
    await f.service.confirmCase(scope, { caseId: created.id, revision: abandoned.revision, categoryId: 'safety' })

    release()
    await assert.rejects(slow, code('conflict'))
    const stored = await f.service.getCaseDetail(scope, created.id)
    assert.deepEqual([stored.status, stored.confirmedCategoryId, stored.suggestion], ['confirmed', 'safety', null])
  } finally { await f.db.destroy() }
})

test('recognition uses the prompt a person adopted; other verdicts and other users leave it unchanged', async () => {
  const f = await createService()
  try {
    assert.deepEqual(await f.evaluations.activePrompt(scope), { text: DEFAULT_PROMPT, source: { type: 'default' }, runTitle: null })
    const sample = await confirmedCase(f)
    const runtime = runtimeFor(async () => answer('plumbing'))
    const decide = async (title: string, promptB: string, verdict: 'a' | 'b' | 'tie' | 'neither') => {
      const run = await f.evaluations.create(scope, { requestKey: randomUUID(), title, sampleIds: [sample.id], promptA: 'CURRENT_PROMPT', promptB })
      await f.runner.next(scope, run.id, runtime)
      const done = await f.runner.next(scope, run.id, runtime)
      return f.evaluations.decide(scope, { runId: run.id, revision: done.revision, verdict, note: 'Reviewed.' })
    }
    const adopted = await decide('Stricter wording', 'CANDIDATE_PROMPT', 'b')
    const expected = { text: 'CANDIDATE_PROMPT', source: { type: 'adopted', runId: adopted.id, variant: 'b' }, runTitle: 'Stricter wording' }
    assert.deepEqual(await f.evaluations.activePrompt(scope), expected)

    // A later run that adopts nothing does not take the adopted prompt out of effect.
    const later = new Date(Date.now() + 60_000)
    f.evaluations.now = () => later
    await decide('Second candidate', 'REJECTED_PROMPT', 'neither')
    assert.deepEqual(await f.evaluations.activePrompt(scope), expected)
    assert.equal((await f.evaluations.activePrompt({ ...scope, userId: 'user-2' })).source.type, 'default')

    const created = await f.service.createCase(scope, { ...newCase('Next report'), photo: { dataUrl: PNG_DATA_URL } })
    const seen: BaseMessage[][] = []
    const detail = await f.analyzer.analyze(scope, created.id, runtimeFor(async messages => { seen.push(messages); return answer('surfaces') }))
    assert.ok(String(seen[0][0].content).startsWith('CANDIDATE_PROMPT'))
    assert.deepEqual(detail.suggestion?.promptSource, expected.source)
  } finally { await f.db.destroy() }
})

test('only cases a person confirmed can be acceptance samples, with the confirmed category as the reference', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    const input = () => ({ requestKey: randomUUID(), title: 'Prompt regression', sampleIds: [created.id], promptA: 'A', promptB: 'B' })
    await assert.rejects(f.evaluations.create(scope, input()), /Only cases confirmed/)
    const suggested = await f.analyzer.analyze(scope, created.id, runtimeFor(async () => answer('plumbing')))
    await assert.rejects(f.evaluations.create(scope, input()), /Only cases confirmed/, 'a suggestion alone is not a reference')

    await f.service.confirmCase(scope, { caseId: created.id, revision: suggested.revision, categoryId: 'surfaces' })
    const run = await f.evaluations.get(scope, (await f.evaluations.create(scope, input())).id)
    assert.equal(run.snapshot.samples[0].referenceCategoryId, 'surfaces')
  } finally { await f.db.destroy() }
})

test('an abandoned recognition becomes retryable once it is stale', async () => {
  const f = await createService()
  try {
    const created = await f.service.createCase(scope, newCase())
    const first = await f.service.startAnalysis(scope, created.id)
    await assert.rejects(f.service.startAnalysis(scope, created.id), code('conflict'))
    const later = new Date(Date.now() + 4 * 60 * 1000)
    f.service.now = () => later
    assert.equal((await f.service.getCase(scope, created.id)).canAnalyze, true)
    const second = await f.service.startAnalysis(scope, created.id)
    assert.equal(second.revision, first.revision + 1)
    // The abandoned call can no longer save or fail the case.
    await assert.rejects(f.service.saveSuggestion(scope, created.id, first.revision, {
      categoryId: 'plumbing', reason: 'late', model: 'test-vision', promptSource: { type: 'default' }
    }), code('conflict'))
    assert.equal(await f.service.markFailed(scope, created.id, first.revision, 'timeout'), false)
  } finally { await f.db.destroy() }
})

test('a case without a photo cannot be recognised, and rows in an older format read as having no suggestion', async () => {
  const f = await createService()
  try {
    const now = new Date().toISOString()
    const legacyId = randomUUID()
    await f.cases.insert({
      ...scope, id: legacyId, requestKey: randomUUID(), title: 'Saved by an earlier version', status: 'failed', revision: 3,
      suggestionsJson: JSON.stringify([{ categoryId: 'plumbing', confidence: 0.7, reason: 'Old format' }]),
      confirmedCategoryId: null, failureCode: 'model_failed' as never, createdAt: now, updatedAt: now
    })
    const detail = await f.service.getCaseDetail(scope, legacyId)
    assert.deepEqual([detail.photoDataUrl, detail.suggestion, detail.failureCode], [null, null, null])
    let calls = 0
    await assert.rejects(f.analyzer.analyze(scope, legacyId, runtimeFor(async () => { calls++; return answer() })), code('photo_missing'))
    assert.equal(calls, 0)
    // Without a photo there is nothing to recognise, but the person can still record the category.
    const confirmed = await f.service.confirmCase(scope, { caseId: legacyId, revision: 3, categoryId: 'unclear' })
    assert.equal(confirmed.status, 'confirmed')
  } finally { await f.db.destroy() }
})
