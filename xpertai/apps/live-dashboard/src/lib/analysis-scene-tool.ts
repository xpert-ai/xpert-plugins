import { tool } from '@langchain/core/tools'
import { dispatchCustomEvent } from '@langchain/core/callbacks/dispatch'
import { ChatMessageEventTypeEnum, type AnalyticalDataset } from '@xpert-ai/contracts'
import { createHash } from 'node:crypto'
import { analysisSceneSchema } from './analysis-scene.schema'
import { analysisSceneWidget, selectedSceneRows } from './analysis-scene-widget'

export const ANALYSIS_SCENE_GUIDANCE = 'For a single interim analysis result, call dashboard_present_analysis after a successful dashboard_preview/dashboard_preview_binding, passing its current-run previewId, an explicit view (bar/line/table/metrics) and exact field IDs. It rechecks access and reruns the same read-only binding, then posts a bounded visual Widget directly in this conversation, including groups. It creates no dashboard, file or project. Do not write HTML or save a whole dashboard just to show an intermediate result. Metrics needs one aggregate row; charts do not infer aggregation or sort order. For top/bottom N, set orderBy to the requested measure and direction BEFORE maxRows; maxRows alone is not ranking. Set language to the conversation language. The visible scene is a result snapshot, not a final reply. Continue analyzing afterward and keep replyStage=progress until ready to answer. Check display.status before claiming the scene was shown.'

/** The enclosing middleware supplies a current-run receipt resolver bound to the real runtime actor. */
export function createAnalysisSceneTool(query: (previewId: string) => Promise<AnalyticalDataset>, runId: string, locale: () => string) {
  return tool(async (input, config) => {
    const dataset = await query(input.previewId)
    const sceneId = 'analysis-scene-' + createHash('sha256').update(JSON.stringify([runId, input])).digest('hex').slice(0, 24)
    const widget = analysisSceneWidget(input, dataset, sceneId, locale())
    await dispatchCustomEvent(ChatMessageEventTypeEnum.ON_TOOL_MESSAGE, widget, config)
    return JSON.stringify({ display: { status: 'emitted', sceneId, type: 'Widget' }, title: input.title,
      datasetId: dataset.datasetId, displayedRows: Math.min(dataset.rows.length, input.maxRows),
      omittedRows: Math.max(0, dataset.rows.length - input.maxRows), completeness: dataset.completeness,
      // Give the Agent the same fresh, selected values it showed; the earlier preview may be stale or unranked.
      result: {
        fields: input.fields.map(id => { const field = dataset.fields.find(field => field.id === id)!; return { id, label: field.label, logicalType: field.logicalType, unit: field.unit } }),
        rows: selectedSceneRows(input, dataset).map(row => Object.fromEntries(input.fields.map(id => [id, row[id]])))
      },
      selection: { orderBy: input.orderBy ?? null, scope: 'returned_query_rows', warning: input.orderBy ? 'Ranking covers returned rows only; check source completeness before claiming a global top/bottom N.' : 'No ranking was applied. First rows are not top/bottom N.' },
      queriedAt: dataset.freshness.executedAt, sourceFetchedAt: dataset.freshness.sourceFetchedAt })
  }, { name: 'dashboard_present_analysis', schema: analysisSceneSchema, verboseParsingErrors: true,
    description: 'Display one verified analysis scene inline in chat (including groups) as a read-only Widget: bar, line, table or metrics. Requires a current-run previewId. Revalidates access and reruns that exact read-only binding. Never accepts rows/SQL/URLs/HTML; does not create or save a dashboard. Choose exact returned field IDs; charts require [dimension, measure] and unique categories. Table preserves exact decimal/int64 strings. A scene does not complete the request; continue analysis or send the final answer as appropriate.',
    metadata: { toolName: { en_US: 'Show analysis result', zh_Hans: '展示本次分析结果' } }
  })
}
