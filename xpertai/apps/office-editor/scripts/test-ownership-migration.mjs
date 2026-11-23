import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

const require = createRequire(import.meta.url)
const { Client } = createRequire(require.resolve('typeorm'))('pg')
const connectionString = process.env.XPERT_SCHEMA_TEST_DATABASE_URL
if (!connectionString) throw new Error('Set XPERT_SCHEMA_TEST_DATABASE_URL for an isolated PostgreSQL migration test.')
const migration = await readFile(new URL('../migrations/20261112-workbook-write-ownership.sql', import.meta.url), 'utf8')
let client, schema
beforeEach(async () => {
  client = new Client({ connectionString }); await client.connect()
  schema = `office_ownership_test_${randomUUID().replaceAll('-', '')}`
  await client.query(`CREATE SCHEMA "${schema}"`)
  await client.query(`SET search_path TO "${schema}"`)
  await client.query(`CREATE TABLE content_resource_entry (id uuid PRIMARY KEY, "providerKey" text,
    "resourceId" text, "projectId" uuid, "typeId" text, "modelId" text, "offlineSnapshot" jsonb, deleted boolean)`)
})
afterEach(async () => {
  if (client) {
    if (schema) await client.query(`DROP SCHEMA "${schema}" CASCADE`)
    await client.end()
  }
})
async function seed(deleted = false) {
  const id = randomUUID(), resourceId = randomUUID(), projectId = randomUUID()
  const root = `.xpert/spreadsheets/${resourceId}`
  const snapshot = { typeId: 'xpert.spreadsheet', modelId: 'office-editor.univer-workbook', projectId,
    title: '保留名称', revision: '18', source: { kind: 'bundle', rootPath: root, entryPath: '18.json' },
    containedPaths: [{ path: root, recursive: true }], deleted }
  await client.query('INSERT INTO content_resource_entry VALUES ($1,$2,$3,$4,$5,$6,$7,$8)',
    [id, 'office-editor.workbooks', resourceId, projectId, snapshot.typeId, snapshot.modelId, snapshot, deleted])
  return id
}
const rows = async () => (await client.query('SELECT * FROM content_resource_entry ORDER BY id')).rows
test('backfills active and archived workbooks, preserves all other data and is idempotent', async () => {
  await seed(); await seed(true)
  const generic = await seed()
  await client.query('UPDATE content_resource_entry SET "providerKey" = $1 WHERE id = $2', ['other.provider', generic])
  const before = await rows()
  await client.query(migration); await client.query(migration)
  assert.deepEqual(await rows(), before.map(row => row.id === generic ? row :
    { ...row, offlineSnapshot: { ...row.offlineSnapshot, writeOwnership: 'provider' } }))
})
test('invalid legacy metadata aborts the entire migration without a partial backfill', async () => {
  await seed(); const bad = await seed()
  await client.query('UPDATE content_resource_entry SET "offlineSnapshot" = NULL WHERE id = $1', [bad])
  const before = await rows()
  await assert.rejects(client.query(migration), /requires provider refresh/)
  assert.deepEqual(await rows(), before)
})
test('incorrect ownership boundaries and project scopes fail closed', async () => {
  const bad = await seed()
  const before = await rows()
  for (const field of ['projectId', 'containedPaths', 'source']) {
    await client.query('UPDATE content_resource_entry SET "offlineSnapshot" = $1 WHERE id = $2',
      [{ ...before[0].offlineSnapshot, [field]: null }, bad])
    await assert.rejects(client.query(migration), /requires provider refresh/)
    assert.equal((await rows())[0].offlineSnapshot.writeOwnership, undefined)
  }
})
