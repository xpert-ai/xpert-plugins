import { test } from 'node:test'
import assert from 'node:assert/strict'
import { createMysqlWorkbench, mysqlWorkbenchOptions } from '../dist/lib/mysql-workbench.js'
import { createDorisConnection } from '../dist/lib/doris-workbench.js'
const saved = { host: 'no-network.invalid', username: 'reader', password: 'saved-secret', catalog: 'original' }
test('MySQL and Doris map requested databases without changing saved credentials', async () => {
  const selected = mysqlWorkbenchOptions(saved, { database: 'reporting' })
  assert.deepEqual(selected, { ...saved, catalog: 'reporting' })
  assert.equal(saved.catalog, 'original')
  const adapters = [createMysqlWorkbench(saved, 'mysql', undefined, { database: 'reporting' }), createDorisConnection(saved, undefined, { database: 'reporting' })]
  for (const adapter of adapters) {
    await assert.rejects(adapter.query({ mode: 'read', sql: 'SELECT 1', database: 'original' }), /database_requires_new_connection/)
    await adapter.close()
  }
})
test('MySQL namespace validation happens before transport access', () => {
  assert.throws(() => mysqlWorkbenchOptions(saved, { schema: 'wrong' }), /schema/)
  assert.throws(() => mysqlWorkbenchOptions(saved, { engineCatalog: 'external' }), /external_catalog/)
})
