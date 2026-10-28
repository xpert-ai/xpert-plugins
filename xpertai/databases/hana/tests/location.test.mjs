import { test } from 'node:test'
import assert from 'node:assert/strict'
import { hanaWorkbenchOptions } from '../dist/lib/hana-workbench.js'
const saved = { host: 'no-network.invalid', username: 'reader', password: 'saved-secret', database: 'TENANT', catalog: 'original' }
test('HANA owns schema mapping and keeps the saved tenant boundary', () => {
  assert.deepEqual(hanaWorkbenchOptions(saved, { database: 'TENANT', schema: 'SALES' }), { ...saved, catalog: 'SALES' })
  assert.equal(saved.catalog, 'original')
  assert.throws(() => hanaWorkbenchOptions(saved, { database: 'OTHER' }), /HANA_DATABASE_SWITCH_DENIED/)
  assert.throws(() => hanaWorkbenchOptions(saved, { engineCatalog: 'internal' }), /HANA_EXTERNAL_CATALOG_UNSUPPORTED/)
  assert.throws(() => hanaWorkbenchOptions(saved, { schema: 'bad\nschema' }), /IDENTIFIER/)
})
