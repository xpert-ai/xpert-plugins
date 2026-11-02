import test from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { createRequire } from 'node:module'
const require = createRequire(import.meta.url)
// This suite uses a disposable schema, never synchronize an existing application schema.
test(
  'PostgreSQL: scope isolation, concurrency, retries, and reload',
  { skip: !process.env.PAYMENT_TEST_DATABASE_URL },
  async (t) => {
    require('reflect-metadata')
    const { DataSource } = require('typeorm')
    const { PaymentCase } = require('../dist/lib/payment.entity.js')
    const { PaymentService } = require('../dist/lib/payment.service.js')
    const schema = 'payment_test_' + randomUUID().replaceAll('-', '')
    const admin = new DataSource({ type: 'postgres', url: process.env.PAYMENT_TEST_DATABASE_URL })
    await admin.initialize()
    await admin.query(`CREATE SCHEMA "${schema}"`)
    const options = {
      type: 'postgres',
      url: process.env.PAYMENT_TEST_DATABASE_URL,
      schema,
      entities: [PaymentCase],
      synchronize: true
    }
    let db = new DataSource(options)
    try {
      await db.initialize()
      let service = new PaymentService(db.getRepository(PaymentCase))
      const scope = {
        tenantId: 'test-tenant',
        organizationId: 'test-org',
        userId: 'test-user',
        assistantId: 'test-assistant'
      }
      const input = {
        customerName: 'Scope %_ sample',
        invoiceNumber: 'AR-1',
        outstandingCents: 5000000,
        dueDate: '2026-10-25',
        communicationDate: '2026-10-31',
        source: '客户：11月6日付三万元。\n客户：余款日期待定。'
      }
      const key = randomUUID()
      const [record, duplicate] = await Promise.all([
        service.create(scope, input, key),
        service.create(scope, input, key)
      ])
      await t.test('concurrent duplicate creation produces one row', async () => {
        assert.equal(record.id, duplicate.id)
        assert.equal((await service.list(scope)).total, 1)
      })
      await t.test('same request key with different input fails', async () =>
        assert.rejects(service.create(scope, { ...input, invoiceNumber: 'changed' }, key), {
          code: 'request_key_conflict'
        })
      )
      await t.test('all four scope dimensions prevent read, write and list leakage', async () => {
        for (const field of Object.keys(scope)) {
          const foreign = { ...scope, [field]: 'other' }
          assert.equal((await service.list(foreign)).total, 0)
          await assert.rejects(service.read(foreign, record.id), { code: 'not_found' })
          await assert.rejects(service.start(foreign, record.id, 0), { code: 'not_found' })
        }
      })
      await t.test('search treats percent and underscore literally', async () => {
        assert.equal((await service.list(scope, 1, '%_')).total, 1)
        assert.equal((await service.list(scope, 1, 'missing%')).total, 0)
      })
      let started
      await t.test('row locks allow exactly one concurrent start', async () => {
        const results = await Promise.allSettled([
          service.start(scope, record.id, 0),
          service.start(scope, record.id, 0)
        ])
        assert.equal(results.filter((r) => r.status === 'fulfilled').length, 1)
        started = results.find((r) => r.status === 'fulfilled').value
      })
      await t.test('model exception persists failure and preserves original input before retry', async () => {
        const { PaymentMiddleware } = require('../dist/lib/payment.middleware.js')
        const middleware = new PaymentMiddleware(service).createMiddleware({}, { ...scope, xpertId: scope.assistantId })
        const failure = new Error('controlled HTTP 503')
        await assert.rejects(middleware.wrapModelCall({ runtime: { configurable: { context: {
          paymentFollowup: { recordId: record.id, attemptId: started.attemptId }
        } } } }, async () => { throw failure }), (error) => error === failure)
        const persisted = await db.getRepository(PaymentCase).findOneByOrFail({id:record.id})
        assert.equal(persisted.state.status, 'failed')
        assert.equal(persisted.state.error, 'model_failed')
        assert.deepEqual(persisted.state.input, input)
        assert.equal(persisted.state.attempts.length, 1)
      })
      const retry = await service.start(scope, record.id, 2)
      const analysis = {
        summary: '先付三万',
        promises: [{ amountCents: 3000000, paymentDate: '2026-11-06', condition: '', evidenceLineIds: [1] }],
        blockers: [],
        questions: ['余款日期？'],
        suggestedAction: '确认余款'
      }
      await t.test('late result from previous attempt is rejected', async () =>
        assert.rejects(service.submit(scope, record.id, started.attemptId, analysis), { code: 'stale_attempt' })
      )
      const reviewed = await service.submit(scope, record.id, retry.attemptId, analysis)
      const confirmed = await service.confirm(scope, record.id, reviewed.revision, {
        analysis,
        nextFollowupDate: '2026-11-02',
        note: '核对完成'
      })
      await t.test('a new database connection reloads confirmed state', async () => {
        await db.destroy()
        db = new DataSource({ ...options, synchronize: false })
        await db.initialize()
        service = new PaymentService(db.getRepository(PaymentCase))
        assert.deepEqual(await service.read(scope, record.id), confirmed)
      })
      await t.test('expired attempt is persisted on next read', async () => {
        const other = await service.create(scope, input, randomUUID())
        const running = await service.start(scope, other.id, 0)
        const row = await db.getRepository(PaymentCase).findOneByOrFail({ id: other.id })
        row.state.attempts[0].startedAt = '2000-01-01T00:00:00Z'
        await db.getRepository(PaymentCase).save(row)
        const expired = await service.read(scope, other.id)
        assert.equal(expired.status, 'failed')
        assert.equal(expired.error, 'analysis_timeout')
        assert.deepEqual(expired.input, input)
        assert.equal(
          (await service.submit(scope, other.id, running.attemptId, analysis).catch((e) => e)).code,
          'invalid_state'
        )
      })
    } finally {
      if (db.isInitialized) await db.destroy()
      await admin.query(`DROP SCHEMA "${schema}" CASCADE`)
      await admin.destroy()
    }
  }
)
