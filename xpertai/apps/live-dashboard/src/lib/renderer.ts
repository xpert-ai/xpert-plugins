import type { AnalyticalDataset, AnalyticsValue } from '@xpert-ai/contracts'
import type { DashboardManifest } from './dashboard.schema'

/** The only Data Analytics v1 translation. Providers never see chart encoding syntax. */
export function toDataAnalyticsPayload(manifest: DashboardManifest, datasets: AnalyticalDataset[]) {
  // Missing datasets are failures, not empty/zero business results. The caller renders
  // their failure state separately; successful empty datasets still retain their views.
  const available = new Set(datasets.map(dataset => dataset.datasetId))
  manifest = { ...manifest, charts: manifest.charts.filter(chart => available.has(chart.datasetId)),
    tables: manifest.tables.filter(table => available.has(table.datasetId)) }
  const snapshot = Object.fromEntries(datasets.flatMap((dataset) => [
    [dataset.datasetId, dataset.rows],
    ...(!manifest.charts.some((chart) => chart.datasetId === dataset.datasetId) ? [] : [[`__plot.${dataset.datasetId}`, dataset.rows.map((row) => Object.fromEntries(
      dataset.fields.map((field) => [field.id, manifest.charts.some((chart) => chart.datasetId === dataset.datasetId && [chart.x, chart.y].includes(field.id)) ? renderValue(row[field.id], field.logicalType) : row[field.id]])
    ))]])
  ]))
  const payload = {
    ok: true, widget_type: 'artifact', surface: 'dashboard', sources: [],
    manifest: { version: 1, surface: 'dashboard', title: manifest.title, cards: [], filters: [], sources: [],
      charts: manifest.charts.map((chart) => ({ id: chart.id, title: chart.title, type: chart.type, dataset: `__plot.${chart.datasetId}`,
        encodings: { x: { field: chart.x }, y: { field: chart.y }, ...(chart.color ? { color: { field: chart.color } } : {}) } })),
      tables: manifest.tables.map((table) => ({ id: table.id, title: table.title, dataset: table.datasetId,
        columns: table.fields.map((id) => ({ field: id, label: datasets.find((dataset) => dataset.datasetId === table.datasetId)?.fields.find((field) => field.id === id)?.label ?? id })) })),
      blocks: [...manifest.charts.map((chart) => ({ id: `chart.${chart.id}`, type: 'chart', chartId: chart.id })),
        ...manifest.tables.map((table) => ({ id: `table.${table.id}`, type: 'table', tableId: table.id }))] },
    snapshot: { version: 1, generatedAt: new Date().toISOString(), status: datasets.some((dataset) => dataset.completeness.truncated) ? 'partial' : 'ready', datasets: snapshot }
  }
  if (new TextEncoder().encode(JSON.stringify(payload)).byteLength > 3_000_000) throw new Error('DASHBOARD_RESULT_TOO_LARGE')
  return payload
}
function renderValue(value: AnalyticsValue, type: string): AnalyticsValue {
  if (value === null || (type !== 'int64' && type !== 'decimal')) return value
  // Dataset retains exact strings. Refuse values that the existing numeric renderer cannot represent safely.
  if (typeof value !== 'string' || !Number.isFinite(Number(value)) || Math.abs(Number(value)) > Number.MAX_SAFE_INTEGER || value.replace(/[-.]/g, '').replace(/^0+/, '').length > 15)
    throw new Error('DASHBOARD_NUMERIC_PRECISION_UNSUPPORTED')
  return Number(value)
}
