import {
  DATA_ANALYTICS_WIDGET_ASSETS,
  readWidgetHtmlAsset,
  hostedArtifactHtml,
  type DataAnalyticsWidgetAsset
} from '@xpert-ai/community-data-analytics/renderer'

const asset: DataAnalyticsWidgetAsset = DATA_ANALYTICS_WIDGET_ASSETS[0]
const html: string = readWidgetHtmlAsset(asset)
const hosted: string = hostedArtifactHtml(html, { manifest: {}, snapshot: {} })
void hosted
// @ts-expect-error Only packaged widget names are accepted by the public entry.
readWidgetHtmlAsset('arbitrary.html')
