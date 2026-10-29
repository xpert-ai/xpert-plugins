import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createPostgresWorkbench, postgresWorkbenchConfig } from '../dist/lib/postgres-workbench.js'
const saved = { host: 'no-network.invalid', user: 'reader', password: 'saved-secret', database: 'original' }
test('PostgreSQL owns database/schema selection and preserves saved credentials', async () => {
  assert.deepEqual(postgresWorkbenchConfig(saved, 'public', { database: 'reporting', schema: 'sales' }), { config: { ...saved, database: 'reporting' }, schema: 'sales' })
  assert.equal(saved.database, 'original')
  const adapter = createPostgresWorkbench(saved, 'public', { database: 'reporting', schema: 'sales' })
  await assert.rejects(adapter.query({ mode: 'read', sql: 'SELECT 1', database: 'original' }), /database_requires_new_connection/)
  await assert.rejects(adapter.query({ mode: 'read', sql: 'SELECT 1', schema: 'public' }), /schema_requires_new_connection/)
  await adapter.close()
  assert.throws(() => postgresWorkbenchConfig(saved, 'public', { engineCatalog: 'external' }), /external_catalog/)
})
