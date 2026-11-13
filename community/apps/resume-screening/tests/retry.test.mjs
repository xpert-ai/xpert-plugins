// Retry without duplication: a failed save retried with the same
// operationId, and a repeated save for the same candidate, must each leave
// exactly one score row. All data is fictional.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from './fake-repo.mjs'

test('same operationId retried returns the stored receipt and creates no second row', async () => {
  const scores = createFakeRepository()
  const service = new ResumeScreeningService(createFakeRepository(), createFakeRepository([], { scores }), scores)
  const screening = await service.createScreening(SCOPE, JD)
  const senior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })

  const first = await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    operationId: 'op-retry-1',
    dimensions: DIMENSIONS
  })
  const second = await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    operationId: 'op-retry-1',
    dimensions: DIMENSIONS
  })
  assert.equal(first.duplicate, false)
  assert.equal(second.duplicate, true)
  assert.equal(second.scoreId, first.scoreId)
  assert.equal(second.totalScore, first.totalScore)
  assert.equal(scores.rows.length, 1)
})

test('same (screeningId, candidateId) saved again updates in place instead of duplicating', async () => {
  const scores = createFakeRepository()
  const service = new ResumeScreeningService(createFakeRepository(), createFakeRepository([], { scores }), scores)
  const screening = await service.createScreening(SCOPE, JD)
  const senior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })

  await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    dimensions: DIMENSIONS
  })
  const updated = await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    dimensions: DIMENSIONS.map((dimension) =>
      dimension.dimension === 'experience' ? { ...dimension, score: 18 } : dimension
    )
  })
  assert.equal(updated.duplicate, true)
  assert.equal(updated.totalScore, 74)
  assert.equal(updated.revision, 2)
  assert.equal(scores.rows.length, 1)
})

test('a save that fails once succeeds on retry with the same operationId and leaves one row', async () => {
  const scores = createFakeRepository()
  const realSave = scores.save.bind(scores)
  let failuresLeft = 1
  scores.save = async (entity) => {
    if (failuresLeft > 0) {
      failuresLeft -= 1
      throw new Error('simulated database failure')
    }
    return realSave(entity)
  }
  const service = new ResumeScreeningService(createFakeRepository(), createFakeRepository([], { scores }), scores)
  const screening = await service.createScreening(SCOPE, JD)
  const senior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })

  await assert.rejects(
    service.saveScore(SCOPE, {
      screeningId: screening.id,
      candidateId: senior.id,
      operationId: 'op-retry-2',
      dimensions: DIMENSIONS
    }),
    /simulated database failure/
  )
  const retried = await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    operationId: 'op-retry-2',
    dimensions: DIMENSIONS
  })
  assert.equal(retried.duplicate, false)
  assert.equal(retried.totalScore, 72)
  assert.equal(scores.rows.length, 1)
})
