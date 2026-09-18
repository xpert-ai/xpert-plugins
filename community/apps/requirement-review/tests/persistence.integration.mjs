import 'reflect-metadata'
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { DataSource } from 'typeorm'
import { Review } from '../dist/entities/review.entity.js'
import { AnalysisAttempt } from '../dist/entities/analysis-attempt.entity.js'
import { ReviewService } from '../dist/services/review.service.js'
const sourceText =
  '00:12 用户：需要按项目筛选需求，并展示对应访谈证据。\n00:24 用户：筛选后只显示所选项目的需求。'
const draft = {
  summary: '项目筛选',
  requirements: [
    {
      title: '按项目筛选需求',
      description: '按所选项目展示需求和访谈证据。',
      evidence: [
        { segmentId: 'S01', quote: '需要按项目筛选需求，并展示对应访谈证据。' }
      ],
      acceptance: [{ text: '筛选后只显示所选项目的需求。', basis: 'source' }],
      openQuestions: ['项目列表从何处获取？']
    }
  ]
}
test('PostgreSQL scope, concurrency, attempts and confirmation persistence', async (t) => {
  if (!process.env.DB_PASS || !process.env.DB_NAME)
    throw new Error(
      'Run with the configured local platform environment; credentials are never printed'
    )
  const schema = `reqtrace_test_${randomUUID().replaceAll('-', '')}`
  const options = {
    type: 'postgres',
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT || 5432),
    username: process.env.DB_USER,
    password: process.env.DB_PASS,
    database: process.env.DB_NAME,
    logging: false
  }
  const admin = await new DataSource(options).initialize()
  await admin.query(`CREATE SCHEMA "${schema}"`)
  let db
  try {
    db = await new DataSource({
      ...options,
      schema,
      entities: [Review, AnalysisAttempt],
      synchronize: true
    }).initialize()
    const service = new ReviewService(db)
    const scope = {
      tenantId: randomUUID(),
      organizationId: randomUUID(),
      userId: randomUUID()
    }
    const created = await service.create(scope, {
      title: '集成测试',
      sourceText
    })
    const key = randomUUID()
    const [first, second] = await Promise.all([
      service.start(scope, {
        reviewId: created.reviewId,
        version: 1,
        requestKey: key
      }),
      service.start(scope, {
        reviewId: created.reviewId,
        version: 1,
        requestKey: randomUUID()
      })
    ])
    assert.equal([first, second].filter((item) => item.dispatch).length, 1)
    assert.equal(first.attemptId, second.attemptId)
    assert.equal(
      (
        await service.start(scope, {
          reviewId: created.reviewId,
          version: 1,
          requestKey: key
        })
      ).dispatch,
      false
    )
    const input = await service.readSource(scope, {
      reviewId: created.reviewId,
      attemptId: first.attemptId
    })
    const bad = structuredClone(draft)
    bad.requirements[0].evidence[0].quote = '这句话不存在'
    const invalid = await service.submit(scope, { ...input, draft: bad })
    assert.equal(invalid.code, 'invalid_evidence')
    assert.equal(
      (await service.get(scope, created.reviewId)).review.aiDraft,
      null
    )
    const retry = await service.start(scope, {
      reviewId: created.reviewId,
      version: invalid.version,
      requestKey: randomUUID()
    })
    const good = await service.submit(scope, {
      reviewId: created.reviewId,
      attemptId: retry.attemptId,
      inputVersion: 1,
      draft
    })
    assert.equal(good.status, 'REVIEWING')
    const attemptHistory = (await service.get(scope, created.reviewId)).attempts
    assert.equal(attemptHistory.length, 2)
    assert.deepEqual(
      new Set(attemptHistory.map((item) => item.status)),
      new Set(['SUCCEEDED', 'FAILED'])
    )
    assert.equal(
      attemptHistory.every((item) => item.inputVersion === 1),
      true
    )
    await assert.rejects(
      () =>
        service.confirm(scope, {
          reviewId: created.reviewId,
          version: good.version
        }),
      { code: 'confirmation_blocked' }
    )
    for (const field of ['tenantId', 'organizationId', 'userId'])
      await assert.rejects(
        () =>
          service.get({ ...scope, [field]: randomUUID() }, created.reviewId),
        { code: 'not_found' }
      )
    const restored = await service.get(scope, created.reviewId)
    const edited = structuredClone(restored.review.editableDraft)
    edited.requirements[0].openQuestions = []
    edited.requirements[0].description = '人工核对后的描述'
    const saved = await service.saveDraft(scope, {
      reviewId: created.reviewId,
      version: good.version,
      draft: edited
    })
    await assert.rejects(
      () =>
        service.saveDraft(scope, {
          reviewId: created.reviewId,
          version: good.version,
          draft: edited
        }),
      { code: 'version_conflict' }
    )
    assert.deepEqual(
      (await service.get(scope, created.reviewId)).review.aiDraft,
      draft
    )
    const confirmed = await service.confirm(scope, {
      reviewId: created.reviewId,
      version: saved.version
    })
    assert.equal(confirmed.status, 'CONFIRMED')
    assert.equal(
      confirmed.snapshot.draft.requirements[0].description,
      '人工核对后的描述'
    )
    assert.deepEqual(
      (await service.confirm(scope, { reviewId: created.reviewId, version: 1 }))
        .snapshot,
      confirmed.snapshot
    )
    const newService = new ReviewService(db)
    assert.deepEqual(
      (await newService.get(scope, created.reviewId)).review.confirmedSnapshot,
      confirmed.snapshot
    )
    const timeoutReview = await service.create(scope, {
      title: '超时测试',
      sourceText
    })
    const old = await service.start(scope, {
      reviewId: timeoutReview.reviewId,
      version: 1,
      requestKey: randomUUID()
    })
    await db
      .getRepository(AnalysisAttempt)
      .update(old.attemptId, { deadlineAt: '2000-01-01T00:00:00.000Z' })
    const expired = await service.get(scope, timeoutReview.reviewId)
    assert.equal(expired.attempt.status, 'INTERRUPTED')
    assert.equal(expired.review.status, 'FAILED')
    await t.test('failed result can revise source and stale version cannot overwrite', async () => {
      const staleVersion = expired.review.version - 1
      await assert.rejects(
        () =>
          service.reviseSource(scope, {
            reviewId: timeoutReview.reviewId,
            version: staleVersion,
            title: '不应保存的标题',
            sourceText: '不应保存的原文'
          }),
        { code: 'version_conflict' }
      )
      const unchanged = await service.get(scope, timeoutReview.reviewId)
      assert.equal(unchanged.review.title, '超时测试')
      assert.equal(unchanged.review.sourceText, sourceText)
      const revised = await service.reviseSource(scope, {
        reviewId: timeoutReview.reviewId,
        version: unchanged.review.version,
        title: '失败后修订',
        sourceText: `${sourceText}\n00:36 用户：失败后补充原文。`
      })
      assert.equal(revised.status, 'READY')
      const stored = await service.get(scope, timeoutReview.reviewId)
      assert.equal(stored.review.inputVersion, 2)
      assert.equal(stored.review.aiDraft, null)
      assert.equal(stored.review.editableDraft, null)
    })
    const revisedTimeout = await service.get(scope, timeoutReview.reviewId)
    const fresh = await service.start(scope, {
      reviewId: timeoutReview.reviewId,
      version: revisedTimeout.review.version,
      requestKey: randomUUID()
    })
    assert.equal(
      (await service.get(scope, timeoutReview.reviewId)).attempt.id,
      fresh.attemptId
    )
    await service.submit(scope, {
      reviewId: timeoutReview.reviewId,
      attemptId: fresh.attemptId,
      inputVersion: 2,
      draft
    })
    const revisedHistory = (
      await service.get(scope, timeoutReview.reviewId)
    ).attempts
    assert.equal(revisedHistory.length, 2)
    assert.deepEqual(
      new Set(revisedHistory.map((item) => item.status)),
      new Set(['SUCCEEDED', 'INTERRUPTED'])
    )
    assert.deepEqual(
      new Set(revisedHistory.map((item) => item.inputVersion)),
      new Set([1, 2])
    )
    assert.deepEqual(
      revisedHistory.map((item) => item.inputVersion),
      [2, 1]
    )
    const late = await service.submit(scope, {
      reviewId: timeoutReview.reviewId,
      attemptId: old.attemptId,
      inputVersion: 1,
      draft: bad
    })
    assert.equal(late.applied, false)
    assert.equal(
      (await service.get(scope, timeoutReview.reviewId)).review.status,
      'REVIEWING'
    )
    await t.test('empty result can revise source and retry', async () => {
      const empty = await service.create(scope, {
        title: '空结果测试',
        sourceText: '今天的天气很好。'
      })
      const attempt = await service.start(scope, {
        reviewId: empty.reviewId,
        version: 1,
        requestKey: randomUUID()
      })
      const result = await service.submit(scope, {
        reviewId: empty.reviewId,
        attemptId: attempt.attemptId,
        inputVersion: 1,
        draft: { requirements: [], summary: '无需求' }
      })
      assert.equal(result.status, 'EMPTY')
      const revised = await service.reviseSource(scope, {
        reviewId: empty.reviewId,
        version: result.version,
        title: '修订原文',
        sourceText
      })
      assert.equal(revised.status, 'READY')
      const stored = (await service.get(scope, empty.reviewId)).review
      assert.equal(stored.inputVersion, 2)
      assert.equal(stored.title, '修订原文')
      assert.equal(stored.sourceText, sourceText)
      assert.equal(stored.aiDraft, null)
      assert.equal(stored.editableDraft, null)
    })
  } finally {
    if (db?.isInitialized) await db.destroy()
    // Drop only the randomly named schema owned by this test. Production tables are never touched.
    await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
    await admin.destroy()
  }
})
