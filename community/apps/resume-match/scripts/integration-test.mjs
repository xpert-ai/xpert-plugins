import assert from 'node:assert/strict'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { DataSource } = require('typeorm')
const { ResumeMatchAnalysisEntity } = require('../dist/lib/entities/resume-match-analysis.entity.js')
const { ResumeMatchService } = require('../dist/lib/analysis.service.js')
const { analysisInputSchema } = require('../dist/lib/schemas.js')

const url = process.env.RESUME_MATCH_TEST_DATABASE_URL
if (!url) throw new Error('Set RESUME_MATCH_TEST_DATABASE_URL to an isolated PostgreSQL test database.')
const database = decodeURIComponent(new URL(url).pathname.slice(1))
if (!database.startsWith('resume_match_test_')) {
  throw new Error('Refusing schema synchronization: test database name must start with resume_match_test_.')
}

const options = {
  type: 'postgres', url, entities: [ResumeMatchAnalysisEntity], synchronize: true, logging: false
}
let source = new DataSource(options)
const scope = { tenantId: 'integration-tenant', organizationId: 'integration-organization', userId: 'integration-user' }
let recordId

try {
  await source.initialize()
  let repository = source.getRepository(ResumeMatchAnalysisEntity)
  assert.equal(await repository.count(), 0, 'Use a fresh test database to avoid modifying existing records.')
  let service = new ResumeMatchService(repository)
  const record = await service.create(scope, analysisInputSchema.parse({
    candidateName: '虚构候选人', jobTitle: '示例后端岗位',
    jobText: '测试岗位要求：使用 TypeScript 开发后端接口，维护 PostgreSQL 数据库，编写业务测试并说明项目职责。',
    resumeText: '这是一份虚构简历：参与 TypeScript 接口开发和 PostgreSQL 查询优化，编写业务测试。具体项目职责需要人工进一步核实。'
  }))
  recordId = record.id
  const failed = await service.markFailed(scope, record.id, 1, '模拟模型超时，用于验证数据库恢复和重试。')
  const retries = await Promise.allSettled([
    service.prepareRetry(scope, record.id, failed.revision),
    service.prepareRetry(scope, record.id, failed.revision)
  ])
  assert.equal(retries.filter((item) => item.status === 'fulfilled').length, 1)
  assert.equal(retries.filter((item) => item.status === 'rejected').length, 1)
  let current = (await service.getViewData(scope, { selectionId: record.id })).selected
  assert.equal(current.attempt, 2)
  assert.equal(await repository.count(), 1)

  const result = {
    analysisId: record.id, attempt: 2,
    skillsScore: 80, experienceScore: 60, domainScore: 40, educationScore: 20,
    skillsSummary: '虚构简历列出 TypeScript。', experienceSummary: '项目职责待核实。',
    domainSummary: '未提供行业信息。', educationSummary: '未提供学历材料。',
    matchedSkills: [{ name: 'TypeScript', score: 80 }], missingSkills: [],
    highlights: ['列出接口开发经历。'], risks: ['职责待核实。'],
    summary: '测试草稿，只用于验证存储。', recommendation: '请人工核实。'
  }
  await assert.rejects(service.saveResult(scope, { ...result, attempt: 1 }))
  const draft = await service.saveResult(scope, result)
  assert.equal(draft.status, 'review')
  assert.equal(draft.result.overallScore, 63)
  const duplicate = await service.saveResult(scope, result)
  assert.equal(duplicate.revision, draft.revision)
  const confirmation = {
    analysisId: record.id, expectedRevision: draft.revision,
    humanDecision: '进入人才库', humanScore: 60, humanConclusion: '测试人工结论，未执行招聘动作。'
  }
  const confirmed = await service.confirm(scope, confirmation)
  assert.equal(confirmed.status, 'confirmed')
  assert.equal((await service.confirm(scope, confirmation)).revision, confirmed.revision)
  const revised = { ...confirmation, expectedRevision: confirmed.revision, humanConclusion: '人工修订结论，仅用于测试。' }
  const edited = await service.confirm(scope, revised)
  assert.equal(edited.humanConclusion, revised.humanConclusion)
  await assert.rejects(service.confirm(scope, { ...revised, humanConclusion: '过时写入' }))
  await assert.rejects(service.saveResult(scope, result))
  await assert.rejects(service.markFailed(scope, record.id, 2, '迟到失败'))
  await assert.rejects(service.prepareRetry(scope, record.id, confirmed.revision))

  for (const otherScope of [
    { ...scope, userId: 'other-user' },
    { ...scope, organizationId: 'other-organization' },
    { ...scope, tenantId: 'other-tenant' }
  ]) {
    assert.equal((await service.getViewData(otherScope)).total, 0)
    await assert.rejects(service.readForAssistant(otherScope, record.id))
  }

  await source.destroy()
  source = new DataSource(options)
  await source.initialize()
  repository = source.getRepository(ResumeMatchAnalysisEntity)
  service = new ResumeMatchService(repository)
  current = (await service.getViewData(scope, { selectionId: record.id })).selected
  assert.equal(current.id, record.id)
  assert.equal(current.status, 'confirmed')
  assert.equal(current.humanConclusion, revised.humanConclusion)
  assert.equal(await repository.count(), 1)
  console.log('PostgreSQL integration passed: concurrent retry, stale write rejection, duplicate handling, three scope boundaries and reconnect recovery.')
  console.log('AI results were explicit test fixtures; no model or platform UI acceptance is claimed.')
} finally {
  if (source.isInitialized) {
    // Only the record created by this run is removed; no schema or existing data is dropped.
    if (recordId) await source.getRepository(ResumeMatchAnalysisEntity).delete({ id: recordId, ...scope })
    await source.destroy()
  }
}
