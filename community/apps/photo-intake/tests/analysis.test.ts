import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import test from 'node:test'
import { createService, JPEG_BYTES, newCase, scope } from './fixtures.js'

const suggestion = (categoryId: string, confidence: number) => ({ categoryId, confidence, reason: `Visible ${categoryId}` })

test('analysis opens once per run, saves ranked suggestions and moves the case to review', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const started = await service.startAnalysis(scope, created.id)
    assert.equal(started.revision, 2)
    assert.deepEqual(started.photo.buffer, JPEG_BYTES)
    assert.equal(started.photo.mimeType, 'image/jpeg')
    // Calling again inside the same run neither bumps the revision nor resets anything.
    assert.equal((await service.startAnalysis(scope, created.id)).revision, 2)
    assert.equal((await service.getCase(scope, created.id)).canAnalyze, false)

    const saved = await service.submitSuggestions(scope, {
      caseId: created.id,
      revision: 2,
      suggestions: [suggestion('surfaces', 0.2), suggestion('plumbing', 0.7)]
    })
    assert.equal(saved.status, 'suggested')
    assert.equal(saved.revision, 3)
    const detail = await service.getCaseDetail(scope, created.id)
    assert.deepEqual(detail.suggestions.map(item => item.categoryId), ['plumbing', 'surfaces'], 'most likely first')
  } finally {
    await db.destroy()
  }
})

test('unknown or repeated categories are refused and nothing is saved', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const { revision } = await service.startAnalysis(scope, created.id)
    await assert.rejects(
      service.submitSuggestions(scope, { caseId: created.id, revision, suggestions: [suggestion('roof', 0.9)] }),
      (error: Error & { code?: string }) => error.code === 'unknown_category' && /Allowed: .*plumbing/.test(error.message)
    )
    await assert.rejects(
      service.submitSuggestions(scope, { caseId: created.id, revision, suggestions: [suggestion('plumbing', 0.5), suggestion('plumbing', 0.4)] }),
      (error: Error & { code?: string }) => error.code === 'invalid_input'
    )
    const detail = await service.getCaseDetail(scope, created.id)
    assert.equal(detail.status, 'analyzing')
    assert.deepEqual(detail.suggestions, [])
  } finally {
    await db.destroy()
  }
})

test('a failed analysis can be retried, and a late result from the old run cannot overwrite the new one', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const first = await service.startAnalysis(scope, created.id)
    assert.equal(await service.markFailed(scope, created.id, first.revision, 'model_call_failed'), true)
    const failed = await service.getCase(scope, created.id)
    assert.equal(failed.status, 'failed')
    assert.equal(failed.failureCode, 'model_call_failed')
    assert.equal(failed.canAnalyze, true)

    const retry = await service.startAnalysis(scope, created.id)
    assert.ok(retry.revision > first.revision)
    assert.equal((await service.getCase(scope, created.id)).failureCode, null)
    // The first run answers late: refused, with no second set of results.
    await assert.rejects(
      service.submitSuggestions(scope, { caseId: created.id, revision: first.revision, suggestions: [suggestion('electrical', 0.9)] }),
      (error: Error & { code?: string }) => error.code === 'conflict'
    )
    assert.equal(await service.markFailed(scope, created.id, first.revision, 'model_call_failed'), false, 'old run cannot fail the new one')

    await service.submitSuggestions(scope, { caseId: created.id, revision: retry.revision, suggestions: [suggestion('plumbing', 0.8)] })
    const detail = await service.getCaseDetail(scope, created.id)
    assert.deepEqual(detail.suggestions.map(item => item.categoryId), ['plumbing'])
    // A result for a revision that already completed is refused too.
    await assert.rejects(
      service.submitSuggestions(scope, { caseId: created.id, revision: retry.revision, suggestions: [suggestion('safety', 0.9)] }),
      (error: Error & { code?: string }) => error.code === 'conflict'
    )
  } finally {
    await db.destroy()
  }
})

test('an abandoned analysis becomes retryable once it is stale', async () => {
  const { db, service } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    const first = await service.startAnalysis(scope, created.id)
    const later = new Date(Date.now() + 4 * 60 * 1000)
    service.now = () => later
    assert.equal((await service.getCase(scope, created.id)).canAnalyze, true)
    assert.equal((await service.startAnalysis(scope, created.id)).revision, first.revision + 1)
  } finally {
    await db.destroy()
  }
})

test('confirmed cases and cases without a photo cannot be analysed', async () => {
  const { db, service, cases } = await createService()
  try {
    const created = await service.createCase(scope, newCase())
    await cases.update({ id: created.id }, { status: 'confirmed', confirmedCategoryId: 'plumbing' })
    await assert.rejects(service.startAnalysis(scope, created.id), (error: Error & { code?: string }) => error.code === 'invalid_state')

    const now = new Date().toISOString()
    const legacyId = randomUUID()
    await cases.insert({
      ...scope, id: legacyId, requestKey: randomUUID(), title: 'Created before photos', status: 'draft', revision: 1,
      suggestionsJson: null, confirmedCategoryId: null, failureCode: null, createdAt: now, updatedAt: now
    })
    await assert.rejects(service.startAnalysis(scope, legacyId), (error: Error & { code?: string }) => error.code === 'photo_missing')
    assert.equal((await service.getCaseDetail(scope, legacyId)).photoDataUrl, null)
  } finally {
    await db.destroy()
  }
})
