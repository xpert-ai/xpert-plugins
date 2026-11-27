import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { ResumeScreeningViewProvider } from '../dist/lib/resume-screening-view.provider.js'
import { ResumeScreeningMiddleware } from '../dist/lib/resume-screening.middleware.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from './fake-repo.mjs'

async function fixture() {
  const screenings = createFakeRepository(), scores = createFakeRepository(), tasks = createFakeRepository()
  const candidates = createFakeRepository([], { scores })
  const service = new ResumeScreeningService(screenings, candidates, scores, tasks)
  const screening = await service.createScreening(SCOPE, JD)
  const first = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  const second = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.junior })
  const prepare = (ids = [first.id], replaceReviewed = false, requestId = randomUUID()) => service.prepareScoring(SCOPE,
    { screeningId: screening.id, candidateIds: ids, requestId, replaceReviewed })
  const score = (taskId, candidateId = first.id) => service.saveSelectedScore(SCOPE,
    { screeningId: screening.id, taskId, candidateId, dimensions: DIMENSIONS })
  return { service, screening, first, second, scores, candidates, tasks, prepare, score }
}

test('only explicitly selected candidates can receive a score, with exact evidence snapshots', async () => {
  const { service, screening, first, second, scores, prepare, score } = await fixture()
  const task = await prepare()
  await assert.rejects(score(task.taskId, second.id), /authorized scoring selection/)
  await score(task.taskId)
  assert.equal(scores.rows.length, 1)
  assert.equal(scores.rows[0].candidateId, first.id)
  assert.equal(scores.rows[0].evidence.resumeText, CANDIDATES.senior.resumeText)
  assert.equal(scores.rows[0].evidence.jdText, JD.jdText)
  assert.equal((await service.getWorkbenchData(SCOPE, { screeningId: screening.id })).items[0].scoreState, 'current')
  assert.equal((await score(task.taskId)).duplicate, true)
})

test('resume edit invalidates old human results; re-score archives and requires a new review', async () => {
  const { service, screening, first, scores, prepare, score } = await fixture()
  await score((await prepare()).taskId)
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: first.id,
    decision: 'interview', adjustedTotal: 82, note: '原人工结论', baseRevision: 1 })
  const detail = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  const edited = await service.updateCandidate(SCOPE, { ...detail, baseRevision: detail.revision,
    resumeText: `${detail.resumeText}\n补充虚构信息：项目职责有变化。` })
  assert.equal(edited.scoreState, 'stale')
  assert.equal(edited.history[0].decision, 'interview')
  assert.equal(edited.history[0].adjustedTotal, 82)
  const stale = (await service.getWorkbenchData(SCOPE, { screeningId: screening.id })).items.find((row) => row.candidateId === first.id)
  assert.equal(stale.totalScore, null)
  assert.equal(stale.decision, null)
  assert.equal(scores.rows[0].adjustedTotal, 82)
  await assert.rejects(service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: first.id,
    decision: 'pending', baseRevision: 2 }), /Re-score/)
  await score((await prepare()).taskId)
  const current = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  assert.equal(current.scoreState, 'current')
  assert.equal(current.history[0].adjustedTotal, 82)
  assert.equal(current.history[0].decision, 'interview')
  assert.equal(current.history[0].evidence.resumeText, CANDIDATES.senior.resumeText)
  assert.equal(current.evidence.resumeText, edited.resumeText)
  assert.equal(scores.rows[0].decision, null)
})

test('an in-flight model cannot save against a changed resume or changed human review', async () => {
  const { service, screening, first, prepare, score } = await fixture()
  const beforeEdit = await prepare()
  const detail = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  await service.updateCandidate(SCOPE, { ...detail, baseRevision: 1, name: '更新后的虚构姓名' })
  await assert.rejects(score(beforeEdit.taskId), /Resume changed/)
  const current = await prepare()
  await score(current.taskId)
  const beforeReview = await prepare()
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: first.id,
    decision: 'pending', baseRevision: 1 })
  await assert.rejects(score(beforeReview.taskId), /human review changed/)
})

test('reviewed re-evaluation preserves score time and adjustment separately from current results', async () => {
  const { service, screening, first, scores, prepare, score } = await fixture()
  await score((await prepare()).taskId)
  assert.ok(scores.rows[0].scoredAt instanceof Date)
  const originalScoredAt = new Date('2020-01-01T08:00:00Z')
  scores.rows[0].scoredAt = originalScoredAt
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: first.id,
    decision: 'interview', adjustedTotal: 90, baseRevision: 1 })
  assert.equal(scores.rows[0].scoredAt.toISOString(), originalScoredAt.toISOString())
  const reviewed = (await service.getWorkbenchData(SCOPE)).items.find((row) => row.candidateId === first.id)
  assert.equal(reviewed.aiTotalScore, 72)
  assert.equal(reviewed.adjustedTotal, 90)
  assert.equal(reviewed.totalScore, 90)
  await assert.rejects(prepare(), /Explicitly confirm/)
  await score((await prepare([first.id], true)).taskId)
  const detail = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  assert.equal(detail.history.length, 1)
  assert.equal(detail.history[0].scoredAt, originalScoredAt.toISOString())
  assert.equal(detail.history[0].adjustedTotal, 90)
  assert.ok(scores.rows[0].scoredAt.getTime() > originalScoredAt.getTime())
  const current = (await service.getWorkbenchData(SCOPE)).items.find((row) => row.candidateId === first.id)
  assert.equal(current.decision, null)
  assert.equal(current.adjustedTotal, null)
  const savedTime = scores.rows[0].scoredAt.toISOString()
  await score((await prepare()).taskId)
  assert.equal(scores.rows[0].scoredAt.toISOString(), savedTime)
  assert.equal((await service.getCandidateDetail(SCOPE, screening.id, first.id)).history.length, 1)
})

test('legacy score history leaves missing score time unknown instead of using review time', async () => {
  const { service, screening, first, scores, prepare, score } = await fixture()
  await score((await prepare()).taskId)
  delete scores.rows[0].scoredAt
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: first.id,
    decision: 'pending', adjustedTotal: 0, baseRevision: 1 })
  assert.equal((await service.getWorkbenchData(SCOPE)).items.find((row) => row.candidateId === first.id).adjustedTotal, 0)
  await score((await prepare([first.id], true)).taskId)
  const detail = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  assert.equal(detail.history[0].scoredAt, null)
  assert.equal(detail.history[0].adjustedTotal, 0)
})

test('resume optimistic updates reject stale pages and cross-scope writes', async () => {
  const { service, screening, first } = await fixture()
  const detail = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  const input = { ...detail, baseRevision: detail.revision }
  await service.updateCandidate(SCOPE, { ...input, name: '先保存者（虚构）' })
  await assert.rejects(service.updateCandidate(SCOPE, { ...input, name: '旧页面（虚构）' }), (error) => error.errorCode === 'revision_conflict')
  await assert.rejects(service.updateCandidate({ ...SCOPE, organizationId: 'other' }, input), /not found/)
  assert.equal((await service.getCandidateDetail(SCOPE, screening.id, first.id)).name, '先保存者（虚构）')
})

test('skills are deduplicated on both create and update, not just in the iframe', async () => {
  const { service, screening, first } = await fixture()
  const candidate = await service.addCandidate(SCOPE, { screeningId: screening.id,
    ...CANDIDATES.senior, skills: ['Java', ' java ', 'Spring Boot', 'SPRING BOOT'] })
  assert.deepEqual(candidate.skills, ['Java', 'Spring Boot'])
  const detail = await service.getCandidateDetail(SCOPE, screening.id, first.id)
  const changed = await service.updateCandidate(SCOPE, { ...detail, baseRevision: 1,
    skills: ['Go', 'go', 'PostgreSQL', ' PostgreSQL '] })
  assert.deepEqual(changed.skills, ['Go', 'PostgreSQL'])
})

test('scoring task retries are idempotent and cannot expand a saved selection', async () => {
  const { first, second, tasks, prepare } = await fixture()
  const requestId = randomUUID()
  assert.equal((await prepare([first.id], false, requestId)).taskId, requestId)
  await prepare([first.id], false, requestId)
  assert.equal(tasks.rows.length, 1)
  await assert.rejects(prepare([first.id, second.id], false, requestId), /another selection/)
  await assert.rejects(prepare([]), /Select/)
  await assert.rejects(prepare([first.id, first.id]), /Select/)
})

test('the actual view manifest declares every new UI action before host dispatch', async () => {
  const { service } = await fixture()
  const provider = new ResumeScreeningViewProvider(service)
  const manifests = provider.getViewManifests({ ...SCOPE, hostType: 'agent', hostId: 'preview',
    features: ['resume_screening'] }, 'agent.workbench.main')
  for (const key of ['update_screening', 'get_candidate', 'update_candidate', 'prepare_scoring']) {
    assert.ok(manifests.some((view) => view.actions?.some((action) => action.key === key)), key)
  }
})

test('the model tool accepts the natural selected payload and rejects an unselected candidate', async () => {
  const { service, screening, first, second, prepare } = await fixture()
  const task = await prepare()
  const tools = new ResumeScreeningMiddleware(service).createMiddleware({}, SCOPE).tools
  const get = tools.find((tool) => tool.name === 'resume_get_candidate')
  const score = tools.find((tool) => tool.name === 'resume_score')
  const payload = { screeningId: screening.id, taskId: task.taskId, candidateId: first.id }
  const evidence = JSON.parse(await get.invoke(payload))
  assert.equal(evidence.resumeText, CANDIDATES.senior.resumeText)
  assert.equal(evidence.candidateRevision, 1)
  assert.equal(JSON.parse(await score.invoke({ ...payload, dimensions: DIMENSIONS })).totalScore, 72)
  await assert.rejects(score.invoke({ ...payload, candidateId: second.id, dimensions: DIMENSIONS }), /authorized scoring selection/)
  await assert.rejects(score.invoke({ screeningId: screening.id, candidateId: first.id, dimensions: DIMENSIONS }), /tool input|taskId|Required/i)
})

test('a failed insert retains the criteria seal and can safely retry the same candidate request', async () => {
  const screenings = createFakeRepository(), scores = createFakeRepository(), candidates = createFakeRepository([], { scores })
  const service = new ResumeScreeningService(screenings, candidates, scores)
  const screening = await service.createScreening(SCOPE, JD)
  const insert = candidates.insert
  candidates.insert = async () => { throw new Error('simulated database insert failure') }
  const input = { ...CANDIDATES.senior, screeningId: screening.id, requestId: randomUUID() }
  await assert.rejects(service.addCandidate(SCOPE, input))
  const edit = (await service.getWorkbenchData(SCOPE)).summary.edit
  assert.equal(edit.criteriaLocked, true)
  await assert.rejects(service.updateScreening(SCOPE, { ...edit, screeningId: screening.id,
    baseVersion: edit.version, jdText: 'Must not change after intake starts' }), (error) => error.errorCode === 'criteria_locked')
  candidates.insert = insert
  await service.addCandidate(SCOPE, input)
  assert.equal(candidates.rows.length, 1)
})
