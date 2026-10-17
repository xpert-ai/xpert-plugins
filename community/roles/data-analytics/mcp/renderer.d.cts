/** Packaged renderer entry names. Add new widgets here and to the runtime list in the same release. */
export const DATA_ANALYTICS_WIDGET_ASSETS: readonly [
  'datascience-artifact-widget.html',
  'datascience-table-widget.html',
  'datascience-chart-widget.html'
]
export type DataAnalyticsWidgetAsset = (typeof DATA_ANALYTICS_WIDGET_ASSETS)[number]

/** Decompresses the shipped HTML verbatim. Node-only; no MCP, NestJS or plugin startup side effects. */
export function readWidgetHtmlAsset(fileName: DataAnalyticsWidgetAsset): string

/**
 * Bootstraps a trusted Data Analytics template with an already validated, JSON-serializable payload.
 * Consumers own Dataset translation, authorization, iframe isolation and refresh; this helper only
 * embeds initial data and sets the existing read-only hosting UI flags. It does not sanitize HTML.
 */
export function hostedArtifactHtml(html: string, payload: unknown): string
