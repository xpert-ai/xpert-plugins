import assert from 'node:assert/strict'
import test from 'node:test'
import { randomUUID } from 'node:crypto'
import { BaseChatModel } from '@langchain/core/language_models/chat_models'
import { AIMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { ChatResult } from '@langchain/core/outputs'
import { SqljsDriver } from 'typeorm/driver/sqljs/SqljsDriver.js'
import type { AgentMiddlewareRuntimeApi, IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { PhotoIntakeMiddleware } from '../dist/lib/intake.middleware.js'
import { EVALUATE_NEXT_TOOL } from '../src/lib/constants.js'
import { currentReview, evaluationMetrics, latestAttempt } from '../dist/lib/domain/evaluation.js'
import { createService, newCase, scope } from './fixtures.js'

class MeasuredModel extends BaseChatModel {
  constructor(readonly respond: (messages: BaseMessage[]) => Promise<AIMessage>) { super({}) }
  _llmType() { return 'evaluation-test-double' }
  async _generate(messages: BaseMessage[]): Promise<ChatResult> {
    const message = await this.respond(messages)
    return { generations: [{ text: String(message.content), message }] }
  }
}

function runtimeFor(respond: (messages: BaseMessage[]) => Promise<AIMessage>): AgentMiddlewareRuntimeApi {
  const model = new MeasuredModel(respond)
  return {
    getDefaultChatModel: async () => ({ model: 'test-vision', copilotId: 'connection-1' }),
    // The SDK exposes a caller-selected generic. This fixture provides exactly BaseChatModel.
    createModelClient: async <T>() => model as T,
    wrapWorkflowNodeExecution: async () => { throw new Error('unused fixture capability') }
  }
}
const answer = (id = 'plumbing') => new AIMessage({
  content: JSON.stringify({ categoryId: id, reason: 'A pipe is visibly leaking.' }),
  usage_metadata: { input_tokens: 20, output_tokens: 10, total_tokens: 30 }
})
async function newRun(fixture: Awaited<ReturnType<typeof createService>>) {
  const sample = await fixture.service.createCase(scope, { ...newCase('PRIVATE_REFERENCE_TITLE'), referenceCategoryId: 'plumbing' })
  const input = { requestKey: randomUUID(), title: 'Prompt regression', sampleIds: [sample.id], promptA: 'BASELINE_PROMPT', promptB: 'CANDIDATE_PROMPT' }
  const run = await fixture.evaluations.create(scope, input)
  return { run, sample, input }
}

test('real runner boundary makes independent A/B calls, stores outputs and scores exact references', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    const seen: BaseMessage[][] = []
    const runtime = runtimeFor(async messages => { seen.push(messages); return answer(seen.length === 1 ? 'plumbing' : 'surfaces') })
    await f.runner.next(scope, run.id, runtime)
    const result = await f.runner.next(scope, run.id, runtime)
    assert.equal(result.status, 'completed')
    assert.equal(seen.length, 2)
    for (const messages of seen) {
      assert.equal(messages.length, 2)
      assert.equal(messages[1].getType(), 'human')
      assert.ok(JSON.stringify(messages[1].content).includes('image_url'))
      assert.ok(!JSON.stringify(messages).includes('PRIVATE_REFERENCE_TITLE'))
      assert.ok(!JSON.stringify(messages).includes('referenceCategoryId'))
    }
    assert.ok(String(seen[0][0].content).includes('BASELINE_PROMPT'))
    assert.ok(!String(seen[0][0].content).includes('CANDIDATE_PROMPT'))
    assert.ok(!String(seen[1][0].content).includes('BASELINE_PROMPT'))
    assert.equal(evaluationMetrics(result, 'a').correct, 1)
    assert.equal(evaluationMetrics(result, 'b').correct, 0)
    assert.equal(latestAttempt(result.cells[0]).rawOutput, answer().content)
    assert.equal(latestAttempt(result.cells[0]).usage?.totalTokens, 30)
    assert.ok(latestAttempt(result.cells[0]).latencyMs! >= 0)
  } finally { await f.db.destroy() }
})

test('creation is idempotent, snapshots labels, rejects duplicate images and enforces ownership', async () => {
  const f = await createService()
  try {
    const { run, sample, input } = await newRun(f)
    assert.equal((await f.evaluations.create(scope, input)).id, run.id)
    await f.service.setReference(scope, { caseId: sample.id, revision: sample.revision, categoryId: 'surfaces' })
    assert.equal((await f.evaluations.get(scope, run.id)).snapshot.samples[0].referenceCategoryId, 'plumbing')
    const duplicate = await f.service.createCase(scope, { ...newCase(), referenceCategoryId: 'plumbing' })
    await assert.rejects(f.evaluations.create(scope, { ...input, requestKey: randomUUID(), sampleIds: [sample.id, duplicate.id] }), /Duplicate image/)
    for (const key of ['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'] as const) {
      const other = { ...scope, [key]: 'other' }
      await assert.rejects(f.evaluations.get(other, run.id), /not_found/)
      assert.equal((await f.evaluations.list(other)).total, 0)
      await assert.rejects(f.evaluations.create(other, { ...input, requestKey: randomUUID() }), /not_found/)
    }
  } finally { await f.db.destroy() }
})

test('concurrent execution makes only one paid invocation, with persisted atomic claim', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    let release!: () => void
    let entered!: () => void
    const gate = new Promise<void>(resolve => { release = resolve })
    const start = new Promise<void>(resolve => { entered = resolve })
    let calls = 0
    const runtime = runtimeFor(async () => { calls++; entered(); await gate; return answer() })
    const first = f.runner.next(scope, run.id, runtime)
    await start
    const second = await f.runner.next(scope, run.id, runtime)
    assert.equal(second.status, 'running')
    assert.equal(calls, 1)
    release(); await first
  } finally { await f.db.destroy() }
})

test('malformed output stays failed; manual retry retains history, invalidates old reviews and keeps model frozen', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    let count = 0
    const runtime = runtimeFor(async () => ++count === 1 ? new AIMessage('not valid JSON') : answer())
    await f.runner.next(scope, run.id, runtime)
    let done = await f.runner.next(scope, run.id, runtime)
    assert.equal(evaluationMetrics(done, 'a').failed, 1)
    assert.equal(evaluationMetrics(done, 'a').total, 1)
    assert.equal(latestAttempt(done.cells[0]).rawOutput, 'not valid JSON')
    await assert.rejects(f.evaluations.decide(scope, { runId: run.id, revision: done.revision, verdict: 'a', note: 'adopt' }), /invalid_state|failed items/)
    done = await f.evaluations.review(scope, { runId: run.id, revision: done.revision, sampleId: done.snapshot.samples[0].id, verdict: 'b', note: 'A malformed' })
    const ready = await f.evaluations.retryFailures(scope, { runId: run.id, revision: done.revision })
    assert.equal(ready.reviews.length, 1, 'old human notes are retained with their attempt identities')
    assert.equal(currentReview(ready, ready.snapshot.samples[0].id), undefined)
    assert.equal(ready.cells[0].attempts.length, 2)
    assert.equal(ready.cells[1].attempts.length, 1)
    runtime.getDefaultChatModel = async () => { throw new Error('must not re-resolve frozen model') }
    done = await f.runner.next(scope, run.id, runtime)
    assert.equal(count, 3)
    assert.equal(done.status, 'completed')
    assert.equal(done.cells[0].attempts[0].rawOutput, 'not valid JSON')
    assert.equal(done.snapshot.model?.model, 'test-vision')
    const decided = await f.evaluations.decide(scope, { runId: run.id, revision: done.revision, verdict: 'a', note: 'All samples passed after explicit retry.' })
    assert.equal(decided.status, 'reviewed')
    assert.equal((await f.evaluations.get(scope, run.id)).decision?.note, decided.decision?.note)
    await assert.rejects(f.evaluations.retryFailures(scope, { runId: run.id, revision: decided.revision }), /invalid_state/)
    await f.runner.next(scope, run.id, runtime)
    assert.equal(count, 3, 'reviewed run cannot trigger new calls')
  } finally { await f.db.destroy() }
})

test('timeouts retain failure without secrets and late provider replies cannot replace it', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    f.runner.timeoutMs = 10
    let resolve!: (value: AIMessage) => void
    const runtime = runtimeFor(() => new Promise<AIMessage>(done => { resolve = done }))
    const result = await f.runner.next(scope, run.id, runtime)
    assert.equal(latestAttempt(result.cells[0]).failureCode, 'timeout')
    resolve(answer())
    await new Promise(done => setImmediate(done))
    assert.equal(latestAttempt((await f.evaluations.get(scope, run.id)).cells[0]).failureCode, 'timeout')
    const failed = await f.runner.next(scope, run.id, runtimeFor(async () => { throw new Error('Bearer SECRET_URL_CREDENTIAL') }))
    assert.equal(latestAttempt(failed.cells[1]).failureCode, 'model_call_failed')
    assert.ok(!JSON.stringify(failed).includes('SECRET'))
  } finally { await f.db.destroy() }
})

test('expired running claims are recovered explicitly and reject stale results and revisions', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    const claim = await f.evaluations.claim(scope, run.id, { model: 'vision', copilotId: 'c', options: { temperature: 0, max_tokens: 512, maxRetries: 0 } })
    assert.ok(claim)
    await assert.rejects(f.evaluations.recover(scope, { runId: run.id, revision: claim.run.revision }), /invalid_state/)
    f.evaluations.now = () => new Date(Date.now() + 120_000)
    assert.equal((await f.evaluations.get(scope, run.id)).canRecover, true)
    const recovered = await f.evaluations.recover(scope, { runId: run.id, revision: claim.run.revision })
    assert.equal(latestAttempt(recovered.cells[0]).failureCode, 'interrupted')
    await assert.rejects(f.evaluations.finish(scope, run.id, claim.attempt.id, { ...claim.attempt, status: 'succeeded' }), /superseded/)
    await assert.rejects(f.evaluations.recover(scope, { runId: run.id, revision: claim.run.revision }), /conflict/)
  } finally { await f.db.destroy() }
})

test('strict output validation rejects extra fields, unknown categories and markdown wrappers', async () => {
  const f = await createService()
  try {
    for (const raw of ['{"categoryId":"invented","reason":"x"}', '{"categoryId":"plumbing","reason":"x","score":1}', '```json\n{"categoryId":"plumbing","reason":"x"}\n```']) {
      const { run } = await newRun(f)
      const result = await f.runner.next(scope, run.id, runtimeFor(async () => new AIMessage(raw)))
      assert.equal(latestAttempt(result.cells[0]).failureCode, 'invalid_output')
      assert.equal(latestAttempt(result.cells[0]).rawOutput, raw)
    }
  } finally { await f.db.destroy() }
})

test('middleware runs real server boundary and cannot accept model-authored scores or human decisions', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    const runtime = runtimeFor(async () => answer())
    // Only required context fields used by this middleware; no host internals are mocked.
    const context = { ...scope, runtime, tools: new Map(), node: {} } as IAgentMiddlewareContext
    const middleware = new PhotoIntakeMiddleware(f.evaluations, f.runner).createMiddleware({}, context)
    const tool = middleware.tools!.find(item => item.name === EVALUATE_NEXT_TOOL)!
    await assert.rejects(tool.invoke({ runId: run.id, score: 1 }), /match expected schema/)
    const receipt = JSON.parse(String(await tool.invoke({ runId: run.id })))
    assert.equal(receipt.pending, 1)
    assert.equal(receipt.metrics.a.correct, 1)
    assert.ok(!('snapshot' in receipt))
    assert.equal(middleware.tools!.some(item => item.name.includes('decide')), false)
  } finally { await f.db.destroy() }
})

test('database reopen restores decisions, output history and sample photos without process memory', async () => {
  const f = await createService()
  let restored: Awaited<ReturnType<typeof createService>> | undefined
  try {
    const { run, sample } = await newRun(f)
    const runtime = runtimeFor(async () => answer())
    await f.runner.next(scope, run.id, runtime)
    const done = await f.runner.next(scope, run.id, runtime)
    await f.evaluations.decide(scope, { runId: run.id, revision: done.revision, verdict: 'tie', note: 'Both versions passed this small set.' })
    assert.ok(f.db.driver instanceof SqljsDriver)
    restored = await createService(f.db.driver.export())
    const stored = await restored.evaluations.get(scope, run.id)
    assert.equal(stored.decision?.verdict, 'tie')
    assert.equal(latestAttempt(stored.cells[0]).rawOutput, answer().content)
    assert.ok((await restored.service.getCaseDetail(scope, sample.id)).photoDataUrl)
  } finally { await restored?.db.destroy(); await f.db.destroy() }
})

test('review and decision mutations enforce ownership/revision; retries have a bounded history', async () => {
  const f = await createService()
  try {
    const { run, sample } = await newRun(f)
    const runtime = runtimeFor(async () => new AIMessage('malformed'))
    let done = await f.evaluations.get(scope, run.id)
    for (let attempt = 1; attempt <= 3; attempt++) {
      await f.runner.next(scope, run.id, runtime)
      done = await f.runner.next(scope, run.id, runtime)
      if (attempt < 3) await f.evaluations.retryFailures(scope, { runId: run.id, revision: done.revision })
    }
    assert.equal(done.cells[0].attempts.length, 3)
    await assert.rejects(f.evaluations.retryFailures(scope, { runId: run.id, revision: done.revision }), /invalid_state/)
    await assert.rejects(f.evaluations.decide(scope, { runId: run.id, revision: done.revision - 1, verdict: 'neither', note: 'Reject' }), /conflict/)
    for (const key of ['tenantId', 'organizationId', 'workspaceId', 'userId', 'xpertId'] as const) {
      const other = { ...scope, [key]: 'other' }
      await assert.rejects(f.evaluations.decide(other, { runId: run.id, revision: done.revision, verdict: 'neither', note: 'Reject' }), /not_found/)
      await assert.rejects(f.evaluations.review(other, { runId: run.id, revision: done.revision, sampleId: sample.id, verdict: 'neither', note: '' }), /not_found/)
      await assert.rejects(f.service.setReference(other, { caseId: sample.id, revision: sample.revision, categoryId: 'unclear' }), /not_found/)
    }
    const rejected = await f.evaluations.decide(scope, { runId: run.id, revision: done.revision, verdict: 'neither', note: 'Neither produces valid JSON.' })
    assert.equal(rejected.status, 'reviewed')
  } finally { await f.db.destroy() }
})

test('typed text content blocks are parsed while their complete original structure is saved', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    const blocks = [{ type: 'text', text: String(answer().content) }]
    const done = await f.runner.next(scope, run.id, runtimeFor(async () => new AIMessage({ content: blocks })))
    assert.equal(latestAttempt(done.cells[0]).output?.categoryId, 'plumbing')
    assert.equal(latestAttempt(done.cells[0]).rawOutput, JSON.stringify(blocks))
  } finally { await f.db.destroy() }
})

test('oversized output is visibly truncated and cannot count as a valid classification', async () => {
  const f = await createService()
  try {
    const { run } = await newRun(f)
    const done = await f.runner.next(scope, run.id, runtimeFor(async () => new AIMessage('x'.repeat(70000))))
    const attempt = latestAttempt(done.cells[0])
    assert.equal(attempt.rawOutput?.length, 65536)
    assert.equal(attempt.rawOutputTruncated, true)
    assert.equal(attempt.failureCode, 'invalid_output')
  } finally { await f.db.destroy() }
})
