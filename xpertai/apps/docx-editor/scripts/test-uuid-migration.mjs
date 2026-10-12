import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { randomUUID } from 'node:crypto'
import { afterEach, beforeEach, test } from 'node:test'

// Use the PostgreSQL driver already required by this plugin's TypeORM peer.
const require = createRequire(import.meta.url)
const { Client } = createRequire(require.resolve('typeorm'))('pg')
const connectionString = process.env.XPERT_SCHEMA_TEST_DATABASE_URL
if (!connectionString) throw new Error('Set XPERT_SCHEMA_TEST_DATABASE_URL to run PostgreSQL migration tests.')
const migration = await readFile(new URL('../migrations/20261012-uuid-references.sql', import.meta.url), 'utf8')
const tables = ['document', 'operation', 'snapshot', 'version'].map((name) => `plugin_docx_editor_${name}`)
let client
let schema

beforeEach(async () => {
  client = new Client({ connectionString })
  await client.connect()
  schema = `docx_uuid_test_${randomUUID().replaceAll('-', '')}`
  await client.query(`CREATE SCHEMA "${schema}"`)
  await client.query(`SET search_path TO "${schema}"`)
  for (const name of tables) {
    await client.query(`CREATE TABLE "${name}" (id uuid PRIMARY KEY, "projectId" varchar,
      ${name.endsWith('_document') ? '' : '"documentId" varchar NOT NULL,'} payload jsonb NOT NULL)`)
  }
  await client.query('CREATE UNIQUE INDEX project_reference ON plugin_docx_editor_document ("projectId")')
  await client.query('ALTER TABLE plugin_docx_editor_version ADD CONSTRAINT version_project_fk FOREIGN KEY ("projectId") REFERENCES plugin_docx_editor_document ("projectId") ON DELETE CASCADE DEFERRABLE INITIALLY DEFERRED')
  const documentId = randomUUID()
  const projectId = randomUUID()
  await client.query('INSERT INTO plugin_docx_editor_document VALUES ($1, $2, $3)', [documentId, projectId, { title: '保留正文与引用' }])
  for (const table of tables.slice(1)) {
    for (let index = 0; index < 28; index++) {
      await client.query(`INSERT INTO "${table}" VALUES ($1, $2, $3, $4)`,
        [randomUUID(), index % 2 ? null : projectId, documentId, { content: `版本 ${index}`, comments: ['保留'] }])
    }
  }
})

afterEach(async () => {
  if (client) {
    if (schema) await client.query(`DROP SCHEMA "${schema}" CASCADE`)
    await client.end()
  }
})

async function snapshot() {
  const result = {}
  for (const table of tables) result[table] = (await client.query(`SELECT * FROM "${table}" ORDER BY id`)).rows
  return result
}

async function columns() {
  return (await client.query(`SELECT table_name, column_name, udt_name, is_nullable
    FROM information_schema.columns WHERE table_schema = $1
      AND column_name IN ('projectId', 'documentId') ORDER BY table_name, column_name`, [schema])).rows
}

test('preserves every row, nullable references, indexes and foreign keys; repeat is a no-op', async () => {
  const before = await snapshot()
  const foreignKey = (await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'version_project_fk' AND connamespace = $1::regnamespace", [schema])).rows
  const beforeColumns = await columns()
  await client.query(migration)
  await client.query(migration)
  assert.deepEqual(await snapshot(), before)
  assert.equal((await columns()).length, 7)
  assert.ok((await columns()).every((column) => column.udt_name === 'uuid'))
  assert.deepEqual((await columns()).map((column) => column.is_nullable), beforeColumns.map((column) => column.is_nullable))
  assert.deepEqual((await client.query("SELECT pg_get_constraintdef(oid) AS definition FROM pg_constraint WHERE conname = 'version_project_fk' AND connamespace = $1::regnamespace", [schema])).rows, foreignKey)
  assert.equal((await client.query("SELECT count(*)::int AS count FROM pg_indexes WHERE schemaname = $1 AND indexname = 'project_reference'", [schema])).rows[0].count, 1)
})

test('invalid identifiers abort without changing data or any column type', async () => {
  await client.query('UPDATE plugin_docx_editor_version SET "documentId" = $1', ['invalid-uuid'])
  const before = await snapshot()
  const beforeColumns = await columns()
  await assert.rejects(client.query(migration), /Invalid UUID values in plugin_docx_editor_version.documentId/)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await columns(), beforeColumns)
})

test('rejects external inbound constraints without modifying another plugin', async () => {
  await client.query('CREATE TABLE plugin_other_reference ("projectId" varchar REFERENCES plugin_docx_editor_document ("projectId"))')
  const before = await snapshot()
  const beforeColumns = await columns()
  await assert.rejects(client.query(migration), /External foreign key/)
  assert.deepEqual(await snapshot(), before)
  assert.deepEqual(await columns(), beforeColumns)
})

test('supports partially migrated installations', async () => {
  await client.query('ALTER TABLE plugin_docx_editor_version ALTER COLUMN "documentId" TYPE uuid USING "documentId"::uuid')
  const before = await snapshot()
  await client.query(migration)
  assert.deepEqual(await snapshot(), before)
  assert.ok((await columns()).every((column) => column.udt_name === 'uuid'))
})
