import assert from 'node:assert/strict'
import test from 'node:test'
import type { StructuredToolInterface } from '@langchain/core/tools'
import type { IAgentMiddlewareContext } from '@xpert-ai/plugin-sdk'
import { TOOL_GET_TICKET, TOOL_NAMES, TOOL_SAVE_ANALYSIS } from '../src/lib/constants.js'
import { saveAnalysisSchema } from '../src/lib/domain/contracts.js'
import { splitSentences } from '../src/lib/domain/sentences.js'
import { ComplaintTriageMiddleware } from '../src/lib/triage.middleware.js'
import { COMPLAINT, analysisInput, harness, scope, ticketInput } from './fixtures.js'

test('sentence ids are deterministic, bounded and cover the whole complaint', () => {
  const sentences = splitSentences(COMPLAINT)
  assert.deepEqual(sentences, splitSentences(COMPLAINT), 'same text, same ids: evidence ids stay valid across reads')
  assert.equal(sentences.map((sentence) => sentence.text).join(''), COMPLAINT)
  assert.deepEqual(
    splitSentences('First line. Second one!\n\n第三句；第四句').map((sentence) => sentence.text),
    ['First line.', 'Second one!', '第三句；', '第四句']
  )
  assert.equal(splitSentences('价格是 3.5 元。').length, 1, 'a decimal point is not a sentence end')

  const long = splitSentences(Array.from({ length: 200 }, (_, index) => `第${index}句。`).join(''))
  assert.equal(long.length, 60)
  assert.ok(long[59].text.endsWith('第199句。'), 'the tail is merged, not dropped')
})

test('tool schema: the natural model payload parses; quotes, ids of the runtime and empty results do not', () => {
  assert.equal(saveAnalysisSchema.safeParse(analysisInput('TCK-20260917-AB12')).success, true)

  const withContext = { ...analysisInput('TCK-20260917-AB12'), tenantId: 'tenant-b', attemptNo: 9 }
  const parsed = saveAnalysisSchema.parse(withContext)
  assert.equal('tenantId' in parsed || 'attemptNo' in parsed, false, 'scope and attempt never come from the model')

  const noFacts = { ...analysisInput('TCK-20260917-AB12'), keyFacts: [] }
  assert.equal(saveAnalysisSchema.safeParse(noFacts).success, false)
  const badGrade = { ...analysisInput('TCK-20260917-AB12'), severity: 'critical' }
  assert.equal(saveAnalysisSchema.safeParse(badGrade).success, false)
})

test('middleware tools run against the runtime scope and return compact JSON the model can act on', async () => {
  const { db, service } = await harness()
  try {
    const middleware = new ComplaintTriageMiddleware(service)
    assert.deepEqual(middleware.getToolNames(), [...TOOL_NAMES])

    // Only the fields the middleware reads; the platform supplies the full context at runtime.
    const context = { tenantId: scope.tenantId, organizationId: scope.organizationId, userId: scope.userId } as IAgentMiddlewareContext
    const tools = (await middleware.createMiddleware({}, context)).tools as StructuredToolInterface[]
    assert.deepEqual(tools.map((tool) => tool.name), [...TOOL_NAMES])
    const byName = (name: string) => tools.find((tool) => tool.name === name)!

    const ticket = await service.createTicket(scope, ticketInput)
    const opened = JSON.parse(await byName(TOOL_GET_TICKET).invoke({ ticketNo: ticket.ticketNo }))
    assert.deepEqual([opened.success, opened.status, opened.sentences.length], [true, 'analyzing', 5])
    assert.equal('content' in opened || 'tenantId' in opened, false, 'no raw record and no scope ids in tool output')

    const saved = JSON.parse(await byName(TOOL_SAVE_ANALYSIS).invoke(analysisInput(ticket.ticketNo)))
    assert.deepEqual([saved.success, saved.status, Object.keys(saved).includes('analysis')], [true, 'pending_review', false])

    const strangerTools = (await middleware.createMiddleware({}, { ...context, organizationId: 'org-b' } as IAgentMiddlewareContext)).tools as StructuredToolInterface[]
    const denied = JSON.parse(await strangerTools.find((tool) => tool.name === TOOL_GET_TICKET)!.invoke({ ticketNo: ticket.ticketNo }))
    assert.deepEqual([denied.success, denied.code], [false, 'not_found'])

    await assert.rejects(byName(TOOL_SAVE_ANALYSIS).invoke({ ticketNo: ticket.ticketNo, severity: 'P9' }), /severity|Received tool input/)
  } finally {
    await db.destroy()
  }
})
