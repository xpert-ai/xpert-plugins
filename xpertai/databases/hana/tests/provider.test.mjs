import 'reflect-metadata'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { HanaAnalyticsProvider } from '../dist/lib/hana-analytics.provider.js'
import { HANAPlugin } from '../dist/lib/hana.module.js'
import { HANAAdapter } from '../dist/lib/hana.js'

const actor = { tenantId: 'tenant', organizationId: 'org', userId: 'reader' }
const context = (overrides = {}) => ({ actor, source: { kind: 'data-source', dataSourceId: 'authorized-source' },
  options: {}, signal: new AbortController().signal, deadlineAt: Date.now() + 5000, timeoutMs: 5000, maxRows: 100, ...overrides })
const binding = (overrides = {}) => ({ id: 'sales', source: { kind: 'data-source', dataSourceId: 'untrusted-input-source' },
  providerId: 'hana.sql', operation: 'query', contractVersion: 1,
  payload: { sql: 'SELECT ? AS "amount", ? AS "region" FROM DUMMY', parameterOrder: ['region', 'region'], location: { schema: 'SALES' } },
  output: { datasetId: 'sales', fields: [{ id: 'amount', sourceField: 'amount', logicalType: 'decimal' }] }, ...overrides })
function fixture(overrides = {}) {
  const calls = [], adapter = { engine: 'hana', query: async (query, signal) => {
    calls.push({ query, signal })
    return { columns: [{ name: 'amount', dataType: 'DECIMAL' }], rows: [['12345678901234567890.125']],
      outcome: 'succeeded', hasMore: false, truncated: false }
  }, locations: async () => [{ database: 'TENANT', schema: 'SALES' }],
  objects: async () => ({ items: [{ name: 'Orders', kind: 'table' }], hasMore: false }),
  describe: async (object) => ({ object, columns: [{ name: 'Amount', dataType: 'DECIMAL(18,4)', comment: 'Net sales', nullable: false }], diagnostics: [] }),
  close: async () => { calls.push({ closed: true }) }, ...overrides }
  const provider = new HanaAnalyticsProvider({ require: (capability) => {
    assert.equal(capability.id, 'platform.datasource.workbench')
    return { open: async (scope) => { calls.push({ scope }); return adapter } }
  } })
  return { provider, adapter, calls }
}
test('provider opens the trusted actor/source and forwards repeated parameters without interpolation', async () => {
  const { provider, calls } = fixture(), ctx = context()
  const result = await provider.execute(binding(), { region: null }, ctx)
  assert.deepEqual(calls[0].scope, { actor, dataSourceId: 'authorized-source', location: { schema: 'SALES' } })
  assert.deepEqual(calls[1].query.parameters, [null, null])
  assert.equal(calls[1].query.mode, 'read')
  assert.equal(calls[1].signal, ctx.signal)
  assert.equal(result.rows[0].amount, '12345678901234567890.125')
  assert.equal(result.completeness.totalAccuracy, 'exact')
  assert.ok(calls.at(-1).closed)
})
test('unsupported payload, write SQL and undeclared parameters fail before opening the runtime', async () => {
  const { provider, calls } = fixture()
  for (const payload of [
    { sql: 'SELECT 1 FROM DUMMY', parameterOrder: [], credentials: {} },
    { sql: 'DELETE FROM t', parameterOrder: [] }, { sql: 'SELECT ? FROM DUMMY', parameterOrder: [] }
  ]) await assert.rejects(provider.execute(binding({ payload }), {}, context()))
  await assert.rejects(provider.execute(binding(), { other: 'x' }, context()))
  assert.equal(calls.length, 0)
})
test('wrong engines and native errors still close the scoped runner', async () => {
  for (const overrides of [{ engine: 'mysql' }, { query: async () => { throw new Error('QUERY_FAILED') } }]) {
    const { provider, calls } = fixture(overrides)
    await assert.rejects(provider.execute(binding(), { region: 'east' }, context()))
    assert.ok(calls.at(-1).closed)
  }
})
test('truncation is explicit, duplicate aliases and partial results fail closed', async () => {
  for (const result of [
    { columns: [{ name: 'v' }], rows: [['1']], outcome: 'succeeded', truncated: true, hasMore: true },
    { columns: [{ name: 'v' }, { name: 'v' }], rows: [[1, 2]], outcome: 'succeeded' },
    { columns: [{ name: 'v' }], rows: [], outcome: 'failed' },
    { columns: [{ name: 'v' }], rows: [[1, 2]], outcome: 'succeeded' }
  ]) {
    const { provider, calls } = fixture({ query: async () => result })
    if (result.truncated) {
      const value = await provider.execute(binding(), { region: null }, context())
      assert.equal(value.completeness.totalAccuracy, 'unknown')
      assert.equal(value.completeness.scope, 'page')
      assert.equal(value.completeness.totalRows, undefined)
    } else await assert.rejects(provider.execute(binding(), { region: null }, context()))
    assert.ok(calls.at(-1).closed)
  }
})
test('schema discovery leads to catalog and inspection with the query contract on every step', async () => {
  const { provider, calls } = fixture()
  const schemas = await provider.discover({}, context())
  const catalog = await provider.discover(schemas.items[0].inspectRequest, context())
  const detail = await provider.discover(catalog.items[0].inspectRequest, context())
  assert.equal(detail.items[0].metadata.columns[0].description, 'Net sales')
  for (const result of [schemas, catalog, detail]) assert.equal(result.queryContract.operation, 'query')
  assert.equal(calls.filter((call) => call.closed).length, 3)
})
test('cancelled and expired calls do not open; a hanging discovery is bounded by the invocation deadline', async () => {
  const { provider, calls } = fixture({ locations: () => new Promise(() => {}) })
  await assert.rejects(provider.discover({}, context({ signal: AbortSignal.abort() })))
  await assert.rejects(provider.discover({}, context({ deadlineAt: Date.now() - 1 })))
  assert.equal(calls.length, 0)
  await assert.rejects(provider.discover({}, context({ timeoutMs: 10 })), /HANA_DEADLINE_EXCEEDED/)
  assert.ok(calls.at(-1).closed)
})
test('HANA module registers its analytics provider and its driver supplies a dedicated workbench', async () => {
  // The Nest plugin decorator writes the ordinary providers metadata.
  assert.ok(Reflect.getMetadata('providers', HANAPlugin).includes(HanaAnalyticsProvider))
  const driver = new HANAAdapter({ host: 'localhost', port: 1, username: 'test', password: '', database: 'TEST' })
  const adapter = driver.getWorkbenchAdapter()
  assert.equal(adapter.engine, 'hana')
  assert.equal(driver.getWorkbenchAdapter(), adapter)
  assert.equal((await adapter.capabilities()).nativeReadOnly, true)
  await driver.teardown()
})
