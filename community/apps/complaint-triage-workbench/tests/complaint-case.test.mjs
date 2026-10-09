import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { ComplaintCaseService } from '../dist/index.js'

const scope = {
  tenantId: 'tenant-a',
  organizationId: 'organization-a',
  userId: 'user-a'
}

const triageResult = {
  summary: 'Customer received a damaged product and requests replacement.',
  category: 'product_damage',
  urgency: 'high',
  customerIntent: 'Receive a replacement and delivery update.',
  riskFlags: ['repeat_contact'],
  suggestedAction: 'Verify the order and arrange priority replacement.',
  replyDraft: 'We are sorry the product arrived damaged. We will arrange a replacement.'
}

test('creates, scopes, and reloads a persisted complaint case', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)

  await assert.rejects(
    service.createCase(scope, { customerName: '', complaintContent: '' }),
    /String must contain at least 1 character/
  )
  assert.equal(repository.rows.length, 0)

  const created = await service.createCase(scope, {
    customerName: 'Alice',
    customerReference: 'ORDER-1001',
    complaintContent: 'The product arrived damaged.'
  })

  assert.equal(created.status, 'DRAFT')
  assert.equal((await service.getCase(scope, created.id)).id, created.id)
  assert.equal((await service.listCases(scope)).total, 1)
  await assert.rejects(
    service.getCase({ ...scope, organizationId: 'organization-b' }, created.id),
    /not found/i
  )
})

test('preserves the AI original while a human edits and confirms the result', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  const created = await createComplaint(service)
  const processing = await service.beginAnalysis(scope, created.id)

  assert.equal(processing.status, 'PROCESSING')
  await assert.rejects(service.beginAnalysis(scope, created.id), /draft complaint/i)

  const pending = await service.completeAnalysis(
    scope,
    created.id,
    processing.attemptId,
    triageResult
  )
  assert.equal(pending.status, 'PENDING_REVIEW')

  const editedResult = {
    ...triageResult,
    suggestedAction: 'Escalate to a supervisor and arrange priority replacement.'
  }
  const reviewed = await service.saveReview(scope, created.id, editedResult)
  assert.equal(reviewed.aiOriginalResult.suggestedAction, triageResult.suggestedAction)
  assert.equal(reviewed.humanDraftResult.suggestedAction, editedResult.suggestedAction)

  const confirmed = await service.confirmCase(scope, created.id, editedResult)
  assert.equal(confirmed.status, 'CONFIRMED')
  assert.deepEqual(confirmed.aiOriginalResult, triageResult)
  assert.deepEqual(confirmed.humanConfirmedResult, editedResult)
  assert.ok(confirmed.confirmedAt instanceof Date)
})

test('records task metadata after a fast tool finalizer completes the same attempt', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  const created = await createComplaint(service)
  const processing = await service.beginAnalysis(scope, created.id)

  await service.completeAnalysis(scope, created.id, processing.attemptId, triageResult)
  const updated = await service.recordTaskReference(scope, created.id, processing.attemptId, {
    taskId: 'task-fast',
    executionId: 'execution-fast'
  })

  assert.equal(updated.status, 'PENDING_REVIEW')
  assert.equal(updated.taskId, undefined)
  assert.equal(updated.assistantTaskId, 'task-fast')
  assert.equal(updated.executionId, 'execution-fast')
})

test('retries the same case and rejects a stale attempt result', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  const created = await createComplaint(service)
  const firstAttempt = await service.beginAnalysis(scope, created.id)
  const failed = await service.failAnalysis(
    scope,
    created.id,
    firstAttempt.attemptId,
    'model_unavailable',
    'The model is temporarily unavailable. token=secret-value Bearer secret-jwt'
  )
  assert.equal(failed.status, 'FAILED')
  assert.doesNotMatch(failed.errorMessage, /secret-value|secret-jwt/)

  const retry = await service.retryAnalysis(scope, created.id)
  assert.equal(retry.id, created.id)
  assert.equal(retry.status, 'PROCESSING')
  assert.equal(retry.attemptCount, 2)
  assert.notEqual(retry.attemptId, firstAttempt.attemptId)
  assert.equal(repository.rows.length, 1)

  await assert.rejects(
    service.completeAnalysis(scope, created.id, firstAttempt.attemptId, triageResult),
    /stale or inactive attempt/i
  )
  const completed = await service.completeAnalysis(
    scope,
    created.id,
    retry.attemptId,
    triageResult
  )
  assert.equal(completed.status, 'PENDING_REVIEW')
  assert.equal(repository.rows.length, 1)
})

async function createComplaint(service) {
  return service.createCase(scope, {
    customerName: 'Alice',
    complaintContent: 'The product arrived damaged and support has not resolved the issue.'
  })
}

test('rejects missing identity and blocks cross-tenant reads and writes', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  await assert.rejects(service.createCase({ ...scope, tenantId: '' }, {
    customerName: 'Alice', complaintContent: 'Damaged product.'
  }), /tenant scope/i)
  await assert.rejects(service.createCase({ ...scope, userId: null }, {
    customerName: 'Alice', complaintContent: 'Damaged product.'
  }), /authenticated user/i)
  const created = await createComplaint(service)
  const otherScope = { ...scope, tenantId: 'tenant-b' }
  assert.equal((await service.listCases(otherScope)).total, 0)
  await assert.rejects(service.getCase(otherScope, created.id), /not found/i)
  await assert.rejects(service.beginAnalysis(otherScope, created.id), /not found/i)
  const processing = await service.beginAnalysis(scope, created.id)
  await assert.rejects(
    service.completeAnalysis(otherScope, created.id, processing.attemptId, triageResult),
    /stale or inactive/i
  )
  assert.equal((await service.getCase(scope, created.id)).status, 'PROCESSING')
})

test('allows only one concurrent analysis and one concurrent retry on the existing case', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  const created = await createComplaint(service)
  const starts = await Promise.allSettled([
    service.beginAnalysis(scope, created.id), service.beginAnalysis(scope, created.id)
  ])
  assert.equal(starts.filter((result) => result.status === 'fulfilled').length, 1)
  let current = await service.getCase(scope, created.id)
  assert.equal(current.attemptCount, 1)
  await service.failAnalysis(scope, created.id, current.attemptId, 'model_failed', 'Model unavailable.')
  const retries = await Promise.allSettled([
    service.retryAnalysis(scope, created.id), service.retryAnalysis(scope, created.id)
  ])
  assert.equal(retries.filter((result) => result.status === 'fulfilled').length, 1)
  current = await service.getCase(scope, created.id)
  assert.equal(current.attemptCount, 2)
  assert.equal(current.status, 'PROCESSING')
  assert.equal(repository.rows.length, 1)
})

test('rejects whitespace-only required fields without creating a case', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  for (const input of [
    { customerName: '   ', complaintContent: 'Damaged product.' },
    { customerName: 'Alice', complaintContent: ' \n\t ' }
  ]) {
    await assert.rejects(service.createCase(scope, input), /at least 1 character/i)
  }
  assert.equal(repository.rows.length, 0)
})

test('blocks cross-organization result, failure, review, and confirmation writes', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  const created = await createComplaint(service)
  const processing = await service.beginAnalysis(scope, created.id)
  const otherScope = { ...scope, organizationId: 'organization-b' }
  await assert.rejects(
    service.completeAnalysis(otherScope, created.id, processing.attemptId, triageResult),
    /stale or inactive/i
  )
  await assert.rejects(
    service.failAnalysis(otherScope, created.id, processing.attemptId, 'failed', 'Unavailable.'),
    /no longer current/i
  )
  assert.equal((await service.getCase(scope, created.id)).status, 'PROCESSING')
  await service.completeAnalysis(scope, created.id, processing.attemptId, triageResult)
  await assert.rejects(service.saveReview(otherScope, created.id, triageResult), /pending review/i)
  await assert.rejects(service.confirmCase(otherScope, created.id, triageResult), /pending review/i)
  assert.equal((await service.getCase(scope, created.id)).status, 'PENDING_REVIEW')
  assert.equal(repository.rows.length, 1)
})

test('rejects invalid results, repeated tool writes, and confirmation after confirmation', async () => {
  const repository = new InMemoryComplaintRepository()
  const service = new ComplaintCaseService(repository)
  const created = await createComplaint(service)
  const processing = await service.beginAnalysis(scope, created.id)
  await assert.rejects(service.completeAnalysis(scope, created.id, processing.attemptId, {
    ...triageResult, urgency: 'unknown'
  }))
  assert.equal((await service.getCase(scope, created.id)).status, 'PROCESSING')
  await service.completeAnalysis(scope, created.id, processing.attemptId, triageResult)
  await assert.rejects(
    service.completeAnalysis(scope, created.id, processing.attemptId, triageResult),
    /stale or inactive/i
  )
  await assert.rejects(service.saveReview(scope, created.id, { ...triageResult, summary: '' }))
  await service.confirmCase(scope, created.id, triageResult)
  const confirmed = await service.getCase(scope, created.id)
  await assert.rejects(service.confirmCase(scope, created.id, triageResult), /pending review/i)
  await assert.rejects(service.saveReview(scope, created.id, triageResult), /pending review/i)
  assert.deepEqual((await service.getCase(scope, created.id)).humanConfirmedResult, confirmed.humanConfirmedResult)
  assert.equal(repository.rows.length, 1)
})

class InMemoryComplaintRepository {
  rows = []

  create(value) {
    return { ...value }
  }

  async save(value) {
    const now = new Date()
    const entity = { ...value, createdAt: value.createdAt ?? now, updatedAt: now }
    const index = this.rows.findIndex((row) => row.id === entity.id)
    if (index >= 0) this.rows[index] = entity
    else this.rows.push(entity)
    return entity
  }

  async findOne({ where }) {
    return this.rows.find((row) => matches(row, where)) ?? null
  }

  async findAndCount({ where, skip = 0, take = 20 }) {
    const clauses = Array.isArray(where) ? where : [where]
    const matching = this.rows.filter((row) => clauses.some((clause) => matches(row, clause)))
    return [matching.slice(skip, skip + take), matching.length]
  }

  async update(where, patch) {
    const index = this.rows.findIndex((row) => matches(row, where))
    if (index < 0) return { affected: 0 }
    this.rows[index] = { ...this.rows[index], ...patch, updatedAt: new Date() }
    return { affected: 1 }
  }
}

function matches(row, where) {
  return Object.entries(where).every(([key, value]) => row[key] === value)
}
