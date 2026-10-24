const { test } = require('node:test')
const assert = require('node:assert/strict')
const { dashboardSchema } = require('../dist/lib/dashboard.schema.js')
const { toDataAnalyticsPayload } = require('../dist/lib/renderer.js')
const { createdDashboard } = require('../dist/lib/dashboard-receipt.js')
const manifest = { schema: 'xpert.live-dashboard', id: '11111111-1111-4111-8111-111111111111', title: 'Sales', controls: [],
  bindings: [{ id: 'sales', source: { kind: 'data-source', dataSourceId: '22222222-2222-4222-8222-222222222222' }, providerId: 'test', operation: 'query', contractVersion: 1, payload: {}, parameters: [],
    output: { datasetId: 'sales', grain: ['region'], fields: [
      { id: 'region', sourceField: 'region', label: 'Region', logicalType: 'string', nullable: false, role: 'dimension' },
      { id: 'sales', sourceField: 'sales', label: 'Sales', logicalType: 'decimal', nullable: false, role: 'measure' }
    ] } }], charts: [{ id: 'sales', title: 'Sales', type: 'bar', datasetId: 'sales', x: 'region', y: 'sales' }], tables: [] }
test('binds stable Dataset fields into the existing Data Analytics encodings/snapshot shape', () => {
  const dataset = { datasetId: 'sales', fields: manifest.bindings[0].output.fields, rows: [{ region: 'east', sales: '12.50' }], completeness: { truncated: false } }
  const payload = toDataAnalyticsPayload(dashboardSchema.parse(manifest), [dataset])
  assert.deepEqual(payload.manifest.charts[0].encodings, { x: { field: 'region' }, y: { field: 'sales' } })
  assert.deepEqual(payload.snapshot.datasets['__plot.sales'], [{ region: 'east', sales: 12.5 }])
  assert.deepEqual(payload.snapshot.datasets.sales, [{ region: 'east', sales: '12.50' }])
  assert.deepEqual(dataset.rows, [{ region: 'east', sales: '12.50' }])
  dataset.rows[0].sales = '9007199254740993.12'
  assert.throws(() => toDataAnalyticsPayload(manifest, [dataset]), /PRECISION/)
})
test('rejects unknown fields, duplicate datasets and incompatible control types before save', () => {
  const wrong = structuredClone(manifest); wrong.charts[0].y = 'undeclared'
  assert.equal(dashboardSchema.safeParse(wrong).success, false)
  wrong.charts = []; wrong.tables = [{ id: 'table', title: 'Table', datasetId: 'sales', fields: ['region'] }]; wrong.bindings.push(wrong.bindings[0])
  assert.equal(dashboardSchema.safeParse(wrong).success, false)
})
test('rejects misleading charts that omit a grouping dimension instead of aggregating it', () => {
  const grouped = structuredClone(manifest)
  grouped.bindings[0].output.grain.push('month')
  grouped.bindings[0].output.fields.push({ id: 'month', sourceField: 'month', label: 'Month', logicalType: 'string', nullable: false, role: 'dimension' })
  grouped.charts[0].x = 'month'
  for (const type of ['bar', 'line', 'area', 'pie']) {
    grouped.charts[0].type = type
    assert.match(dashboardSchema.safeParse(grouped).error.message, /every Dataset grain dimension/)
  }
  grouped.charts[0].type = 'line'
  grouped.charts[0].color = 'region'
  assert.equal(dashboardSchema.safeParse(grouped).success, true)
})
test('optional null controls match platform parameter resolution without weakening required or scalar restrictions', () => {
  const { resolveAnalyticsParameters } = require('@xpert-ai/plugin-sdk/analytics')
  const candidate = structuredClone(manifest)
  const parameter = { name: 'region', controlId: 'region', type: 'string', required: false, defaultValue: null, allowedValues: ['east', 'west'] }
  candidate.bindings[0].parameters = [parameter]
  candidate.controls = [{ controlId: 'region', type: 'string', label: 'Region', defaultValue: null, allowedValues: [null, 'east', 'west'] }]
  assert.equal(dashboardSchema.safeParse(candidate).success, true)
  assert.deepEqual(resolveAnalyticsParameters(candidate.bindings[0], {}), { region: null })
  candidate.controls[0].allowedValues.push('unknown')
  assert.equal(dashboardSchema.safeParse(candidate).success, false)
  candidate.controls[0].allowedValues.pop()
  parameter.required = true
  assert.equal(dashboardSchema.safeParse(candidate).success, false)
  assert.throws(() => resolveAnalyticsParameters(candidate.bindings[0], {}), /REQUIRED/)
  parameter.allowedValues.push(null)
  assert.equal(dashboardSchema.safeParse(candidate).success, false)
})
test('opens the exact saved dashboard receipt, ignoring start, failure and unrelated file results', () => {
  for (const value of [undefined, null, '', 'invalid', { status: 'running' }, { error: 'failed' }, { artifactId: manifest.id }])
    assert.equal(createdDashboard(value), null)
  const dashboard = { artifactId: manifest.id, draftRevision: 1, status: 'draft' }
  assert.deepEqual(createdDashboard({ dashboard }), dashboard)
  assert.deepEqual(createdDashboard(JSON.stringify({ dashboard })), dashboard)
})
