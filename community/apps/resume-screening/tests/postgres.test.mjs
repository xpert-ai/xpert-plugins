import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { ResumeCandidate, ResumeScore, ResumeScreening, ResumeScoringTask } from '../dist/lib/entities/index.js'
import { ResumeScreeningService } from '../dist/lib/resume-screening.service.js'
import { CANDIDATES, DIMENSIONS, JD, SCOPE } from './fake-repo.mjs'

// Opt-in real-database regression. All writes use a unique disposable schema;
// the platform's public schema and its business records are never modified.
test('PostgreSQL: empty and scored lists, pagination, confirmation, and recovery', {
  skip: !process.env.RESUME_TEST_DATABASE_URL
}, async () => {
  const schema = `resume_screening_test_${randomUUID().replaceAll('-', '')}`
  assert.match(schema, /^resume_screening_test_[0-9a-f]{32}$/)
  const source = new DataSource({
    type: 'postgres', url: process.env.RESUME_TEST_DATABASE_URL, schema,
    entities: [ResumeScreening, ResumeCandidate, ResumeScore, ResumeScoringTask], synchronize: false, logging: false,
    extra: { max: 3 }
  })
  await source.initialize()
  let createdSchema = false
  try {
    await source.query(`CREATE SCHEMA "${schema}"`)
    createdSchema = true
    await source.synchronize()
    const service = () => new ResumeScreeningService(
      source.getRepository(ResumeScreening), source.getRepository(ResumeCandidate), source.getRepository(ResumeScore),
      source.getRepository(ResumeScoringTask)
    )
    const app = service()
    const screening = await app.createScreening(SCOPE, { ...JD, requestId: randomUUID() })

    // The original varchar = uuid join failed even for a newly created empty case.
    assert.equal((await app.getWorkbenchData(SCOPE, { screeningId: screening.id })).total, 0)
    const emptyEdit = (await app.getWorkbenchData(SCOPE, { screeningId: screening.id })).summary.edit
    const editInput = { ...emptyEdit, screeningId: screening.id, baseVersion: emptyEdit.version }
    const edits = await Promise.allSettled([
      app.updateScreening(SCOPE, { ...editInput, title: '数据库编辑甲（虚构）' }),
      app.updateScreening(SCOPE, { ...editInput, title: '数据库编辑乙（虚构）' })
    ])
    assert.equal(edits.filter((result) => result.status === 'fulfilled').length, 1)
    assert.equal(edits.find((result) => result.status === 'rejected').reason.errorCode, 'revision_conflict')
    const senior = await app.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.senior })
    const junior = await app.addCandidate(SCOPE, { screeningId: screening.id, ...CANDIDATES.junior })
    assert.equal((await app.getWorkbenchData(SCOPE, { screeningId: screening.id })).total, 2)
    await app.saveScore(SCOPE, { screeningId: screening.id, candidateId: senior.id, operationId: 'postgres-score', dimensions: DIMENSIONS })
    await app.saveScore(SCOPE, { screeningId: screening.id, candidateId: junior.id, dimensions: DIMENSIONS.map((item) => ({ ...item, score: 10 })) })
    const first = await app.getWorkbenchData(SCOPE, { screeningId: screening.id, pageSize: 1 })
    assert.equal(first.items[0].candidateId, senior.id)
    assert.equal(first.items[0].totalScore, 72)
    const seniorScoreTime = (await source.getRepository(ResumeScore).findOneByOrFail({ candidateId: senior.id })).scoredAt
    assert.ok(seniorScoreTime instanceof Date)
    assert.equal((await app.getWorkbenchData(SCOPE, { screeningId: screening.id, pageSize: 1, page: 2 })).items[0].candidateId, junior.id)
    assert.equal((await app.getWorkbenchData(SCOPE, { screeningId: screening.id, search: junior.name })).total, 1)

    await app.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: senior.id,
      decision: 'interview', adjustedTotal: 75, note: '虚构数据：真实数据库回归', baseRevision: 1 })
    const restored = await service().getWorkbenchData(SCOPE, { screeningId: screening.id })
    assert.equal(restored.items[0].totalScore, 75)
    assert.equal(restored.items[0].aiTotalScore, 72)
    assert.equal(restored.items[0].adjustedTotal, 75)
    assert.equal((await source.getRepository(ResumeScore).findOneByOrFail({ candidateId: senior.id })).scoredAt.toISOString(), seniorScoreTime.toISOString())
    assert.equal(restored.items[0].decision, 'interview')
    assert.equal(restored.items[0].revision, 2)
    await app.confirmScreening(SCOPE, { screeningId: screening.id, candidateId: senior.id,
      decision: 'interview', adjustedTotal: null, baseRevision: 2 })
    const cleared = (await service().getWorkbenchData(SCOPE, { screeningId: screening.id })).items[0]
    assert.equal(cleared.totalScore, 72)
    assert.equal(cleared.aiTotalScore, 72)
    assert.equal(cleared.revision, 3)
    assert.equal((await app.getWorkbenchData({ ...SCOPE, organizationId: randomUUID() })).total, 0)
    assert.equal((await app.saveScore(SCOPE, { screeningId: screening.id, candidateId: senior.id,
      operationId: 'postgres-score', dimensions: DIMENSIONS })).duplicate, true)
    assert.equal(await source.getRepository(ResumeScore).count(), 2)
    const listed = await app.getScreeningList(SCOPE, { search: 'java', status: 'reviewing', pageSize: 1 })
    assert.equal(listed.total, 1)
    assert.equal(listed.items[0].candidateCount, 2)
    assert.equal(listed.items[0].id, screening.id)
    assert.equal((await app.getScreeningDetail(SCOPE, screening.id)).candidateCount, 2)

    // Conditional sealing and edit revisions arbitrate edit versus first insert without plugin transactions.
    const racing = await app.createScreening(SCOPE, { ...JD, title: '并发添加与编辑（虚构）' })
    const racingEdit = (await app.getWorkbenchData(SCOPE, { screeningId: racing.id })).summary.edit
    const [editResult, addResult] = await Promise.allSettled([
      app.updateScreening(SCOPE, { ...racingEdit, screeningId: racing.id,
        baseVersion: racingEdit.version, jdText: '并发编辑后的虚构岗位依据' }),
      app.addCandidate(SCOPE, { screeningId: racing.id, ...CANDIDATES.junior })
    ])
    if (addResult.status === 'rejected') {
      assert.equal(addResult.reason.errorCode, 'revision_conflict')
      await app.addCandidate(SCOPE, { screeningId: racing.id, ...CANDIDATES.junior })
    }
    const afterRace = await app.getWorkbenchData(SCOPE, { screeningId: racing.id })
    assert.equal(afterRace.total, 1)
    assert.equal(afterRace.summary.edit.criteriaLocked, true)
    assert.equal(afterRace.summary.jdText, editResult.status === 'fulfilled' ? '并发编辑后的虚构岗位依据' : JD.jdText)
    if (editResult.status === 'rejected') assert.ok(['criteria_locked', 'revision_conflict'].includes(editResult.reason.errorCode))
    await assert.rejects(app.updateScreening(SCOPE, { ...afterRace.summary.edit, screeningId: racing.id,
      baseVersion: afterRace.summary.edit.version, jdText: '禁止覆盖' }), (error) => error.errorCode === 'criteria_locked')

    const task = await app.prepareScoring(SCOPE, { screeningId: screening.id,
      candidateIds: [junior.id], requestId: randomUUID() })
    await assert.rejects(app.saveSelectedScore(SCOPE, { screeningId: screening.id, taskId: task.taskId,
      candidateId: senior.id, dimensions: DIMENSIONS }), /authorized scoring selection/)
    const before = await app.getCandidateDetail(SCOPE, screening.id, junior.id)
    await app.updateCandidate(SCOPE, { ...before, baseRevision: before.revision, resumeText: `${before.resumeText}\n新的虚构项目：负责 Go 服务接口。` })
    await assert.rejects(app.saveSelectedScore(SCOPE, { screeningId: screening.id, taskId: task.taskId,
      candidateId: junior.id, dimensions: DIMENSIONS }), /Resume changed/)
    const updatedTask = await app.prepareScoring(SCOPE, { screeningId: screening.id,
      candidateIds: [junior.id], requestId: randomUUID() })
    await app.saveSelectedScore(SCOPE, { screeningId: screening.id, taskId: updatedTask.taskId, candidateId: junior.id, dimensions: DIMENSIONS })
    const updated = await service().getCandidateDetail(SCOPE, screening.id, junior.id)
    assert.equal(updated.scoreState, 'current')
    assert.equal(updated.history.length, 1)
    assert.ok(Number.isFinite(Date.parse(updated.history[0].scoredAt)))
    assert.equal(updated.evidence.candidateRevision, 2)
    assert.equal((await app.getWorkbenchData(SCOPE, { screeningId: screening.id })).total, 2)
  } finally {
    try {
      if (createdSchema) await source.query(`DROP SCHEMA "${schema}" CASCADE`)
    } finally { await source.destroy() }
  }
})
