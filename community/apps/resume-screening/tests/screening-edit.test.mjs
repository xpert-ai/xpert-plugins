import test from 'node:test'
import assert from 'node:assert/strict'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { ResumeScreeningViewProvider } from '../dist/lib/resume-screening-view.provider.js'
import { RESUME_SCREENING_VIEW_KEY } from '../dist/lib/constants.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from './fake-repo.mjs'

async function fixture() {
  const screenings = createFakeRepository(), scores = createFakeRepository()
  const candidates = createFakeRepository([], { scores })
  const service = new ResumeScreeningService(screenings, candidates, scores)
  const screening = await service.createScreening(SCOPE, JD)
  const read = () => service.getWorkbenchData(SCOPE, { screeningId: screening.id })
  const input = async (patch = {}) => {
    const { version, criteriaLocked, ...fields } = (await read()).summary.edit
    return { ...fields, screeningId: screening.id, baseVersion: version, ...patch }
  }
  return { service, screenings, candidates, scores, screening, read, input }
}

test('empty screening edits all fields and a fresh service restores them', async () => {
  const { service, screenings, candidates, scores, screening, input } = await fixture()
  await service.updateScreening(SCOPE, await input({ title: ' 已编辑的虚构筛查单 ', jobTitle: 'Go 开发',
    jdText: '虚构岗位：Go 服务开发', minYears: 3, minDegree: 'master', requiredSkills: ['Go', 'PostgreSQL'] }))
  const restored = await new ResumeScreeningService(screenings, candidates, scores).getWorkbenchData(SCOPE)
  assert.equal(restored.summary.screeningId, screening.id)
  assert.equal(restored.summary.title, '已编辑的虚构筛查单')
  assert.equal(restored.summary.edit.jobTitle, 'Go 开发')
  assert.equal(restored.summary.edit.minYears, 3)
  assert.equal(restored.summary.edit.minDegree, 'master')
  assert.deepEqual(restored.summary.edit.requiredSkills, ['Go', 'PostgreSQL'])
  assert.equal(restored.summary.edit.criteriaLocked, false)
  assert.equal(restored.summary.screenings[0].title, '已编辑的虚构筛查单')
})

test('stale edits return a typed conflict and cannot overwrite the current title', async () => {
  const { service, read, input } = await fixture()
  const original = await input()
  await service.updateScreening(SCOPE, { ...original, title: 'Winner' })
  await assert.rejects(service.updateScreening(SCOPE, { ...original, title: 'Stale' }),
    (error) => error.errorCode === 'revision_conflict')
  assert.equal((await read()).summary.title, 'Winner')
})

test('adding a candidate locks criteria even for a draft and rejects stale open-form changes', async () => {
  const { service, screening, read, input } = await fixture()
  const beforeAdd = await input({ jdText: 'Must not replace original evidence' })
  await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  await assert.rejects(service.updateScreening(SCOPE, beforeAdd), (error) => error.errorCode === 'criteria_locked')
  const restored = await read()
  assert.equal(restored.summary.edit.criteriaLocked, true)
  assert.equal(restored.summary.jdText, JD.jdText)
  assert.equal(restored.total, 1)
})

test('renaming a scored screening preserves original AI evidence and human review', async () => {
  const { service, screening, read, input } = await fixture()
  const candidate = await service.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
  await service.prescreenResume(SCOPE, screening.id, candidate.id)
  await service.saveScore(SCOPE, { screeningId: screening.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  await service.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: candidate.id,
    decision: 'interview', adjustedTotal: 82, note: '虚构复核', baseRevision: 1 })
  const original = (await read()).items[0]
  await service.updateScreening(SCOPE, await input({ title: '已复核的虚构批次' }))
  assert.deepEqual((await read()).items[0], original)
  for (const patch of [{ jobTitle: 'Changed' }, { jdText: 'Changed' }, { minYears: 1 },
    { minDegree: 'doctorate' }, { requiredSkills: ['Go'] }]) {
    await assert.rejects(service.updateScreening(SCOPE, await input(patch)), (error) => error.errorCode === 'criteria_locked')
  }
})

test('invalid inputs and unauthorized scopes cannot modify a screening', async () => {
  const { service, read, input } = await fixture()
  for (const patch of [{ title: ' ' }, { minYears: -1 }, { minDegree: 'toString' },
    { requiredSkills: [''] }, { requiredSkills: Array(21).fill('Java') }, { baseVersion: '' }]) {
    await assert.rejects(service.updateScreening(SCOPE, await input(patch)))
  }
  for (const scope of [{ ...SCOPE, tenantId: 'other' }, { ...SCOPE, organizationId: 'other' },
    { ...SCOPE, assistantId: 'other' }, { ...SCOPE, projectId: 'other' }, { ...SCOPE, workspaceId: 'other' }]) {
    await assert.rejects(service.updateScreening(scope, await input({ title: 'No access' })), /not found/)
  }
  assert.equal((await read()).summary.title, JD.title)
})

test('view update action propagates machine-readable edit conflicts', async () => {
  const { service, input } = await fixture()
  const original = await input()
  await service.updateScreening(SCOPE, { ...original, title: 'Saved first' })
  const provider = new ResumeScreeningViewProvider(service)
  const result = await provider.executeViewAction({ ...SCOPE, hostType: 'agent', hostId: null },
    RESUME_SCREENING_VIEW_KEY, 'update_screening', { input: { ...original, title: 'Stale view' } })
  assert.equal(result.success, false)
  assert.deepEqual(result.failure, { kind: 'business', code: 'revision_conflict' })
})
