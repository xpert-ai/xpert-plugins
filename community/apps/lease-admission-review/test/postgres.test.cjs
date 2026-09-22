require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { DataSource } = require('typeorm')
const { ReviewCase, ReviewEvent } = require('../dist/lib/entities.js')
const { ReviewService } = require('../dist/lib/service.js')
const { source, fields } = require('./fixture.cjs')
test(
  'PostgreSQL confirmation, isolation, recovery and retry invariants',
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
    const scope = {
      tenantId: randomUUID(),
      organizationId: randomUUID(),
      userId: randomUUID(),
      assistantId: randomUUID()
    }
    try {
      const input = {
        title: 'Synthetic review',
        source,
        operationId: randomUUID()
      }
      const [a, b] = await Promise.all([
        service.create(scope, input),
        service.create(scope, input)
      ])
      assert.equal(a.id, b.id)
      const started = await service.start(scope, {
        id: a.id,
        revision: a.revision,
        operationId: randomUUID()
      })
      await service.failAttempt(scope, started.attemptId, 'unreadable')
      const failed = await service.detail(scope, a.id)
      assert.equal(failed.source, source)
      assert.equal(failed.status, 'failed')
      const retry = await service.start(scope, {
        id: a.id,
        revision: failed.revision,
        operationId: randomUUID()
      })
      await assert.rejects(
        service.saveCandidates(scope, started.attemptId, fields),
        /not_found/
      )
      await service.saveCandidates(scope, retry.attemptId, fields)
      const ready = await service.detail(scope, a.id)
      const corrected = fields.map((f, i) =>
        i === 0 ? { ...f, value: 'stable' } : f
      )
      await assert.rejects(
        service.confirm(scope, {
          id: a.id,
          revision: ready.revision,
          operationId: randomUUID(),
          fields: corrected,
          reason: ''
        }),
        /reason_required/
      )
      await assert.rejects(
        service.confirm(scope, {
          id: a.id,
          revision: 1,
          operationId: randomUUID(),
          fields,
          reason: ''
        }),
        /conflict/
      )
      const confirmation = {
        id: a.id,
        revision: ready.revision,
        operationId: randomUUID(),
        fields: corrected,
        reason: 'Normalized management wording after checking evidence.'
      }
      const confirmed = await service.confirm(scope, confirmation)
      assert.equal(
        (await service.confirm(scope, confirmation)).revision,
        confirmed.revision
      )
      assert.equal(
        (await new ReviewService(db).detail(scope, a.id)).confirmed[0].value,
        'stable'
      )
      assert.deepEqual(confirmed.candidates, fields)
      await assert.rejects(
        service.detail({ ...scope, userId: randomUUID() }, a.id),
        /not_found/
      )
      await assert.rejects(
        service.detail({ ...scope, organizationId: randomUUID() }, a.id),
        /not_found/
      )
      await assert.rejects(
        service.detail({ ...scope, tenantId: randomUUID() }, a.id),
        /not_found/
      )
      await assert.rejects(
        service.readAttempt(
          { ...scope, assistantId: randomUUID() },
          retry.attemptId
        ),
        /not_found/
      )
      await assert.rejects(
        service.saveCandidates(scope, retry.attemptId, corrected),
        /invalid_state/
      )
      assert.equal(
        await db
          .getRepository(ReviewEvent)
          .countBy({ ...scope, caseId: a.id, kind: 'confirmed' }),
        1
      )
      const expiring = await service.create(scope, {
        title: 'Synthetic timeout',
        source,
        operationId: randomUUID()
      })
      const overdue = await service.start(scope, {
        id: expiring.id,
        revision: expiring.revision,
        operationId: randomUUID()
      })
      // Advance only this isolated fixture's lease; never change host clocks.
      await db.getRepository(ReviewCase).update(overdue.id, {
        attemptStartedAt: new Date(Date.now() - 301000)
      })
      await assert.rejects(
        service.saveCandidates(scope, overdue.attemptId, fields),
        /invalid_state/
      )
      const expired = await service.detail(scope, overdue.id)
      assert.equal(expired.status, 'failed')
      assert.equal(expired.failureCode, 'timeout')
      assert.equal(
        (await service.detail(scope, overdue.id)).revision,
        expired.revision
      )
      const recovered = await service.start(scope, {
        id: overdue.id,
        revision: expired.revision,
        operationId: randomUUID()
      })
      assert.notEqual(recovered.attemptId, overdue.attemptId)
      await service.saveCandidates(scope, recovered.attemptId, fields)
      assert.equal((await service.detail(scope, overdue.id)).status, 'review')
    } finally {
      await db.getRepository(ReviewEvent).delete(scope)
      await db.getRepository(ReviewCase).delete(scope)
      await db.destroy()
    }
  }
)
