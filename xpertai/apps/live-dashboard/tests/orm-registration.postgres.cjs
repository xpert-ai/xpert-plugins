const assert = require('node:assert/strict')
const { randomUUID } = require('node:crypto')
const { test } = require('node:test')
const { Module } = require('@nestjs/common')
const { NestFactory } = require('@nestjs/core')
const { TypeOrmModule, getRepositoryToken } = require('@nestjs/typeorm')
const { DataSource } = require('typeorm')
const plugin = require('../index.cjs')
const { AnalysisEvidenceRecord } = require('../dist/lib/evidence/evidence.entity.js')

const url = process.env.LIVE_DASHBOARD_LIBRARY_TEST_DATABASE_URL

test('the host DataSource supplies the repositories declared by Live Dashboard', { skip: !url }, async () => {
  const schema = 'orm_registration_' + randomUUID().replaceAll('-', '')
  const connection = await new DataSource({ type: 'postgres', url }).initialize()
  try {
    await connection.query(`CREATE SCHEMA "${schema}"`)
    const registration = plugin.register({ config: {} }).module
    const entities = Reflect.getMetadata('entities', registration)
    assert.ok(entities.includes(AnalysisEvidenceRecord))

    class TestHost {}
    Module({
      imports: [
        TypeOrmModule.forRoot({ type: 'postgres', url, schema, entities, synchronize: true, retryAttempts: 1 }),
        ...Reflect.getMetadata('imports', registration)
      ]
    })(TestHost)
    const app = await NestFactory.createApplicationContext(TestHost, { logger: false, abortOnError: false })
    try {
      const host = app.get(DataSource)
      for (const entity of entities) {
        assert.equal(app.get(getRepositoryToken(entity)).metadata, host.getMetadata(entity))
      }
      const evidence = app.get(getRepositoryToken(AnalysisEvidenceRecord))
      const record = await evidence.save({
        tenantId: randomUUID(), organizationId: randomUUID(), projectId: randomUUID(), createdById: randomUUID(),
        requestId: randomUUID(), requestHash: 'a'.repeat(64), snapshot: { title: 'host ORM smoke test' }
      })
      assert.deepEqual((await evidence.findOneByOrFail({ id: record.id })).snapshot, record.snapshot)
    } finally {
      await app.close()
    }
  } finally {
    try {
      await connection.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`)
    } finally {
      await connection.destroy()
    }
  }
})
