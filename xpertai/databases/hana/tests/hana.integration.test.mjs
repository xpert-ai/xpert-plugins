import assert from 'node:assert/strict'
import { test } from 'node:test'
import { createHanaWorkbench } from '../dist/lib/hana-workbench.js'

test('live HANA discovery, positional binding, exact values and read-only guard', {
  skip: process.env.HANA_ANALYTICS_INTEGRATION !== '1', timeout: 60000
}, async () => {
  for (const key of ['HANA_HOST', 'HANA_PORT', 'HANA_USERNAME', 'HANA_PASSWORD', 'HANA_DATABASE', 'HANA_SCHEMA']) {
    assert.ok(process.env[key], `${key} is required for explicit integration testing`)
  }
  const adapter = createHanaWorkbench({ host: process.env.HANA_HOST, port: Number(process.env.HANA_PORT),
    username: process.env.HANA_USERNAME, password: process.env.HANA_PASSWORD,
    database: process.env.HANA_DATABASE, catalog: process.env.HANA_SCHEMA })
  try {
    const schemas = await adapter.locations()
    assert.ok(schemas.some(({ schema }) => schema === process.env.HANA_SCHEMA))
    const objects = await adapter.objects({ schema: process.env.HANA_SCHEMA, pageSize: 20 })
    if (objects.items.length) assert.ok((await adapter.describe(objects.items[0])).columns.length)
    const result = await adapter.query({ mode: 'read', sql: `SELECT CAST(? AS NVARCHAR(100)) AS "label",
      CAST('12345678901234567890.12345' AS DECIMAL(30,5)) AS "amount",
      CAST('9007199254740993' AS BIGINT) AS "count" FROM DUMMY`, parameters: ["x' OR 1=1 --"], limit: 10, timeoutMs: 10000 })
    assert.deepEqual(result.rows, [["x' OR 1=1 --", '12345678901234567890.12345', '9007199254740993']])
    const empty = await adapter.query({ mode: 'read', sql: 'SELECT 1 AS "empty" FROM DUMMY WHERE 1 = 0' })
    assert.equal(empty.columns[0].name, 'empty')
    assert.equal(empty.rows.length, 0)
    await assert.rejects(adapter.query({ mode: 'read', sql: 'CALL NO_SUCH_PROCEDURE()' }), /READ_ONLY/)
  } finally { await adapter.close() }
})
