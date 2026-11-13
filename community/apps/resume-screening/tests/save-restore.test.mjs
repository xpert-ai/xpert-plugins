// Save / restore: create a screening, add candidates, prescreen, save a
// score, confirm, then read the workbench back and find everything intact.
// All data is fictional.
import test from 'node:test'
import assert from 'node:assert/strict'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from './fake-repo.mjs'

function makeService() {
  const scores = createFakeRepository()
  return new ResumeScreeningService(createFakeRepository(), createFakeRepository([], { scores }), scores)
}

test('create -> prescreen -> score -> confirm -> workbench read restores the result', async () => {
  const service = makeService()
  const screening = await service.createScreening(SCOPE, JD)
  assert.equal(screening.status, 'draft')
  assert.equal(screening.candidateCount, 0)

  const senior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  const junior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.junior })

  const seniorFindings = await service.prescreenResume(SCOPE, screening.id, senior.id)
  assert.deepEqual(seniorFindings, [])
  const juniorFindings = await service.prescreenResume(SCOPE, screening.id, junior.id)
  assert.ok(juniorFindings.some((finding) => finding.rule === 'R-01'))

  const receipt = await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    operationId: 'op-save-restore-1',
    dimensions: DIMENSIONS
  })
  assert.equal(receipt.totalScore, 72)
  assert.equal(receipt.duplicate, false)
  assert.equal(receipt.revision, 1)

  const confirmed = await service.confirmScreening(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    decision: 'interview',
    adjustedTotal: 75,
    note: '交易系统经验扎实，约一面。',
    baseRevision: 1
  })
  assert.equal(confirmed.totalScore, 75)
  assert.equal(confirmed.revision, 2)

  // A fresh read restores the saved state: senior first (higher score),
  // decision and note intact, junior still unscored.
  const workbench = await service.getWorkbenchData(SCOPE, { screeningId: screening.id })
  assert.equal(workbench.total, 2)
  assert.equal(workbench.items?.[0].name, '陈晓峰')
  assert.equal(workbench.items?.[0].totalScore, 75)
  assert.equal(workbench.items?.[0].decision, 'interview')
  assert.equal(workbench.items?.[0].note, '交易系统经验扎实，约一面。')
  assert.equal(workbench.items?.[1].name, '林涛')
  assert.equal(workbench.items?.[1].totalScore, null)
  assert.equal(workbench.items?.[1].decision, null)
  assert.ok(workbench.items?.[1].prescreen.some((finding) => finding.rule === 'R-01'))
  assert.equal(workbench.summary?.screeningId, screening.id)
  assert.equal(workbench.summary?.title, JD.title)
})

test('confirming with a stale baseRevision is rejected instead of overwriting', async () => {
  const service = makeService()
  const screening = await service.createScreening(SCOPE, JD)
  const senior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  await service.saveScore(SCOPE, {
    screeningId: screening.id,
    candidateId: senior.id,
    dimensions: DIMENSIONS
  })
  await assert.rejects(
    service.confirmScreening(SCOPE, {
      screeningId: screening.id,
      candidateId: senior.id,
      decision: 'interview',
      baseRevision: 99
    }),
    (error) => error.errorCode === 'revision_conflict'
  )
})

test('confirming a candidate that was never scored fails with a clear error', async () => {
  const service = makeService()
  const screening = await service.createScreening(SCOPE, JD)
  const senior = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  await assert.rejects(
    service.confirmScreening(SCOPE, {
      screeningId: screening.id,
      candidateId: senior.id,
      decision: 'interview'
    }),
    /No score exists/
  )
})

test('clearing a manual adjustment restores the AI score and survives a fresh read', async () => {
  const service = makeService()
  const screening = await service.createScreening(SCOPE, JD)
  const candidate = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  const review = { screeningId: screening.id, candidateId: candidate.id, decision: 'pending', note: 'fictional review' }
  await service.confirmScreening(SCOPE, { ...review, adjustedTotal: 75, baseRevision: 1 })
  // Omitted adjustment preserves an existing review for older callers.
  await service.confirmScreening(SCOPE, { ...review, baseRevision: 2 })
  assert.equal((await service.getWorkbenchData(SCOPE)).items[0].totalScore, 75)
  await service.confirmScreening(SCOPE, { ...review, adjustedTotal: null, baseRevision: 3 })
  const restored = (await service.getWorkbenchData(SCOPE, { screeningId: screening.id })).items[0]
  assert.equal(restored.aiTotalScore, 72)
  assert.equal(restored.totalScore, 72)
  assert.equal(restored.note, review.note)
  assert.equal(restored.decision, 'pending')
  await assert.rejects(service.confirmScreening(SCOPE, { ...review, adjustedTotal: 90, baseRevision: 3 }),
    (error) => error.errorCode === 'revision_conflict')
})
