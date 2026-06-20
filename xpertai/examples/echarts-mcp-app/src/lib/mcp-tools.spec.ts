import {
  DRILLDOWN_TOOL_META,
  ECHARTS_CDN_URL,
  MCP_APP_RESOURCE_MIME_TYPE,
  MCP_APP_RESOURCE_URI,
  OVERVIEW_TOOL_META,
  buildDashboardResource,
  buildDrilldownResult,
  buildOverviewResult
} from './mcp-tools.js'
import { buildSalesAnalysis } from './sales-data.js'

describe('ECharts MCP App sales analysis', () => {
  it('aggregates deterministic revenue by region', () => {
    const analysis = buildSalesAnalysis({
      metric: 'revenue',
      groupBy: 'region',
      year: 2026
    })

    expect(analysis.points.map((point) => point.key)).toEqual(['West', 'East', 'South', 'North'])
    expect(analysis.points[0]).toMatchObject({
      key: 'West',
      revenue: 8_124_630,
      orders: 4027,
      rowCount: 48
    })
    expect(analysis.totals).toMatchObject({
      revenue: 26_317_482,
      margin: 7_905_747,
      orders: 13823
    })
    expect(analysis.nextGroupBy).toBe('product')
  })

  it('aggregates deterministic margin by month with filters', () => {
    const analysis = buildSalesAnalysis({
      metric: 'margin',
      groupBy: 'month',
      year: 2025,
      filters: {
        region: 'East',
        product: 'Analytics'
      }
    })

    expect(analysis.points.map((point) => point.key)).toEqual([
      'Jan',
      'Feb',
      'Mar',
      'Apr',
      'May',
      'Jun',
      'Jul',
      'Aug',
      'Sep',
      'Oct',
      'Nov',
      'Dec'
    ])
    expect(analysis.points[0]).toMatchObject({
      key: 'Jan',
      margin: 32974,
      rowCount: 1
    })
    expect(analysis.nextGroupBy).toBe(null)
  })
})

describe('ECharts MCP App MCP payloads', () => {
  it('returns UI metadata from the overview tool result', () => {
    const result = buildOverviewResult({
      metric: 'orders',
      groupBy: 'product',
      year: 2026
    })

    expect(result.content[0]).toMatchObject({
      type: 'text'
    })
    expect(result.structuredContent).toMatchObject({
      kind: 'echarts-sales-analysis',
      analysis: {
        metric: 'orders',
        groupBy: 'product',
        year: 2026
      }
    })
    expect(result._meta).toMatchObject({
      ui: {
        resourceUri: MCP_APP_RESOURCE_URI,
        visibility: ['model', 'app'],
        title: {
          zh_Hans: '销售经营下钻分析'
        },
        icon: {
          type: 'svg'
        }
      },
      'openai/outputTemplate': MCP_APP_RESOURCE_URI
    })
    expect(result._meta?.ui).not.toHaveProperty('csp')
  })

  it('marks the drilldown tool as app-only', () => {
    expect(DRILLDOWN_TOOL_META).toEqual({
      ui: {
        visibility: ['app']
      }
    })
  })

  it('keeps overview tool metadata compatible with MCP Apps and ChatGPT aliasing', () => {
    expect(OVERVIEW_TOOL_META).toMatchObject({
      ui: {
        resourceUri: MCP_APP_RESOURCE_URI,
        visibility: ['model', 'app']
      },
      'openai/outputTemplate': MCP_APP_RESOURCE_URI
    })
  })

  it('returns app resource HTML with the MCP App MIME type and bridge methods', () => {
    const resource = buildDashboardResource()

    expect(resource.contents).toHaveLength(1)
    expect(resource.contents[0]).toMatchObject({
      uri: MCP_APP_RESOURCE_URI,
      mimeType: MCP_APP_RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          title: {
            en_US: 'Sales Performance Drilldown',
            zh_Hans: '销售经营下钻分析'
          },
          description: {
            zh_Hans: '支持指标切换和下钻分析的交互式销售经营看板。'
          },
          icon: {
            type: 'svg'
          },
          csp: {
            resourceDomains: ['https://cdn.jsdelivr.net']
          },
          prefersBorder: true
        }
      }
    })

    const html = 'text' in resource.contents[0] ? resource.contents[0].text : ''
    expect(html.includes(ECHARTS_CDN_URL)).toBe(true)
    expect(html.includes('ui/initialize')).toBe(true)
    expect(html.includes('ui/notifications/tool-input')).toBe(true)
    expect(html.includes('ui/notifications/tool-result')).toBe(true)
    expect(html.includes('tools/call')).toBe(true)
  })

  it('extracts nested structuredContent.analysis instead of treating the wrapper as chart data', () => {
    const resource = buildDashboardResource()
    const html = 'text' in resource.contents[0] ? resource.contents[0].text : ''

    expect(html).toContain('echarts-sales-analysis')
    expect(html).toContain('structuredContent')
    expect(html).toContain('Array.isArray')
    expect(html).toContain('points')
  })

  it('returns structured drilldown analysis for iframe tool calls', () => {
    const result = buildDrilldownResult({
      metric: 'revenue',
      groupBy: 'product',
      year: 2026,
      filters: {
        region: 'West'
      }
    })

    expect(result.structuredContent).toMatchObject({
      analysis: {
        metric: 'revenue',
        groupBy: 'product',
        filters: {
          region: 'West'
        },
        nextGroupBy: 'month'
      }
    })
  })
})
