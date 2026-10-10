require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DataSource } = require('typeorm')
const { ReviewCase, ReviewEvent } = require('../dist/lib/entities.js')
const { ReviewService } = require('../dist/lib/service.js')
const { source, fields, inputs } = require('./fixture.cjs')
test(
  'draft revisions, incomplete input, scored confirmation, isolation and legacy rows',
  { skip: !process.env.REVIEW_TEST_DB_HOST },
  async () => {
    const db = new DataSource({
      type: 'postgres',
      host: process.env.REVIEW_TEST_DB_HOST,
      port: 5432,
      username: process.env.DB_USER,
      password: process.env.DB_PASS,
      database: process.env.DB_NAME,
      entities: [ReviewCase, ReviewEvent],
      synchronize: false
    })
    await db.initialize()
    const service = new ReviewService(db)
    const scope = Object.fromEntries(
      ['tenantId', 'organizationId', 'userId', 'assistantId'].map((k) => [
        k,
        randomUUID()
      ])
    )
    try {
      const created = await service.create(scope, {
        title: 'Synthetic scoring fixture',
        source,
        operationId: randomUUID(),
        evaluationDate: inputs.evaluationDate
      })
      const start = await service.start(scope, {
        id: created.id,
        revision: 1,
        operationId: randomUUID()
      })
      await service.saveCandidates(scope, start.attemptId, fields)
      const ready = await service.detail(scope, created.id)
      const incomplete = {
        id: created.id,
        revision: ready.revision,
        operationId: randomUUID(),
        fields: fields.map((f) =>
          f.key === 'pledgeRatio' ? { ...f, value: null } : f
        ),
        reason: 'Work in progress',
        inputs: { ...inputs, departureCount: '' }
      }
      const draft = await service.saveDraft(scope, incomplete)
      assert.equal(
        (await service.saveDraft(scope, incomplete)).revision,
        draft.revision
      )
      assert.equal(
        (await new ReviewService(db).detail(scope, created.id)).reviewDraft
          .inputs.departureCount,
        ''
      )
      assert.deepEqual(draft.candidates, fields)
      assert.equal(
        (
          await service.previewScore(scope, {
            ...incomplete,
            revision: draft.revision
          })
        ).total,
        null
      )
      await assert.rejects(
        service.confirm(scope, {
          ...incomplete,
          revision: draft.revision,
          fields,
          operationId: randomUUID()
        }),
        /score_incomplete/
      )
      await assert.rejects(
        service.saveDraft(scope, { ...incomplete, operationId: randomUUID() }),
        /conflict/
      )
      const complete = {
        ...incomplete,
        revision: draft.revision,
        fields,
        inputs,
        operationId: randomUUID(),
        reason: ''
      }
      for (const dimension of Object.keys(scope)) {
        const foreign = { ...scope, [dimension]: randomUUID() }
        await assert.rejects(service.detail(foreign, created.id), /not_found/)
        await assert.rejects(service.saveDraft(foreign, complete), /not_found/)
        await assert.rejects(
          service.previewScore(foreign, complete),
          /not_found/
        )
        await assert.rejects(service.confirm(foreign, complete), /not_found/)
      }
      assert.equal((await service.previewScore(scope, complete)).total, 7)
      await assert.rejects(
        service.confirm(scope, { ...complete, total: 15 }),
        /unrecognized_keys/
      )
      const confirmed = await service.confirm(scope, complete)
      assert.equal(confirmed.assessment.total, 7)
      assert.equal(confirmed.assessment.veto, 'clear')
      assert.equal(
        (await service.confirm(scope, complete)).revision,
        confirmed.revision
      )
      assert.equal(
        await db
          .getRepository(ReviewEvent)
          .countBy({ ...scope, caseId: created.id, kind: 'confirmed' }),
        1
      )
      await assert.rejects(
        service.saveDraft(scope, {
          ...complete,
          revision: confirmed.revision,
          operationId: randomUUID()
        }),
        /invalid_state/
      )
      assert.deepEqual(
        (await new ReviewService(db).detail(scope, created.id)).assessment,
        confirmed.assessment
      )
      // Simulate the additive migration's null fields on a fixture, not production rows.
      await db
        .getRepository(ReviewCase)
        .update(created.id, { reviewDraft: null, assessment: null })
      const legacy = await service.detail(scope, created.id)
      assert.equal(legacy.status, 'confirmed')
      assert.equal(legacy.assessment, null)
      assert.deepEqual(legacy.confirmed, fields)
      const second = await service.create(scope, {
        title: 'Saved input correction',
        source,
        operationId: randomUUID()
      })
      const attempt = await service.start(scope, {
        id: second.id,
        revision: second.revision,
        operationId: randomUUID()
      })
      await service.saveCandidates(scope, attempt.attemptId, fields)
      await service.saveCandidates(scope, attempt.attemptId, fields)
      const secondReady = await service.detail(scope, second.id)
      const baseline = await service.saveDraft(scope, {
        ...complete,
        id: second.id,
        revision: secondReady.revision,
        operationId: randomUUID()
      })
      const correction = {
        ...complete,
        id: second.id,
        revision: baseline.revision,
        operationId: randomUUID(),
        inputs: { ...inputs, departureCount: '1' }
      }
      assert.equal((await service.previewScore(scope, correction)).total, 6)
      await assert.rejects(
        service.confirm(scope, correction),
        /reason_required/
      )
      const savedCorrection = await service.saveDraft(scope, correction)
      const finalCorrection = {
        ...correction,
        revision: savedCorrection.revision,
        operationId: randomUUID()
      }
      await assert.rejects(
        service.confirm(scope, finalCorrection),
        /reason_required/
      )
      const explained = await service.confirm(scope, {
        ...finalCorrection,
        reason:
          'Corrected the manual count; fixture verifies the audit baseline.'
      })
      assert.equal(explained.assessment.total, 6)
    } finally {
      await db.getRepository(ReviewEvent).delete(scope)
      await db.getRepository(ReviewCase).delete(scope)
      await db.destroy()
    }
  }
)
