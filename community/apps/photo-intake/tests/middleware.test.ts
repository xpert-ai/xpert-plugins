import assert from 'node:assert/strict'
import test from 'node:test'
import { AIMessage, HumanMessage, ToolMessage } from '@langchain/core/messages'
import type { BaseMessage } from '@langchain/core/messages'
import type { AgentMiddleware, IAgentMiddlewareContext, ModelRequest, ToolImagesApi } from '@xpert-ai/plugin-sdk'
import { findOpenAnalyses, PhotoIntakeMiddleware } from '../dist/lib/intake.middleware.js'
import { ANALYZE_CASE_TOOL, SUBMIT_SUGGESTIONS_TOOL } from '../src/lib/constants.js'
import { createService, JPEG_BYTES, newCase, scope } from './fixtures.js'

const toolMessage = (name: string, content: object, status: 'success' | 'error' = 'success') =>
  new ToolMessage({ name, content: JSON.stringify(content), tool_call_id: `call-${name}`, status })

function fakeImages() {
  const saved: Array<{ buffer: Buffer; mimeType: string; title: string }> = []
  const presentation = { type: 'image', reference: 'artifact-1' }
  const api = {
    save: async (input: { buffer: Buffer; mimeType: string; title: string }) => {
      saved.push(input)
      return presentation
    },
    prepareModelInput: async (messages: BaseMessage[]) => ({
      messages: [...messages, new HumanMessage('[image projected by host]')],
      requirements: { features: ['vision'] }
    })
  }
  return { api: api as unknown as ToolImagesApi, saved, presentation }
}

function contextWith(images?: ToolImagesApi) {
  const capabilities = { get: () => images }
  // Only the fields this middleware reads; the host supplies the rest.
  return {
    tenantId: scope.tenantId,
    organizationId: scope.organizationId,
    workspaceId: scope.workspaceId,
    userId: scope.userId,
    xpertId: scope.xpertId,
    runtime: { capabilities }
  } as unknown as IAgentMiddlewareContext
}

function toolNamed(middleware: AgentMiddleware, name: string) {
  const found = middleware.tools?.find(item => item.name === name)
  assert.ok(found, `tool ${name} exists`)
  return found
}

test('only analyses opened in the current turn and not yet answered count as open', () => {
  const oldTurn = [new HumanMessage('earlier'), toolMessage(ANALYZE_CASE_TOOL, { caseId: 'a', revision: 2 })]
  const current = [
    new HumanMessage('analyse b and c'),
    new AIMessage('...'),
    toolMessage(ANALYZE_CASE_TOOL, { caseId: 'b', revision: 4 }),
    toolMessage(ANALYZE_CASE_TOOL, { caseId: 'c', revision: 7 }),
    toolMessage(ANALYZE_CASE_TOOL, { caseId: 'd', revision: 1 }, 'error'),
    toolMessage(SUBMIT_SUGGESTIONS_TOOL, { success: true, caseId: 'c' })
  ]
  assert.deepEqual(findOpenAnalyses([...oldTurn, ...current]), [{ caseId: 'b', revision: 4 }])
})

test('the analyse tool opens the case and hands the stored photo to the host image capability', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase('Leak under sink'))
    const images = fakeImages()
    const middleware = new PhotoIntakeMiddleware(service).createMiddleware({}, contextWith(images.api))
    const result = await toolNamed(middleware, ANALYZE_CASE_TOOL).invoke({
      id: 'call-1', name: ANALYZE_CASE_TOOL, args: { caseId: created.id }, type: 'tool_call'
    })
    assert.ok(result instanceof ToolMessage)
    const summary = JSON.parse(String(result.content))
    assert.equal(summary.caseId, created.id)
    assert.equal(summary.revision, 2)
    assert.deepEqual(result.artifact, images.presentation)
    assert.deepEqual(images.saved[0].buffer, JPEG_BYTES)
    assert.equal(images.saved[0].mimeType, 'image/jpeg')
    assert.equal((await service.getCase(scope, created.id)).status, 'analyzing')
  } finally {
    await db.destroy()
  }
})

test('the model call carries the projected image and a vision requirement', async () => {
  const { db, service } = await createService()
  try {
    const images = fakeImages()
    const middleware = new PhotoIntakeMiddleware(service).createMiddleware({}, contextWith(images.api))
    let seen: ModelRequest | undefined
    const request = { messages: [new HumanMessage('hi')], tools: [], requirements: undefined } as unknown as ModelRequest
    await middleware.wrapModelCall!(request, async forwarded => {
      seen = forwarded
      return new AIMessage('ok')
    })
    assert.equal(seen?.messages.length, 2)
    assert.deepEqual(seen?.requirements, { features: ['vision'] })
  } finally {
    await db.destroy()
  }
})

test('a failed model call marks the open analysis failed, so the case can be retried', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const { revision } = await service.startAnalysis(scope, created.id)
    const middleware = new PhotoIntakeMiddleware(service).createMiddleware({}, contextWith(fakeImages().api))
    const request = {
      messages: [new HumanMessage('analyse'), toolMessage(ANALYZE_CASE_TOOL, { caseId: created.id, revision })],
      tools: []
    } as unknown as ModelRequest
    await assert.rejects(
      Promise.resolve(middleware.wrapModelCall!(request, async () => { throw new Error('upstream 503') })),
      /upstream 503/
    )
    const failed = await service.getCase(scope, created.id)
    assert.equal(failed.status, 'failed')
    assert.equal(failed.failureCode, 'model_call_failed')
    assert.equal(failed.canAnalyze, true)
  } finally {
    await db.destroy()
  }
})

test('a run that ends without suggestions closes the analysis as no_suggestion', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const { revision } = await service.startAnalysis(scope, created.id)
    const middleware = new PhotoIntakeMiddleware(service).createMiddleware({}, contextWith(fakeImages().api))
    const afterAgent = middleware.afterAgent
    assert.equal(typeof afterAgent, 'function')
    await (afterAgent as (state: { messages: BaseMessage[] }) => Promise<unknown>)({
      messages: [new HumanMessage('analyse'), toolMessage(ANALYZE_CASE_TOOL, { caseId: created.id, revision }), new AIMessage('It looks wet.')]
    })
    assert.equal((await service.getCase(scope, created.id)).failureCode, 'no_suggestion')
  } finally {
    await db.destroy()
  }
})

test('the submit tool reports unknown categories to the model instead of saving them', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const { revision } = await service.startAnalysis(scope, created.id)
    const middleware = new PhotoIntakeMiddleware(service).createMiddleware({}, contextWith(fakeImages().api))
    const output = JSON.parse(String(await toolNamed(middleware, SUBMIT_SUGGESTIONS_TOOL).invoke({
      caseId: created.id, revision, suggestions: [{ categoryId: 'roof', confidence: 0.9, reason: 'Roof tiles visible' }]
    })))
    assert.equal(output.success, false)
    assert.equal(output.code, 'unknown_category')
    assert.equal((await service.getCase(scope, created.id)).status, 'analyzing')
  } finally {
    await db.destroy()
  }
})

test('without the host image capability the analyse tool refuses and model calls pass through', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const middleware = new PhotoIntakeMiddleware(service).createMiddleware({}, contextWith(undefined))
    await assert.rejects(toolNamed(middleware, ANALYZE_CASE_TOOL).invoke({ caseId: created.id }), /IMAGE_CAPABILITY_UNAVAILABLE/)
    assert.equal((await service.getCase(scope, created.id)).status, 'draft', 'nothing started')
    const request = { messages: [new HumanMessage('hi')], tools: [] } as unknown as ModelRequest
    const reply = await middleware.wrapModelCall!(request, async forwarded => {
      assert.equal(forwarded, request)
      return new AIMessage('ok')
    })
    assert.equal(reply.content, 'ok')
  } finally {
    await db.destroy()
  }
})
