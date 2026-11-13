import test from 'node:test'
import assert from 'node:assert/strict'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { ResumeScreeningViewProvider } from '../dist/lib/resume-screening-view.provider.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE, createFakeRepository } from './fake-repo.mjs'

async function fixture() {
  const screenings = createFakeRepository(), scores = createFakeRepository(), candidates = createFakeRepository([], { scores })
  const service = new ResumeScreeningService(screenings, candidates, scores)
  const java = await service.createScreening(SCOPE, JD)
  const go = await service.createScreening(SCOPE, { ...JD, title: 'Go 岗位筛查（虚构）', jobTitle: 'Go 服务开发' })
  const candidate = await service.addCandidate(SCOPE, { ...CANDIDATES.senior, screeningId: java.id })
  return { service, screenings, java, go, candidate }
}

test('screening list reports actual linked resumes and searches titles and roles', async () => {
  const { service, screenings, java } = await fixture()
  screenings.rows.find((row) => row.id === java.id).candidateCount = 999
  const all = await service.getScreeningList(SCOPE)
  assert.equal(all.summary.kind, 'screening_list')
  assert.equal(all.total, 2)
  assert.equal(all.items.find((item) => item.id === java.id).candidateCount, 1)
  const roles = await service.getScreeningList(SCOPE, { search: '服务开发' })
  assert.equal(roles.total, 1)
  assert.equal(roles.items[0].candidateCount, 0)
  assert.equal((await service.getScreeningList(SCOPE, { search: 'missing role' })).total, 0)
})

test('status filters and pagination stay server-side, with cross-scope isolation', async () => {
  const { service, java, candidate } = await fixture()
  await service.saveScore(SCOPE, { screeningId: java.id, candidateId: candidate.id, dimensions: DIMENSIONS })
  await service.confirmScreening(SCOPE, { screeningId: java.id, candidateId: candidate.id, decision: 'interview', baseRevision: 1 })
  const completed = await service.getScreeningList(SCOPE, { status: 'completed' })
  assert.equal(completed.total, 1)
  assert.equal(completed.items[0].id, java.id)
  const page = await service.getScreeningList(SCOPE, { page: 2, pageSize: 1 })
  assert.equal(page.total, 2)
  assert.equal(page.items.length, 1)
  assert.equal(page.summary.page, 2)
  assert.equal((await service.getScreeningList({ ...SCOPE, organizationId: 'other' })).total, 0)
  await assert.rejects(service.getScreeningList(SCOPE, { status: 'invented_status' }), /Invalid screening status/)
})

test('view list and detail modes use explicit contracts; detail reads do not change data', async () => {
  const { service, java } = await fixture()
  const provider = new ResumeScreeningViewProvider(service)
  const context = { ...SCOPE, hostType: 'agent', hostId: null }
  const list = await provider.getViewData(context, 'workbench', { parameters: { mode: 'screenings' } })
  assert.equal(list.summary.kind, 'screening_list')
  const detail = await provider.executeViewAction(context, 'workbench', 'get_screening', { input: { screeningId: java.id } })
  assert.equal(detail.success, true)
  assert.equal(detail.data.screening.candidateCount, 1)
  assert.equal(detail.data.screening.edit.criteriaLocked, true)
  assert.equal(detail.data.screening.edit.jdText, JD.jdText)
  const candidates = await provider.getViewData(context, 'workbench', { parameters: { screeningId: java.id } })
  assert.equal(candidates.total, 1)
})
