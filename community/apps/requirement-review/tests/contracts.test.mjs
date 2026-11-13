import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readSchema, failureSchema, submitSchema } from '../dist/middleware.js'
import { publicDetail, actionSchemas } from '../dist/view.provider.js'
import {
  checkDraftIdentity,
  confirmationProblems,
  makeEditable
} from '../dist/domain/policy.js'
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
  const twoItems = makeEditable({
    summary: '',
    requirements: [
      {
        title: 'a',
        description: 'a',
        evidence: [{ segmentId: 'S01', quote: 'a' }],
        acceptance: [],
        openQuestions: []
      },
      {
        title: 'b',
        description: 'b',
        evidence: [{ segmentId: 'S02', quote: 'b' }],
        acceptance: [],
        openQuestions: []
      }
    ]
  })
  assert.throws(
    () =>
      checkDraftIdentity(twoItems, {
        requirements: [...twoItems.requirements].reverse()
      }),
    { code: 'draft_ids_changed' }
  )
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
    attempt: null,
    attempts: []
  })
  assert.equal(JSON.stringify(dto).includes('secret-'), false)
})
test('view DTO exposes bounded attempt facts without scope or request keys', () => {
  const attempt = {
    id: 'attempt-1',
    tenantId: 'secret-tenant',
    organizationId: 'secret-org',
    ownerId: 'secret-owner',
    reviewId: 'review-1',
    requestKey: 'secret-request-key',
    inputVersion: 2,
    status: 'SUCCEEDED',
    startedAt: '2026-09-16T12:00:00.000Z',
    deadlineAt: '2026-09-16T12:01:30.000Z',
    completedAt: '2026-09-16T12:00:01.250Z',
    model: '  deepseek\nflash  ',
    promptVersion: 'reqtrace-1',
    errorCode: null,
    usage: { inputTokens: 12.9, outputTokens: 4.2 }
  }
  const dto = publicDetail({
    review: {
      id: 'review-1',
      title: 'x',
      sourceText: 'x',
      sourceSegments: [],
      status: 'REVIEWING',
      version: 3,
      inputVersion: 2,
      aiDraft: null,
      editableDraft: null,
      sourceHash: 'secret-hash',
      confirmedAt: null,
      confirmedSnapshot: null,
      updatedAt: '2026-09-16T12:00:01.250Z'
    },
    attempt,
    attempts: [attempt]
  })
  assert.equal(dto.attempts.length, 1)
  assert.equal(dto.attempts[0].durationMs, 1250)
  assert.equal(dto.attempts[0].model, 'deepseek flash')
  assert.deepEqual(dto.attempts[0].usage, {
    inputTokens: 12,
    outputTokens: 4
  })
  assert.deepEqual(dto.attempt, dto.attempts[0])
  assert.equal(JSON.stringify(dto).includes('secret-'), false)
})
