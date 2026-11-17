import type { AnalyticalDataset, AnalyticsValue, TMessageComponentWidget } from '@xpert-ai/contracts'
import type { AnalysisSceneInput } from './analysis-scene.schema'
import { analysisSceneChart, chartNumber } from './analysis-scene-chart'

const copy = {
  en: { empty: 'No rows returned for this query.', partial: 'Partial result', complete: 'Complete query result', rows: 'Displayed rows', fetched: 'Source fetched', query: 'Query executed', dataset: 'Dataset', null: 'No value', details: 'Exact values' },
  zh: { empty: '本次查询没有返回数据。', partial: '部分查询结果', complete: '完整查询结果', rows: '展示行数', fetched: '数据获取时间', query: '查询时间', dataset: '数据集', null: '无值', details: '精确数值' }
}
/** Build one inert Widget using only the selected, authorized Dataset fields. Never copy Binding payloads or audit secrets. */
export function analysisSceneWidget(input: AnalysisSceneInput, dataset: AnalyticalDataset, id: string, locale: string): TMessageComponentWidget {
  const t = (input.language ?? locale).startsWith('zh') ? copy.zh : copy.en
  const fields = input.fields.map(id => {
    const field = dataset.fields.find(field => field.id === id)
    if (!field) throw new Error('ANALYSIS_SCENE_FIELD: choose exact field IDs from the verified dataset.')
    return field
  })
  if (input.view === 'metrics' && dataset.rows.length > 1) throw new Error('ANALYSIS_SCENE_AGGREGATE_REQUIRED: metrics requires one already-aggregated row; use table or query the intended aggregate.')
  const rows = selectedSceneRows(input, dataset)
  const partial = dataset.completeness.truncated || dataset.completeness.scope !== 'full_query_result' || rows.length < dataset.rows.length
  const text = (value: AnalyticsValue) => value === null ? t.null : String(value)
  const escape = (value: string) => value.replace(/[\\`*_{}\[\]<>|!#]/g, '\\$&').replace(/[\r\n]+/g, ' ')
  type Component = NonNullable<NonNullable<TMessageComponentWidget['widgets'][number]['messages']>[number]['surfaceUpdate']>['components'][number]
  const components: Component[] = []
  const children: string[] = []
  const addText = (key: string, value: string, usageHint: 'h3' | 'body' | 'caption' = 'body') => {
    children.push(key)
    components.push({ id: key, component: { Text: { text: { literalString: value }, usageHint } } })
  }
  addText('title', escape(input.title), 'h3')
  if (!rows.length) addText('empty', t.empty)
  else if (input.view === 'metrics') {
    const metrics: string[] = []
    for (const [index, field] of fields.entries()) {
      const metricId = `metric-${index}`
      const parts = [`${metricId}-label`, `${metricId}-value`]
      metrics.push(metricId)
      components.push(
        { id: parts[0], component: { Text: { text: { literalString: escape(field.label) }, usageHint: 'caption' } } },
        { id: parts[1], component: { Text: { text: { literalString: escape(metricValue(rows[0][field.id], field.logicalType, t.null)) }, usageHint: 'h2' } } }
      )
      if (field.unit) {
        parts.push(`${metricId}-unit`)
        components.push({ id: `${metricId}-unit`, component: { Text: { text: { literalString: escape(field.unit) }, usageHint: 'caption' } } })
      }
      components.push({ id: metricId, component: { Column: { children: { explicitList: parts } } } })
    }
    children.push('metrics')
    components.push({ id: 'metrics', component: { Row: { children: { explicitList: metrics } } } })
  } else {
    if (input.view === 'bar' || input.view === 'line') {
      const [dimension, measure] = fields
      if (!['dimension', 'time', 'identifier'].includes(dimension.role) || measure.role !== 'measure') throw new Error('ANALYSIS_SCENE_ROLES: charts require a declared dimension/time/identifier followed by a measure.')
      const labels = rows.map(row => text(row[dimension.id]))
      if (new Set(labels).size !== labels.length) throw new Error('ANALYSIS_SCENE_GRAIN: repeated labels need an explicitly aggregated query; no implicit aggregation is performed.')
      const points = rows.map((row, index) => ({ label: labels[index], value: chartNumber(row[measure.id], measure.logicalType) }))
      const svg = analysisSceneChart(input.view, points, measure.unit ?? measure.label)
      children.push('chart')
      components.push({ id: 'chart', component: { Image: { url: { literalString: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg) }, alt: { literalString: input.title }, fit: 'contain' } } })
    }
    addText('details-label', t.details, 'caption')
    const table = [`| ${fields.map(field => escape(field.label)).join(' | ')} |`, `| ${fields.map(() => '---').join(' | ')} |`, ...rows.map(row => `| ${fields.map(field => escape(text(row[field.id]))).join(' | ')} |`)].join('\n')
    addText('details', table)
  }
  components.unshift({ id: 'root', component: { Column: { children: { explicitList: children } } } })
  const widget: TMessageComponentWidget = { id, category: 'Dashboard', type: 'Widget', widgets: [{ name: input.title,
    presentation: {
      summary: partial ? t.partial : t.complete,
      timestamp: dataset.freshness.executedAt,
      timestampLabel: t.query,
      details: [
        { label: t.dataset, value: dataset.datasetId },
        { label: t.rows, value: `${rows.length}/${dataset.rows.length}` },
        { label: t.fetched, value: dataset.freshness.sourceFetchedAt }
      ]
    }, messages: [
    { surfaceUpdate: { surfaceId: id, components } }, { beginRendering: { surfaceId: id, root: 'root' } }
  ] }] }
  if (Buffer.byteLength(JSON.stringify(widget)) > 100000) throw new Error('ANALYSIS_SCENE_TOO_LARGE: select fewer fields or a smaller maxRows.')
  return widget
}

/** Group decimal/int64 strings without a Number conversion, preserving every digit and trailing zero. */
function metricValue(value: AnalyticsValue, logicalType: AnalyticalDataset['fields'][number]['logicalType'], empty: string): string {
  if (value === null) return empty
  const text = String(value)
  if (!['int64', 'float64', 'decimal'].includes(logicalType) || !/^-?\d+(\.\d+)?$/.test(text)) return text
  const [integer, fraction] = text.split('.')
  return integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',') + (fraction === undefined ? '' : `.${fraction}`)
}

/** Explicit presentation sorting only, before truncation. No aggregation or claims about unreturned rows. */
export function selectedSceneRows(input: AnalysisSceneInput, dataset: AnalyticalDataset): AnalyticalDataset['rows'] {
  if (!input.orderBy) return dataset.rows.slice(0, input.maxRows)
  const order = input.orderBy
  const field = dataset.fields.find(field => field.id === order.field)
  if (!field || field.role !== 'measure' || !input.fields.includes(field.id)) throw new Error('ANALYSIS_SCENE_ORDER: orderBy must select a displayed numeric measure.')
  const direction = order.direction === 'asc' ? 1 : -1
  return dataset.rows.map(row => ({ row, value: chartNumber(row[field.id], field.logicalType) }))
    .sort((a, b) => a.value === null ? (b.value === null ? 0 : 1) : b.value === null ? -1 : (a.value - b.value) * direction)
    .slice(0, input.maxRows).map(item => item.row)
}
