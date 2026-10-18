const { test } = require('node:test')
const assert = require('node:assert/strict')
const { pathToFileURL } = require('node:url')
const { readFileSync } = require('node:fs')
const { MysqlAnalyticsProvider, DorisAnalyticsProvider } = require('../dist/lib/provider')
const { normalizeAnalyticsResult } = require('@xpert-ai/plugin-sdk/analytics')

// Private config: { adapterModule: absolute built driver module, sources: [{ engine, options }] }.
// Create analytics_acceptance.orders using the documented fixture before running; use SELECT-only credentials.
test('real MySQL and Doris: discovery, exact cells, nullable filters, injection-as-data, empty and partial results, rejected writes', { skip: !process.env.XPERT_MYSQL_ANALYTICS_TEST_CONFIG }, async (t) => {
  const config = JSON.parse(readFileSync(process.env.XPERT_MYSQL_ANALYTICS_TEST_CONFIG, 'utf8'))
  const { createMysqlWorkbench } = await import(pathToFileURL(config.adapterModule).href)
  for (const source of config.sources) await t.test(source.engine, async () => {
    const Provider = source.engine === 'mysql' ? MysqlAnalyticsProvider : DorisAnalyticsProvider
    const provider = new Provider({ require: () => ({ open: async ({ location }) => createMysqlWorkbench({ ...source.options, ...(location?.database ? { catalog: location.database } : {}) }, source.engine) }) })
    const context = () => ({ actor: {}, dataSourceId: 'test', maxRows: 100, timeoutMs: 10000, deadlineAt: Date.now() + 10000, signal: new AbortController().signal })
    const binding = { id: 'monthly_sales', providerId: `${source.engine}.sql`, payload: {
      location: { database: 'analytics_acceptance' }, parameterOrder: ['region', 'region'],
      sql: "SELECT DATE_FORMAT(ordered_at, '%Y-%m') AS month,region,SUM(paid_amount-refund_amount) AS net,COUNT(*) AS orders FROM orders WHERE status='paid' AND ordered_at>='2026-07-01' AND ordered_at<'2026-10-01' AND (? IS NULL OR region=?) GROUP BY DATE_FORMAT(ordered_at, '%Y-%m'),region ORDER BY month,region"
    }, output: { datasetId: 'sales', grain: ['month','region'], fields: [
      { id: 'month', sourceField: 'month', logicalType: 'string', nullable: false },
      { id: 'region', sourceField: 'region', logicalType: 'string', nullable: false },
      { id: 'net', sourceField: 'net', logicalType: 'decimal', nullable: false },
      { id: 'orders', sourceField: 'orders', logicalType: 'int64', nullable: false }
    ] } }
    const databases = await provider.discover({}, context())
    const db = databases.items.find((item) => item.name === 'analytics_acceptance')
    assert.ok(db)
    const catalog = await provider.discover(db.inspectRequest, context())
    const orders = catalog.items.find((item) => item.name === 'orders')
    assert.ok(orders)
    const inspect = await provider.discover(orders.inspectRequest, context())
    assert.match(inspect.items[0].metadata.columns.find((item) => item.name === 'paid_amount').description, /CNY/)
    if (source.engine === 'doris') assert.equal(inspect.items[0].metadata.tableModel, 'duplicate')
    const all = normalizeAnalyticsResult(binding, await provider.execute(binding, { region: null }, context()), 'all', 100)
    assert.equal(all.rows.length, 6); assert.equal(all.completeness.scope, 'full_query_result')
    assert.equal(all.rows.reduce((sum, row) => sum + Number(row.net), 0), 5700)
    assert.ok(all.rows.every((row) => typeof row.net === 'string' && row.orders === '1'))
    const west = normalizeAnalyticsResult(binding, await provider.execute(binding, { region: 'west' }, context()), 'west', 100)
    assert.equal(west.rows.length, 3); assert.equal(west.rows.reduce((sum,row) => sum + Number(row.net), 0), 2200)
    assert.deepEqual((await provider.execute(binding, { region: "west' OR 1=1 --" }, context())).rows, [])
    const page = await provider.execute(binding, { region: null }, { ...context(), maxRows: 2 })
    assert.equal(page.rows.length, 2); assert.equal(page.completeness.truncated, true); assert.equal(page.completeness.totalAccuracy, 'unknown')
    for (const sql of ['DELETE FROM orders', 'SELECT 1; DELETE FROM orders', "SELECT 1 INTO OUTFILE '/tmp/forbidden'", "SELECT LOAD_FILE('/etc/passwd')", 'SELECT SLEEP(5)', 'SELECT @a := 1', 'SELECT * FROM orders FOR UPDATE'])
      await assert.rejects(provider.execute({ ...binding, payload: { sql, parameterOrder: [] } }, {}, context()))
    const exact = { ...binding, payload: { sql: "SELECT CAST('9007199254740993.12' AS DECIMAL(20,2)) AS net, CAST('9007199254740993' AS BIGINT) AS orders", parameterOrder: [] }, output: { datasetId: 'precision', grain: [], fields: binding.output.fields.slice(2) } }
    // MySQL uses SIGNED instead of BIGINT in CAST.
    if (source.engine === 'mysql') exact.payload.sql = exact.payload.sql.replace('AS BIGINT', 'AS SIGNED')
    const precision = normalizeAnalyticsResult(exact, await provider.execute(exact, {}, context()), 'precision', 10)
    assert.deepEqual(precision.rows, [{ net: '9007199254740993.12', orders: '9007199254740993' }])
    const again = await provider.execute(binding, { region: 'west' }, context())
    assert.equal(again.rows.length, 3)
  })
})
