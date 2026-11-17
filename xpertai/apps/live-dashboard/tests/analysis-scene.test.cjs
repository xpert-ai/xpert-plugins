const { test } = require('node:test')
const assert = require('node:assert/strict')
const { analysisSceneSchema } = require('../dist/lib/analysis-scene.schema.js')
const { analysisSceneWidget, selectedSceneRows } = require('../dist/lib/analysis-scene-widget.js')
const { chartNumber } = require('../dist/lib/analysis-scene-chart.js')
const { DashboardMiddleware } = require('../dist/lib/middleware.js')
const example = require('../examples/postgres-sales.json')

function dataset() {
  return { schema: 'xpert.analytics.dataset', version: 1, datasetId: 'regional-sales', fields: [
    { id: 'region', sourceField: 'region', label: 'Region', logicalType: 'string', role: 'dimension', nullable: false },
    { id: 'amount', sourceField: 'amount', label: 'Sales', logicalType: 'decimal', role: 'measure', nullable: true, unit: 'CNY' }
  ], rows: [{ region: 'East', amount: '1234.50' }, { region: 'West', amount: '-50.25' }], grain: { keys: ['region'] },
  completeness: { returnedRows: 2, totalAccuracy: 'exact', scope: 'full_query_result', truncated: false },
  freshness: { executedAt: '2026-11-09T01:00:00Z', sourceFetchedAt: '2026-11-09T00:59:00Z' },
  lineage: { executionId: 'private-execution', auditRef: 'private-audit', bindingId: 'binding', providerId: 'postgres' } }
}
const input = { previewId: 'verified-receipt', title: 'Regional sales', view: 'bar', fields: ['region', 'amount'], maxRows: 10 }
const widget = (changes = {}, result = dataset()) => analysisSceneWidget({ ...input, ...changes }, result, 'scene', 'zh-Hans')
const components = value => value.widgets[0].messages[0].surfaceUpdate.components

test('bounded presentation contract rejects model-provided rows, query scope and ambiguous fields', () => {
  assert.equal(analysisSceneSchema.parse(input).maxRows, 10)
  for (const change of [{ rows: [] }, { sql: 'select *' }, { userId: 'other' }, { fields: ['amount', 'amount'] }, { fields: ['amount'] }, { maxRows: 21 }]) {
    assert.equal(analysisSceneSchema.safeParse({ ...input, ...change }).success, false)
  }
  assert.throws(() => widget({ fields: ['unknown', 'amount'] }), /ANALYSIS_SCENE_FIELD/)
  assert.throws(() => widget({ fields: ['amount', 'region'] }), /ANALYSIS_SCENE_ROLES/)
})

test('inline Widget includes chart, exact values and freshness, without private query provenance', () => {
  const result = widget(), encoded = JSON.stringify(result)
  assert.equal(result.category, 'Dashboard'); assert.equal(result.type, 'Widget')
  assert.match(encoded, /1234.50/); assert.match(encoded, /完整查询结果/); assert.match(encoded, /2026-11-09T01:00:00Z/)
  assert.doesNotMatch(encoded, /private-execution|private-audit|postgres/)
  const url = components(result).find(c => c.id === 'chart').component.Image.url.literalString
  const svg = decodeURIComponent(url.split(',').slice(1).join(','))
  assert.match(svg, /<svg/); assert.doesNotMatch(svg, /NaN|Infinity|<script|<foreignObject/)
})

test('partial, empty, null and exact large decimals are represented honestly', () => {
  assert.match(JSON.stringify(widget({ maxRows: 1 })), /部分查询结果/)
  const empty = dataset(); empty.rows = []; empty.completeness.returnedRows = 0
  assert.match(JSON.stringify(widget({}, empty)), /本次查询没有返回数据/)
  const large = dataset(); large.rows[0].amount = '9007199254740993.01'; large.rows[1].amount = null
  assert.throws(() => widget({}, large), /NUMERIC_PRECISION/)
  const table = JSON.stringify(widget({ view: 'table' }, large))
  assert.match(table, /9007199254740993.01/); assert.match(table, /无值/)
  assert.throws(() => widget({ view: 'metrics' }), /AGGREGATE_REQUIRED/)
  large.rows = large.rows.slice(0, 1)
  assert.match(JSON.stringify(widget({ view: 'metrics', fields: ['amount'] }, large)), /9,007,199,254,740,993.01/)
})

test('metrics separate labels, exact values and declared units, with passive provenance outside the main surface', () => {
  const data = dataset(); data.rows = [{ region: 'East', amount: '43352806722.4100' }]
  const result = widget({ view: 'metrics', fields: ['amount'] }, data)
  const items = components(result)
  assert.equal(items.find(c => c.id === 'metric-0-value').component.Text.text.literalString, '43,352,806,722.4100')
  assert.equal(items.find(c => c.id === 'metric-0-unit').component.Text.text.literalString, 'CNY')
  assert.equal(items.find(c => c.id === 'metric-0-label').component.Text.text.literalString, 'Sales')
  assert.equal(result.widgets[0].presentation.timestamp, data.freshness.executedAt)
  assert.equal(result.widgets[0].presentation.details[0].value, data.datasetId)
  assert.doesNotMatch(JSON.stringify(items), /regional-sales|2026-11-09|1\/1/)
  delete data.fields[1].unit
  assert.equal(components(widget({ view: 'metrics', fields: ['amount'] }, data)).some(c => c.id === 'metric-0-unit'), false)
  data.rows[0].amount = null
  assert.equal(components(widget({ view: 'metrics', fields: ['amount'] }, data)).find(c => c.id === 'metric-0-value').component.Text.text.literalString, '无值')
})

test('chart inputs never silently aggregate, coerce booleans, or execute markup', () => {
  assert.throws(() => chartNumber(true, 'boolean'), /NUMERIC_PRECISION/)
  const repeated = dataset(); repeated.rows[1].region = 'East'
  assert.throws(() => widget({}, repeated), /ANALYSIS_SCENE_GRAIN/)
  const zero = dataset(); zero.rows.forEach(row => { row.amount = '0' }); zero.rows[0].region = '<script>alert(1)</script>'
  const url = components(widget({ view: 'line' }, zero)).find(c => c.id === 'chart').component.Image.url.literalString
  const svg = decodeURIComponent(url.split(',').slice(1).join(','))
  assert.doesNotMatch(svg, /<script|NaN|Infinity|y="-/)
  assert.match(svg, /&lt;script&gt;/)
})

test('current-run tool rechecks the original query, emits a stable Widget, and refuses revoked/foreign receipts', async () => {
  const queries = [], events = []; let denied = false
  const service = {
    async discover() { return { items: [], queryContract: { operation: 'query', contractVersion: 1, payloadSchema: {} } } },
    async preview(scope, request) { if (denied) throw new Error('ACCESS_REVOKED'); queries.push({ scope, request }); return dataset() }
  }
  const strategy = new DashboardMiddleware(service)
  const context = { xpertId: 'assistant', tenantId: 'tenant', organizationId: 'org', userId: 'viewer', projectId: 'usage-project' }
  const middleware = strategy.createMiddleware({}, context)
  const invoke = (name, args) => middleware.tools.find(t => t.name === name).invoke(args, { callbacks: [{ handleCustomEvent(name, data) { events.push({ name, data }) } }] })
  const preview = JSON.parse(await invoke('dashboard_preview_binding', { bindingJson: JSON.stringify(example.bindings[0]) }))
  const args = { ...input, previewId: preview.previewId }
  const first = JSON.parse(await invoke('dashboard_present_analysis', args))
  const second = JSON.parse(await invoke('dashboard_present_analysis', args))
  assert.equal(first.display.status, 'emitted'); assert.equal(first.display.sceneId, second.display.sceneId)
  assert.deepEqual(first.result.rows, dataset().rows)
  assert.deepEqual(first.result.fields.map(field => field.id), input.fields)
  assert.doesNotMatch(JSON.stringify(first), /private-execution|private-audit/)
  assert.equal(events.length, 2); assert.equal(events[0].data.type, 'Widget')
  assert.equal(queries.length, 3); assert.deepEqual(queries[0], queries[1]); assert.deepEqual(queries[1], queries[2])
  assert.equal(queries[1].scope.userId, 'viewer')
  assert.equal(first.replyStage, undefined)
  denied = true
  await assert.rejects(invoke('dashboard_present_analysis', args), /ACCESS_REVOKED/)
  assert.equal(events.length, 2)
  const another = strategy.createMiddleware({}, context)
  await assert.rejects(another.tools.find(t => t.name === 'dashboard_present_analysis').invoke(args), /PREVIEW_REQUIRED/)
  assert.equal(queries.length, 3)
  await middleware.wrapModelCall({ tools: [] }, async request => {
    assert.match(JSON.stringify(request.systemMessage.content), /dashboard_present_analysis/)
    return {}
  })
})


test('explicit ranking precedes truncation, preserves the dataset and places nulls last', () => {
  const data = dataset(); data.rows.reverse(); data.rows.unshift({ region: 'Missing', amount: null })
  const before = structuredClone(data)
  const selected = selectedSceneRows({ ...input, maxRows: 1, orderBy: { field: 'amount', direction: 'desc' } }, data)
  assert.deepEqual(selected, [{ region: 'East', amount: '1234.50' }]); assert.deepEqual(data, before)
  assert.throws(() => selectedSceneRows({ ...input, orderBy: { field: 'region', direction: 'asc' } }, data), /ANALYSIS_SCENE_ORDER/)
  assert.match(JSON.stringify(widget({ language: 'en' })), /Complete query result/)
})
