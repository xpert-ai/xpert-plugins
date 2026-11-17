// Test-only resource graph. Never installed or bundled as library catalog content.
const { graph, asset } = require('./library-v2-fixture.cjs')
const { reference } = require('../dist/lib/library/archive.js')

function buildExecutionPackage() {
  const f = graph(), rows = [{ month: '2026-01', revenue: 120 }, { month: '2026-02', revenue: 180 }, { month: '2026-03', revenue: 180 }]
  const bytes = Buffer.from(JSON.stringify(rows)), data = asset(bytes, { mimeType: 'application/json', fileName: 'sales.json' })
  f.dataset.assets = [data]
  f.dataset.content = { ...f.dataset.content, dataAssetId: data.id, format: 'json', readerOptions: { encoding: 'utf-8', rowsPath: [] },
    columns: [
      { key: 'month', label: 'Month', logicalType: 'string', nullable: false, role: 'dimension' },
      { key: 'revenue', label: 'Revenue', logicalType: 'float64', nullable: false, role: 'measure' }
    ], statistics: { rowCount: rows.length } }
  const html = Buffer.from('<!doctype html><html><head><title>Test</title></head><body><main>Execution fixture</main></body></html>')
  const page = asset(html, { id: 'page', mimeType: 'text/html', fileName: 'page.html', purpose: 'document' })
  f.template.assets = [page]
  f.template.content.presentation = { type: 'html', documentAssetId: 'page' }
  f.template.content.requirements = { skills: [{ name: 'live-dashboard', required: true }], plugins: [], capabilities: ['platform.analytics'] }
  f.task.content.prompt = '根据合成示例数据生成趋势看板，仅用于回归测试。'
  f.task.content.inputBindings = [{ slot: 'sales', dataAlias: 'data', mapping: { month: 'month', revenue: 'revenue' } }]
  f.task.dependencies = [
    { ...reference(f.dataset), alias: 'data', kind: f.dataset.kind },
    { ...reference(f.template), alias: 'analysis', kind: f.template.kind },
    { ...reference(f.theme), alias: 'theme', kind: f.theme.kind }
  ]
  return { roots: [reference(f.task)], resources: [f.task, f.dataset, f.template, f.theme], blobs: new Map([[data.sha256, bytes], [page.sha256, html]]) }
}

module.exports = { buildExecutionPackage }
