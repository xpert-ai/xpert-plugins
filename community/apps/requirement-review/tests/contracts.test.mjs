import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSchema, failureSchema, submitSchema } from '../dist/middleware.js'
import { publicDetail, actionSchemas } from '../dist/view.provider.js'
import { confirmationProblems, makeEditable } from '../dist/domain/policy.js'
test('tools reject invalid IDs, extra identity and unbounded data', () => {
  assert.equal(
    readSchema.safeParse({ reviewId: 'x', attemptId: 'x' }).success,
    false
  )
  assert.equal(
    failureSchema.safeParse({
      reviewId: 'x',
      attemptId: 'x',
      code: 'secret_error',
      token: 'no'
    }).success,
    false
  )
  assert.equal(
    actionSchemas.create.safeParse({
      title: 'x',
      sourceText: 'x',
      tenantId: 'untrusted'
    }).success,
    false
  )
  assert.equal(
    submitSchema.shape.draft.safeParse({
      requirements: [],
      summary: '',
      extra: true
    }).success,
    false
  )
})
test('source revision contract requires optimistic version and rejects identity injection', () => {
  const input = {
    reviewId: '27f1e2d0-7399-4f0c-a3bc-2645eb889e56',
    expectedVersion: 3,
    title: '修订标题',
    sourceText: '修订后的访谈原文'
  }
  assert.equal(actionSchemas.revise.safeParse(input).success, true)
  assert.equal(
    actionSchemas.revise.safeParse({ ...input, expectedVersion: undefined })
      .success,
    false
  )
  assert.equal(
    actionSchemas.revise.safeParse({ ...input, ownerId: 'untrusted' }).success,
    false
  )
})
test('confirmation is blocked for empty selection, questions and missing acceptance', () => {
  const draft = makeEditable({
    summary: '',
    requirements: [
      {
        title: 'x',
        description: 'x',
        evidence: [{ segmentId: 'S01', quote: 'x' }],
        acceptance: [],
        openQuestions: ['x']
      }
    ]
  })
  assert.equal(confirmationProblems(draft).length, 2)
  draft.requirements[0].included = false
  assert.equal(confirmationProblems(draft)[0].reason, 'empty')
})
test('view DTO allowlists business data and hides scope and confirmer identity', () => {
  const dto = publicDetail({
    review: {
      id: 'r',
      title: 'x',
      sourceText: 'x',
      sourceSegments: [],
      status: 'CONFIRMED',
      version: 1,
      inputVersion: 1,
      aiDraft: null,
      editableDraft: null,
      tenantId: 'secret-tenant',
      organizationId: 'secret-org',
      ownerId: 'secret-owner',
      sourceHash: 'secret-hash',
      confirmedAt: 'now',
      updatedAt: 'now',
      confirmedSnapshot: {
        draft: { requirements: [] },
        confirmedAt: 'now',
        sourceVersion: 1,
        confirmedBy: 'secret-owner'
      }
    },
    attempt: null
  })
  assert.equal(JSON.stringify(dto).includes('secret-'), false)
})
