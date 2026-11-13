import test from 'node:test'
import assert from 'node:assert/strict'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { ResumeScreeningMiddleware } from '../dist/lib/resume-screening.middleware.js'
import { ResumeScreeningViewProvider } from '../dist/lib/resume-screening-view.provider.js'
import { RESUME_SCREENING_VIEW_KEY, RESUME_SCREENING_REMOTE_ENTRY_KEY } from '../dist/lib/constants.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from './fake-repo.mjs'
import { randomUUID } from 'node:crypto'

async function fixture(scope = SCOPE) {
  const screenings = createFakeRepository(), scores = createFakeRepository()
  const candidates = createFakeRepository([], { scores })
  const service = new ResumeScreeningService(screenings, candidates, scores)
  const screening = await service.createScreening(scope, JD)
  const candidate = await service.addCandidate(scope, { screeningId: screening.id, ...CANDIDATES.senior })
  return { service, screenings, scores, candidates, screening, candidate }
}

test('refresh without an ID restores a saved case, JD, dimensions and human review', async () => {
  const { service, screening, candidate } = await fixture()
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: candidate.id, decision: 'interview', baseRevision: 1, note: '约面试' })
  const restored = await service.getWorkbenchData(SCOPE)
  assert.equal(restored.summary.screeningId, screening.id)
  assert.equal(restored.summary.jdText, JD.jdText)
  assert.equal(restored.summary.status, 'completed')
  assert.equal(restored.items[0].decision, 'interview')
  assert.deepEqual(restored.items[0].dimensions, DIMENSIONS)
})

test('retrying create and add with a stable request ID does not duplicate records', async () => {
  const { service, screenings, candidates } = await fixture()
  const requestId = randomUUID()
  const first = await service.createScreening(SCOPE, { ...JD, requestId })
  const retry = await service.createScreening(SCOPE, { ...JD, requestId })
  assert.equal(retry.id, first.id)
  assert.equal(screenings.rows.length, 2)
  const candidateRequest = { screeningId: first.id, requestId: randomUUID(), ...CANDIDATES.junior }
  const candidate = await service.addCandidate(SCOPE, candidateRequest)
  assert.equal((await service.addCandidate(SCOPE, candidateRequest)).id, candidate.id)
  assert.equal(candidates.rows.length, 2)
  assert.equal(screenings.rows.find((row) => row.id === first.id).candidateCount, 1)
})

test('a caller-selected UUID cannot overwrite a record belonging to another scope', async () => {
  const { service, screening, candidate, screenings, candidates } = await fixture()
  const otherScope = { ...SCOPE, organizationId: 'other-organization' }
  await assert.rejects(service.createScreening(otherScope, { ...JD, requestId: screening.id }), /could not be created/)
  assert.equal(screenings.rows[0].organizationId, SCOPE.organizationId)
  const other = await service.createScreening(otherScope, JD)
  await assert.rejects(service.addCandidate(otherScope, { screeningId: other.id, requestId: candidate.id, ...CANDIDATES.junior }), /could not be added/)
  assert.equal(candidates.rows[0].organizationId, SCOPE.organizationId)
  assert.equal(candidates.rows[0].name, CANDIDATES.senior.name)
})

test('ranking and name search apply before pagination and report filtered totals', async () => {
  const { service, screening, candidate } = await fixture()
  const second = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.junior })
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS.map((d) => ({ ...d, score: 5 })) })
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: second.id, dimensions: DIMENSIONS })
  const firstPage = await service.getWorkbenchData(SCOPE, { pageSize: 1 })
  assert.equal(firstPage.items[0].candidateId, second.id)
  const secondPage = await service.getWorkbenchData(SCOPE, { page: 2, pageSize: 1 })
  assert.equal(secondPage.items[0].candidateId, candidate.id)
  const search = await service.getWorkbenchData(SCOPE, { search: second.name, pageSize: 1, page: 20 })
  assert.equal(search.total, 1)
  assert.equal(search.summary.page, 1)
  assert.equal(search.items[0].candidateId, second.id)
})

test('tenant, organization and absent organization contexts cannot read another scope', async () => {
  const { service, screening, candidate } = await fixture()
  for (const scope of [{ ...SCOPE, tenantId: 'other' }, { ...SCOPE, organizationId: 'other' }, { ...SCOPE, organizationId: null }]) {
    assert.deepEqual(await service.listScreenings(scope), [])
    await assert.rejects(service.getCandidateContext(scope, screening.id, candidate.id), /not found/)
    await assert.rejects(service.saveScore(scope, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS }), /not found/)
  }
  await assert.rejects(service.getWorkbenchData({ tenantId: '' }), /Authenticated tenant/)
})

test('assistant and project scope do not widen access to other business contexts', async () => {
  for (const [scope, other] of [
    [{ ...SCOPE, assistantId: 'assistant-a' }, { ...SCOPE, assistantId: 'assistant-b' }],
    [{ ...SCOPE, projectId: 'project-a' }, { ...SCOPE, projectId: 'project-b' }]
  ]) {
    const { service, screening, candidate } = await fixture(scope)
    assert.deepEqual(await service.listScreenings(other), [])
    await assert.rejects(service.getCandidateContext(other, screening.id, candidate.id), /not found/)
  }
})

test('same caller operation key on two candidates cannot return the other candidate receipt', async () => {
  const { service, screening, candidate, scores } = await fixture()
  const second = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.junior })
  for (const item of [candidate, second]) {
    const receipt = await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: item.id, operationId: 'score-1', dimensions: DIMENSIONS })
    assert.equal(receipt.candidateId, item.id)
  }
  assert.equal(scores.rows.length, 2)
})

test('AI re-scoring cannot overwrite human decisions or adjusted scores', async () => {
  const { service, screening, candidate } = await fixture()
  const input = { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS }
  await service.saveScore(SCOPE, input)
  await service.confirmScreening(SCOPE, { ...input, decision: 'interview', adjustedTotal: 90, note: '人工复核', baseRevision: 1 })
  const retry = await service.saveScore(SCOPE, input)
  assert.equal(retry.totalScore, 90)
  await assert.rejects(service.saveScore(SCOPE, { ...input, dimensions: DIMENSIONS.map((d) => ({ ...d, score: 1 })) }), /human has confirmed/)
  assert.equal((await service.getWorkbenchData(SCOPE)).items[0].totalScore, 90)
})

test('human score adjustment does not rewrite the original AI score or screening suggestion', async () => {
  const { service, screening, candidate } = await fixture()
  const dimensions = DIMENSIONS.map((dimension) => ({ ...dimension, score: 9 }))
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions })
  await service.confirmScreening(SCOPE, {
    screeningId: screening.id, candidateId: candidate.id, decision: 'interview', adjustedTotal: 90, baseRevision: 1
  })
  const row = (await service.getWorkbenchData(SCOPE)).items[0]
  assert.equal(row.aiTotalScore, 45)
  assert.equal(row.totalScore, 90)
  assert.equal(row.suggestedDecision, 'rejected')
  assert.equal(row.decision, 'interview')
})

test('concurrent confirmations have one winner and require a current revision', async () => {
  const { service, screening, candidate } = await fixture()
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  const input = { screeningId: screening.id, candidateId: candidate.id, baseRevision: 1 }
  const results = await Promise.allSettled([
    service.confirmScreening(SCOPE, { ...input, decision: 'interview' }),
    service.confirmScreening(SCOPE, { ...input, decision: 'rejected' })
  ])
  assert.equal(results.filter((result) => result.status === 'fulfilled').length, 1)
  await assert.rejects(service.confirmScreening(SCOPE, { ...input, baseRevision: undefined, decision: 'pending' }), /baseRevision/)
})

test('blank skills and invalid degree are rejected and an empty review note clears the old one', async () => {
  const { service, screening, candidate } = await fixture()
  await assert.rejects(service.createScreening(SCOPE, { ...JD, requiredSkills: [' '] }), /nonempty required skills/)
  await assert.rejects(service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior, degree: 'invalid' }), /Invalid candidate/)
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: candidate.id, decision: 'pending', note: 'old', baseRevision: 1 })
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: candidate.id, decision: 'pending', note: '', baseRevision: 2 })
  assert.equal((await service.getWorkbenchData(SCOPE)).items[0].note, '')
})

test('middleware tools read stored evidence and never expose a human confirmation tool', async () => {
  const { service, screening, candidate } = await fixture()
  const middleware = new ResumeScreeningMiddleware(service).createMiddleware({}, SCOPE)
  assert.equal(middleware.tools.some((tool) => tool.name === 'resume_confirm'), false)
  const get = middleware.tools.find((tool) => tool.name === 'resume_get_candidate')
  const context = JSON.parse(await get.invoke({ screeningId: screening.id, candidateId: candidate.id }))
  assert.equal(context.resumeText, CANDIDATES.senior.resumeText)
  assert.equal(context.jdText, JD.jdText)
  assert.equal('tenantId' in context, false)
  await assert.rejects(get.invoke({ screeningId: screening.id, candidateId: candidate.id, tenantId: 'spoof' }), /tool input|Unrecognized/i)
})

test('real iframe entry includes generated styles and invalid actions return failure', async () => {
  const { service } = await fixture()
  const provider = new ResumeScreeningViewProvider(service)
  const entry = await provider.getRemoteComponentEntry({}, RESUME_SCREENING_VIEW_KEY, { entry: RESUME_SCREENING_REMOTE_ENTRY_KEY })
  assert.ok(entry.html.includes('--tw-'))
  assert.ok(entry.html.includes('root'))
  const result = await provider.executeViewAction(SCOPE, RESUME_SCREENING_VIEW_KEY, 'create_screening', { input: {} })
  assert.equal(result.success, false)
  assert.equal('data' in result, false)
})

test('view action exposes typed conflicts for both stale reads and lost atomic updates', async () => {
  const scope = { ...SCOPE, assistantId: 'assistant-test' }
  const { service, screening, candidate, scores } = await fixture(scope)
  await service.saveScore(scope, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  const provider = new ResumeScreeningViewProvider(service)
  const context = { ...scope, hostType: 'agent', hostId: scope.assistantId }
  const request = { input: { screeningId: screening.id, candidateId: candidate.id, decision: 'pending', baseRevision: 99 } }
  const stale = await provider.executeViewAction(context, RESUME_SCREENING_VIEW_KEY, 'confirm_candidate', request)
  assert.equal(stale.success, false)
  assert.deepEqual(stale.failure, { kind: 'business', code: 'revision_conflict' })
  assert.equal((await service.getWorkbenchData(scope)).items[0].decision, null)

  scores.update = async () => ({ affected: 0 })
  request.input.baseRevision = 1
  const raced = await provider.executeViewAction(context, RESUME_SCREENING_VIEW_KEY, 'confirm_candidate', request)
  assert.equal(raced.success, false)
  assert.deepEqual(raced.failure, stale.failure)

  service.confirmScreening = async () => { throw new Error('revision mentioned in an unrelated failure') }
  const unrelated = await provider.executeViewAction(context, RESUME_SCREENING_VIEW_KEY, 'confirm_candidate', request)
  assert.equal(unrelated.failure, undefined)
})

test('view confirmation distinguishes a cleared adjustment from omitted or malformed input', async () => {
  const scope = { ...SCOPE, assistantId: 'assistant-test' }
  const { service, screening, candidate } = await fixture(scope)
  await service.saveScore(scope, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  await service.confirmScreening(scope, { screeningId: screening.id, candidateId: candidate.id,
    decision: 'pending', adjustedTotal: 75, baseRevision: 1 })
  const provider = new ResumeScreeningViewProvider(service)
  const context = { ...scope, hostType: 'agent', hostId: scope.assistantId }
  const input = { screeningId: screening.id, candidateId: candidate.id, decision: 'pending', baseRevision: 2 }
  for (const value of ['0', '', {}, false, 101, -1, 1.5]) {
    const rejected = await provider.executeViewAction(context, RESUME_SCREENING_VIEW_KEY, 'confirm_candidate',
      { input: { ...input, adjustedTotal: value } })
    assert.equal(rejected.success, false)
  }
  assert.equal((await service.getWorkbenchData(scope)).items[0].revision, 2)
  const cleared = await provider.executeViewAction(context, RESUME_SCREENING_VIEW_KEY, 'confirm_candidate',
    { input: { ...input, adjustedTotal: null } })
  assert.equal(cleared.success, true)
  const row = (await service.getWorkbenchData(scope)).items[0]
  assert.equal(row.totalScore, 72)
  assert.equal(row.aiTotalScore, 72)
})
