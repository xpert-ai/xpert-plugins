const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { PostgresAnalyticsProvider } = require('../dist/lib/provider.js')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')

// Opt in with a built @xpert-ai/plugin-postgres postgres-workbench.js and standard PG* environment variables.
test('real PostgreSQL: typed Dataset, bound filter, truncation and read-only execution', { skip: !process.env.XPERT_POSTGRES_ADAPTER_MODULE }, async () => {
  const { createPostgresWorkbench } = await import(pathToFileURL(process.env.XPERT_POSTGRES_ADAPTER_MODULE).href)
  const provider = new PostgresAnalyticsProvider({ require: () => ({ open: async () => createPostgresWorkbench({}) }) })
  const context = { actor: {}, dataSourceId: 'integration', maxRows: 2, timeoutMs: 10000, signal: new AbortController().signal }
  const binding = { id: 'sales', providerId: 'postgres.sql', payload: { sql: "SELECT region, amount::double precision AS amount FROM (SELECT 'east' AS region,120 AS amount UNION ALL SELECT 'west',80) AS sales WHERE $1 = 'all' OR region = $1 ORDER BY region", parameterOrder: ['region'] },
    output: { datasetId: 'sales', grain: ['region'], fields: [
      { id: 'region', sourceField: 'region', label: 'Region', logicalType: 'string', nullable: false, role: 'dimension' },
      { id: 'amount', sourceField: 'amount', label: 'Amount', logicalType: 'float64', nullable: false, role: 'measure' }
    ] } }
  const all = normalizeAnalyticsResult(binding, await provider.execute(binding, { region: 'all' }, context), 'all', 2)
  assert.deepEqual(all.rows, [{ region: 'east', amount: 120 }, { region: 'west', amount: 80 }])
  assert.equal(all.completeness.truncated, false)
  const filtered = await provider.execute(binding, { region: 'west' }, context)
  assert.deepEqual(filtered.rows, [{ region: 'west', amount: 80 }])
  assert.deepEqual((await provider.execute(binding, { region: "east' OR 1=1 --" }, context)).rows, [])
  const page = await provider.execute(binding, { region: 'all' }, { ...context, maxRows: 1 })
  assert.equal(page.rows.length, 1); assert.equal(page.completeness.truncated, true); assert.equal(page.completeness.scope, 'page')
  await assert.rejects(provider.execute({ ...binding, payload: { sql: 'CREATE TABLE live_dashboard_forbidden (id int)', parameterOrder: [] } }, {}, context))
  const began = Date.now()
  await assert.rejects(provider.execute({ ...binding, payload: { sql: 'SELECT $1 IS NULL AS missing_type', parameterOrder: ['region'] } }, { region: null }, context), /POSTGRES_PARAMETER_TYPE_REQUIRED/)
  assert.ok(Date.now() - began < 3000, 'PostgreSQL SQLSTATE errors must not stall until the 30-second query timeout')
  const afterError = await provider.execute(binding, { region: 'west' }, context)
  assert.deepEqual(afterError.rows, [{ region: 'west', amount: 80 }])
})
