require('reflect-metadata')
const { test } = require('node:test')
const assert = require('node:assert/strict')
const { zipSync, unzipSync } = require('fflate')
const { dashboardSchema } = require('../dist/lib/dashboard.schema')
const { dashboardComponents, publicDashboardManifest } = require('../dist/lib/dashboard-sources')
const { assertComponentElements } = require('../dist/lib/source-validation')
const { encodeDashboardArchive, decodeDashboardArchive } = require('../dist/lib/dashboard-archive')
const { DashboardArchiveService } = require('../dist/lib/archive.service')
const { reduceSourceExecutions } = require('../dist/lib/source-executions')
const { createDashboardInspector } = require('../dist/lib/inspection-host')
const { DASHBOARD_INSPECTION_RUNTIME } = require('../dist/lib/inspection-runtime')
const { createRequire } = require('node:module')
const { JSDOM } = createRequire(require.resolve('jest-environment-jsdom'))('jsdom')
const { setup } = require('./service-fixture.cjs')
const example = require('../examples/postgres-sales.json')
const html = () => ({ ...structuredClone(example), charts: [], tables: [],
  presentation: { type: 'html', html: '<!doctype html><html><head></head><body><div id="total">0</div></body></html>' },
  sourceMetadata: [{ bindingId: 'sales', title: 'Sales query', description: 'Independent sales query' }],
  components: [{ id: 'total', elementId: 'total', title: 'Total', kind: 'metric', sources: [{ bindingId: 'sales', fieldIds: ['amount'] }] }] })

test('source declarations validate references and unique DOM anchors without guessing labels', () => {
  const manifest = dashboardSchema.parse(html())
  assert.doesNotThrow(() => assertComponentElements(manifest))
  for (const mutate of [
    m => m.components.push(m.components[0]),
    m => m.components[0].sources[0].bindingId = 'missing',
    m => m.components[0].sources[0].fieldIds = ['absent'],
    m => m.sourceMetadata.push(m.sourceMetadata[0])
  ]) { const m = html(); mutate(m); assert.equal(dashboardSchema.safeParse(m).success, false) }
  for (const body of ['<div id="other"></div>', '<i id="total"></i><b id="total"></b>'])
    assert.throws(() => assertComponentElements({ ...manifest, presentation: { type: 'html', html: `<html><body>${body}</body></html>` } }), /COMPONENT_ELEMENT_INVALID/)
  assert.deepEqual(dashboardComponents(example).map(c => c.sources[0].bindingId), ['sales', 'sales'])
  assert.deepEqual(publicDashboardManifest(manifest).bindings[0].payload, {})
  assert.ok(manifest.bindings[0].payload.sql, 'projection must not mutate persisted configuration')
})

test('HTML and standard archives round-trip and reject corruption, unknown entries, versions and oversized inflation', () => {
  for (const manifest of [example, html()]) {
    const bytes = encodeDashboardArchive(manifest, [])
    const decoded = decodeDashboardArchive(bytes)
    assert.deepEqual(decoded.manifest, dashboardSchema.parse(manifest)); assert.deepEqual(decoded.dependencies, [])
    assert.deepEqual(decodeDashboardArchive(Buffer.from(JSON.stringify(manifest))), decoded)
    const files = unzipSync(bytes)
    assert.equal(Object.hasOwn(files, 'dashboard.html'), !!manifest.presentation)
    files['dashboard.json'][0] ^= 1
    assert.throws(() => decodeDashboardArchive(Buffer.from(zipSync(files))), /INTEGRITY_FAILED/)
  }
  const files = unzipSync(encodeDashboardArchive(example, []))
  assert.throws(() => decodeDashboardArchive(Buffer.from(zipSync({ ...files, '../escape': new Uint8Array() }))), /ENTRY_INVALID/)
  const index = JSON.parse(Buffer.from(files['package.json']).toString()); index.version = 99
  assert.throws(() => decodeDashboardArchive(Buffer.from(zipSync({ ...files, 'package.json': Buffer.from(JSON.stringify(index)) }))))
  assert.throws(() => decodeDashboardArchive(Buffer.from(zipSync({ 'dashboard.json': Buffer.alloc(9_000_001, 'a') }))), /ENTRY_INVALID|TOO_LARGE/)
})

test('import preserves IDs inside the page, creates only one new draft and revalidates real queries', async () => {
  const f = setup(), service = new DashboardArchiveService(f.service, { require: key => f.capabilities[key.id] })
  const original = await f.service.save(f.context, html(), null, 0)
  const prepared = await service.prepare(f.context, encodeDashboardArchive(html(), []))
  const before = f.calls.queries.length
  const input = { importId: prepared.importId, bindings: [] }
  const saved = await service.commit(f.context, input)
  assert.notEqual(saved.artifactId, original.artifactId); assert.equal(saved.draftRevision, 1)
  assert.equal(f.versions.length, 0); assert.ok(f.calls.queries.length > before)
  const opened = await f.service.openDocument(f.context, saved.artifactId)
  assert.notEqual(opened.manifest.id, example.id)
  assert.deepEqual(opened.manifest.components, html().components)
  assert.deepEqual(opened.manifest.bindings, example.bindings)
  assert.equal((await service.commit(f.context, input)).artifactId, saved.artifactId)
  assert.equal(f.artifacts.size, 2)
  await assert.rejects(service.commit({ ...f.context, userId: 'different' }, input), /IMPORT_EXPIRED/)
  await assert.rejects(service.commit(f.context, { ...input, bindings: [{ bindingId: 'missing', source: example.bindings[0].source, payload: {} }] }), /BINDINGS_INVALID/)
  await service.discard(f.context, prepared.importId)
  await assert.rejects(service.commit(f.context, input), /IMPORT_EXPIRED/)
})

test('denied import queries create no draft and denied definition rights block every archive entry', async () => {
  const f = setup(), service = new DashboardArchiveService(f.service, { require: key => f.capabilities[key.id] })
  const prepared = await service.prepare(f.context, encodeDashboardArchive(example, []))
  f.calls.denied = true
  await assert.rejects(service.commit(f.context, { importId: prepared.importId, bindings: [] }))
  assert.equal(f.artifacts.size, 0)
  f.service.access = async () => ({ canEdit: false })
  for (const call of [() => service.prepare(f.context, Buffer.from('{}')), () => service.commit(f.context, { importId: prepared.importId, bindings: [] }),
    () => service.browse(f.context, { importId: prepared.importId }), () => service.exportFile(f.context, 'archive/forged')])
    await assert.rejects(call(), /DEFINITION_ACCESS_DENIED/)
})

test('source execution ignores late results, caps preview rows, preserves null/empty/zero and marks prior result after failure', () => {
  const start = (requestId, controls) => ({ type: 'start', bindingId: 'sales', requestId, controls, at: '2026-11-04T00:00:00Z' })
  let state = reduceSourceExecutions({}, start('1', { region: '' }))
  state = reduceSourceExecutions(state, start('2', { region: null, zero: 0, flag: false }))
  const result = { rows: Array.from({ length: 100 }, () => ({ value: 0 })), completeness: { returnedRows: 100 } }
  assert.equal(reduceSourceExecutions(state, { type: 'success', bindingId: 'sales', requestId: '1', result }), state)
  state = reduceSourceExecutions(state, { type: 'success', bindingId: 'sales', requestId: '2', result, at: 'now' })
  assert.equal(state.sales.result.rows.length, 50); assert.equal(state.sales.result.completeness.returnedRows, 100)
  state = reduceSourceExecutions(state, start('3', { region: '' }))
  state = reduceSourceExecutions(state, { type: 'failure', bindingId: 'sales', requestId: '3', at: 'later' })
  assert.equal(state.sales.state, 'failed'); assert.deepEqual(state.sales.resultControls, { region: null, zero: 0, flag: false })
  assert.equal(state.sales.controls.region, '')
})

test('inspect requires the current frame, generation nonce and declared component, and disposes listeners', () => {
  const listeners = new Set(), sent = [], selected = [], frameWindow = { postMessage: m => sent.push(m) }
  const host = { addEventListener: (_, f) => listeners.add(f), removeEventListener: (_, f) => listeners.delete(f) }
  const frame = { ownerDocument: { defaultView: host }, contentWindow: frameWindow }
  const inspector = createDashboardInspector(frame, html().components, id => selected.push(id), () => selected.push('exit'))
  const key = inspector.prefix.match(/const key = '([^']+)'/)[1]
  const emit = (type, extra = {}, source = frameWindow) => [...listeners].forEach(f => f({ source, data: { channel: 'live-dashboard.inspection', key, type, ...extra } }))
  inspector.setEnabled(true); emit('ready')
  assert.equal(sent.at(-1).enabled, true)
  emit('selected', { componentId: 'total', key: 'old' }); emit('selected', { componentId: 'total' }, {})
  emit('selected', { componentId: 'unknown' }); assert.equal(selected.length, 0)
  emit('selected', { componentId: 'total' }); emit('selected', { componentId: null })
  assert.deepEqual(selected, ['total', null])
  inspector.dispose(); assert.equal(listeners.size, 0)
})

test('inspection intercepts business clicks, supports dynamic standard blocks and restores keyboard behavior', async () => {
  const dom = new JSDOM('<html><body><button id="before">Before</button></body></html>', { runScripts: 'outside-only', pretendToBeVisual: true })
  try {
    const w = dom.window, events = []; let filters = 0
    w.postMessage = data => events.push(data)
    w.eval(DASHBOARD_INSPECTION_RUNTIME.replace('__INSPECTION_SESSION__', 'key'))
    const mode = enabled => w.dispatchEvent(new w.MessageEvent('message', { source: w, data: { channel: 'live-dashboard.inspection', key: 'key', type: 'mode', enabled, standard: true, components: [{ id: 'sales', elementId: 'chart:sales' }] } }))
    mode(true)
    const chart = w.document.createElement('div'); chart.dataset.layoutBlockId = 'chart:sales'
    chart.innerHTML = '<button>Apply business filter</button>'; w.document.body.append(chart)
    chart.querySelector('button').addEventListener('click', () => filters++)
    await new Promise(resolve => setImmediate(resolve))
    assert.equal(chart.tabIndex, 0, 'late renderer blocks must become keyboard targets')
    chart.querySelector('button').click(); assert.equal(filters, 0); assert.equal(events.at(-1).componentId, 'sales')
    chart.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }))
    assert.equal(events.at(-1).componentId, 'sales')
    chart.dispatchEvent(new w.KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }))
    assert.equal(events.at(-1).type, 'exit'); assert.equal(chart.hasAttribute('tabindex'), false)
    chart.querySelector('button').click(); assert.equal(filters, 1)
  } finally { dom.window.close() }
})

test('archives preserve exact bundled dependency bytes and reject a broken dependency snapshot', async () => {
  const { libraryLocks, resolveLibraryAssets } = require('../dist/lib/document-libraries')
  const locks = await libraryLocks(['echarts']), assets = await resolveLibraryAssets(locks)
  const manifest = html(); manifest.presentation.dependencies = locks
  assert.deepEqual(decodeDashboardArchive(encodeDashboardArchive(manifest, assets)), { manifest, dependencies: assets })
  assert.throws(() => encodeDashboardArchive(manifest, []), /LOCK_MISMATCH/)
  assert.throws(() => encodeDashboardArchive(manifest, [{ ...assets[0], source: assets[0].source + 'corrupt' }]), /INTEGRITY/)
})
