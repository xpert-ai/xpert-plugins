import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import type { CallToolResult, ReadResourceResult } from '@modelcontextprotocol/sdk/types.js'
import { z } from 'zod'
import { ECHARTS_CDN_URL, getDashboardHtml } from './app-html.js'
import { icon } from './icon.js'
import {
  SALES_GROUPS,
  SALES_METRICS,
  SALES_YEARS,
  buildSalesAnalysis,
  type SalesAnalysis,
  type SalesFilters,
  type SalesGroupBy,
  type SalesMetric
} from './sales-data.js'

export { ECHARTS_CDN_URL }

export const MCP_APP_RESOURCE_URI = 'ui://echarts-sales-dashboard'
export const MCP_APP_RESOURCE_MIME_TYPE = 'text/html;profile=mcp-app'

export const MCP_APP_CSP = {
  resourceDomains: ['https://cdn.jsdelivr.net'],
  connectDomains: [],
  frameDomains: [],
  baseUriDomains: []
}

export const MCP_APP_DISPLAY = {
  title: {
    en_US: 'Sales Performance Drilldown',
    zh_Hans: '销售经营下钻分析'
  },
  description: {
    en_US: 'Interactive sales dashboard with metric switching and drilldown analysis.',
    zh_Hans: '支持指标切换和下钻分析的交互式销售经营看板。'
  },
  icon: {
    type: 'svg',
    value: icon,
    alt: 'Sales performance dashboard'
  }
} as const

export const OVERVIEW_TOOL_META = {
  ui: {
    resourceUri: MCP_APP_RESOURCE_URI,
    visibility: ['model', 'app'],
    title: MCP_APP_DISPLAY.title,
    description: MCP_APP_DISPLAY.description,
    icon: MCP_APP_DISPLAY.icon
  },
  'openai/outputTemplate': MCP_APP_RESOURCE_URI
}

export const DRILLDOWN_TOOL_META = {
  ui: {
    visibility: ['app']
  }
}

const filtersSchema = z.object({
  region: z.string().optional(),
  product: z.string().optional(),
  month: z.string().optional()
})

const overviewInputSchema = {
  metric: z.enum(SALES_METRICS).default('revenue').describe('Metric to visualize.'),
  groupBy: z.enum(SALES_GROUPS).default('region').describe('Dimension used for the first chart.'),
  year: z.enum(['2024', '2025', '2026']).or(z.number().int()).default(2026).describe('Sales year to analyze.')
}

const drilldownInputSchema = {
  metric: z.enum(SALES_METRICS).default('revenue').describe('Metric to visualize.'),
  groupBy: z.enum(SALES_GROUPS).default('product').describe('Dimension to aggregate after a click.'),
  year: z.enum(['2024', '2025', '2026']).or(z.number().int()).default(2026).describe('Sales year to analyze.'),
  filters: filtersSchema.optional().default({}).describe('Current drilldown filters from the app.')
}

type OverviewArgs = {
  metric?: SalesMetric
  groupBy?: SalesGroupBy
  year?: number | string
}

type DrilldownArgs = OverviewArgs & {
  filters?: SalesFilters
}

function normalizeYearArgument(year: number | string | undefined) {
  if (typeof year === 'string') {
    const parsed = Number(year)
    return Number.isFinite(parsed) ? parsed : year
  }
  return year
}

function buildStructuredContent(analysis: SalesAnalysis) {
  return {
    kind: analysis.kind,
    analysis,
    chart: {
      title: `${analysis.metric} by ${analysis.groupBy}`,
      labels: analysis.points.map((point) => point.label),
      values: analysis.points.map((point) => point.value),
      metric: analysis.metric,
      groupBy: analysis.groupBy,
      year: analysis.year,
      filters: analysis.filters
    }
  }
}

function buildToolResult(analysis: SalesAnalysis, meta?: Record<string, unknown>): CallToolResult {
  return {
    content: [
      {
        type: 'text',
        text: analysis.summary
      }
    ],
    structuredContent: buildStructuredContent(analysis),
    ...(meta ? { _meta: meta } : {})
  } as CallToolResult
}

export function buildOverviewResult(args: OverviewArgs = {}): CallToolResult {
  const analysis = buildSalesAnalysis({
    metric: args.metric,
    groupBy: args.groupBy,
    year: normalizeYearArgument(args.year)
  })

  return buildToolResult(analysis, OVERVIEW_TOOL_META)
}

export function buildDrilldownResult(args: DrilldownArgs = {}): CallToolResult {
  const analysis = buildSalesAnalysis({
    metric: args.metric,
    groupBy: args.groupBy,
    year: normalizeYearArgument(args.year),
    filters: args.filters
  })

  return buildToolResult(analysis)
}

export function buildDashboardResource(mimeType = MCP_APP_RESOURCE_MIME_TYPE): ReadResourceResult {
  return {
    contents: [
      {
        uri: MCP_APP_RESOURCE_URI,
        mimeType,
        text: getDashboardHtml(),
        _meta: {
          ui: {
            title: MCP_APP_DISPLAY.title,
            description: MCP_APP_DISPLAY.description,
            icon: MCP_APP_DISPLAY.icon,
            csp: MCP_APP_CSP,
            prefersBorder: true
          }
        }
      }
    ]
  }
}

export async function registerEChartsMcpApp(server: McpServer) {
  const { RESOURCE_MIME_TYPE, registerAppResource, registerAppTool } = await import('@modelcontextprotocol/ext-apps/server')

  registerAppResource(
    server,
    'echarts-sales-dashboard',
    MCP_APP_RESOURCE_URI,
    {
      title: 'ECharts Sales Dashboard',
      description: 'Interactive ECharts dashboard for MCP Apps drilldown testing.',
      mimeType: RESOURCE_MIME_TYPE,
      _meta: {
        ui: {
          title: MCP_APP_DISPLAY.title,
          description: MCP_APP_DISPLAY.description,
          icon: MCP_APP_DISPLAY.icon,
          csp: MCP_APP_CSP,
          prefersBorder: true
        }
      }
    },
    () => buildDashboardResource(RESOURCE_MIME_TYPE)
  )

  registerAppTool(
    server,
    'echarts_sales_overview',
    {
      title: 'ECharts Sales Overview',
      description:
        'Show an interactive ECharts sales chart in ChatKit. Use this when the user asks for a sales chart, dashboard, visualization, or drilldown analysis.',
      inputSchema: overviewInputSchema,
      annotations: {
        title: 'ECharts Sales Overview',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: OVERVIEW_TOOL_META
    },
    (args) => buildOverviewResult(args as OverviewArgs)
  )

  registerAppTool(
    server,
    'echarts_sales_drilldown',
    {
      title: 'ECharts Sales Drilldown',
      description:
        'App-only tool used by the ECharts MCP App to fetch the next aggregation level after a user clicks a chart segment.',
      inputSchema: drilldownInputSchema,
      annotations: {
        title: 'ECharts Sales Drilldown',
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: false
      },
      _meta: DRILLDOWN_TOOL_META
    },
    (args) => buildDrilldownResult(args as DrilldownArgs)
  )
}

export function getEChartsCdnUrl() {
  return ECHARTS_CDN_URL
}

export function getSupportedYears() {
  return SALES_YEARS
}
