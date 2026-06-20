type SalesMetric = 'revenue' | 'margin' | 'orders'
type SalesGroupBy = 'region' | 'product' | 'month'

type SalesPoint = {
  key: string
  label: string
  value: number
}

type SalesAnalysis = {
  kind: 'echarts-sales-analysis'
  year: number
  metric: SalesMetric
  groupBy: SalesGroupBy
  filters: Record<string, string>
  points: SalesPoint[]
  totals?: {
    revenue?: number
    margin?: number
    orders?: number
  }
  nextGroupBy?: SalesGroupBy | null
  summary?: string
}

type Breadcrumb = {
  dimension: SalesGroupBy
  value: string
  label: string
}

type JsonRpcResponse = {
  jsonrpc?: '2.0'
  id?: number | string | null
  result?: unknown
  error?: {
    message?: string
  }
}

type JsonRpcNotification = {
  jsonrpc?: '2.0'
  method?: string
  params?: unknown
}

type PendingRequest = {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

type SupportedLocale = 'en' | 'zh'

type HostContext = {
  locale?: string
  language?: string
  direction?: string
}

const MESSAGES: Record<
  SupportedLocale,
  {
    documentTitle: string
    title: string
    waiting: string
    metric: string
    groupBy: string
    year: string
    reset: string
    overview: string
    revenue: string
    margin: string
    orders: string
    region: string
    product: string
    month: string
    hint: string
    noMatchingData: (year: number) => string
    summary: (input: {
      metric: string
      groupBy: string
      year: number
      filters: Record<string, string>
      topLabel: string
      topValue: string
    }) => string
    filters: (filters: Record<string, string>) => string
    errors: {
      missingPoints: string
      echartsLoadFailed: string
      missingAnalysis: string
      rpcFailed: string
      timeout: (method: string) => string
    }
  }
> = {
  en: {
    documentTitle: 'ECharts Sales Drilldown',
    title: 'Sales Drilldown',
    waiting: 'Waiting for tool result...',
    metric: 'Metric',
    groupBy: 'Group by',
    year: 'Year',
    reset: 'Reset',
    overview: 'Overview',
    revenue: 'Revenue',
    margin: 'Gross margin',
    orders: 'Orders',
    region: 'Region',
    product: 'Product',
    month: 'Month',
    hint: 'Click a bar or point to drill into the next available dimension. Use Reset to return to the overview.',
    noMatchingData: (year) => `No matching sales data for ${year}.`,
    summary: ({ metric, groupBy, year, filters, topLabel, topValue }) =>
      `${metric} by ${groupBy.toLowerCase()} for ${year}${MESSAGES.en.filters(filters)}. Top segment: ${topLabel} with ${topValue}.`,
    filters: (filters) => {
      const entries = Object.entries(filters)
      return entries.length
        ? ` (${entries
            .map(([key, value]) => `${groupLabel(key as SalesGroupBy)}=${dimensionValueLabel(key as SalesGroupBy, value)}`)
            .join(', ')})`
        : ''
    },
    errors: {
      missingPoints: 'Tool result did not include chart points.',
      echartsLoadFailed: 'ECharts failed to load from CDN.',
      missingAnalysis: 'Tool result did not include sales analysis.',
      rpcFailed: 'MCP App RPC failed',
      timeout: (method) => `Timed out waiting for ${method}`
    }
  },
  zh: {
    documentTitle: '销售经营下钻分析',
    title: '销售经营下钻',
    waiting: '等待工具结果...',
    metric: '指标',
    groupBy: '分组维度',
    year: '年份',
    reset: '重置',
    overview: '概览',
    revenue: '收入',
    margin: '毛利',
    orders: '订单数',
    region: '区域',
    product: '产品',
    month: '月份',
    hint: '点击柱形或折线点可进入下一层维度分析。使用重置返回概览。',
    noMatchingData: (year) => `${year} 年没有匹配的销售数据。`,
    summary: ({ metric, groupBy, year, filters, topLabel, topValue }) =>
      `${year} 年按${groupBy}统计的${metric}${MESSAGES.zh.filters(filters)}。最高分组：${topLabel}，${topValue}。`,
    filters: (filters) => {
      const entries = Object.entries(filters)
      return entries.length
        ? `（${entries
            .map(([key, value]) => `${groupLabel(key as SalesGroupBy)}=${dimensionValueLabel(key as SalesGroupBy, value)}`)
            .join('，')}）`
        : ''
    },
    errors: {
      missingPoints: '工具结果中没有包含图表数据点。',
      echartsLoadFailed: 'ECharts CDN 加载失败。',
      missingAnalysis: '工具结果中没有包含销售分析数据。',
      rpcFailed: 'MCP App RPC 调用失败',
      timeout: (method) => `等待 ${method} 超时`
    }
  }
}

type EChartsInstance = {
  setOption: (option: Record<string, unknown>, notMerge?: boolean) => void
  resize: () => void
  off: (eventName: string) => void
  on: (eventName: string, handler: (params: { dataIndex: number }) => void) => void
}

declare global {
  interface Window {
    echarts?: {
      init: (element: HTMLElement) => EChartsInstance
    }
  }
}

let chart: EChartsInstance | null = null
let rpcId = 1
let hasAnalysis = false
let currentAnalysis: SalesAnalysis | null = null
let currentLocale: SupportedLocale = 'en'
let currentLocaleTag = 'en-US'

const pending: Record<string, PendingRequest> = {}
const state: {
  metric: SalesMetric
  groupBy: SalesGroupBy
  year: number
  filters: Record<string, string>
  trail: Breadcrumb[]
} = {
  metric: 'revenue',
  groupBy: 'region',
  year: 2026,
  filters: {},
  trail: []
}

function requiredElement<T extends HTMLElement>(id: string) {
  const element = document.getElementById(id)
  if (!element) {
    throw new Error(`Missing element #${id}`)
  }
  return element as T
}

const appTitleEl = requiredElement<HTMLHeadingElement>('appTitle')
const summaryEl = requiredElement<HTMLDivElement>('summary')
const metricLabelEl = requiredElement<HTMLSpanElement>('metricLabel')
const groupByLabelEl = requiredElement<HTMLSpanElement>('groupByLabel')
const yearLabelEl = requiredElement<HTMLSpanElement>('yearLabel')
const metricEl = requiredElement<HTMLSelectElement>('metric')
const groupByEl = requiredElement<HTMLSelectElement>('groupBy')
const yearEl = requiredElement<HTMLSelectElement>('year')
const resetEl = requiredElement<HTMLButtonElement>('reset')
const breadcrumbsEl = requiredElement<HTMLDivElement>('breadcrumbs')
const revenueLabelEl = requiredElement<HTMLDivElement>('revenueLabel')
const revenueEl = requiredElement<HTMLDivElement>('revenue')
const marginLabelEl = requiredElement<HTMLDivElement>('marginLabel')
const marginEl = requiredElement<HTMLDivElement>('margin')
const ordersLabelEl = requiredElement<HTMLDivElement>('ordersLabel')
const ordersEl = requiredElement<HTMLDivElement>('orders')
const chartEl = requiredElement<HTMLDivElement>('chart')
const hintEl = requiredElement<HTMLDivElement>('hint')
const errorEl = requiredElement<HTMLDivElement>('error')

function post(message: Record<string, unknown>) {
  window.parent.postMessage(message, '*')
}

function request(method: string, params: Record<string, unknown> = {}) {
  const id = rpcId++
  post({ jsonrpc: '2.0', id, method, params })

  return new Promise((resolve, reject) => {
    pending[String(id)] = { resolve, reject }
    window.setTimeout(() => {
      if (pending[String(id)]) {
        delete pending[String(id)]
        reject(new Error(MESSAGES[currentLocale].errors.timeout(method)))
      }
    }, 15000)
  })
}

function notify(method: string, params: Record<string, unknown> = {}) {
  post({ jsonrpc: '2.0', method, params })
}

function showError(error: unknown) {
  const message = error instanceof Error ? error.message : error ? String(error) : ''
  errorEl.style.display = message ? 'block' : 'none'
  errorEl.textContent = message
  notifySize()
}

function formatMoney(value: unknown) {
  return `$${Math.round(Number(value) || 0).toLocaleString(currentLocaleTag)}`
}

function formatOrders(value: unknown) {
  return Math.round(Number(value) || 0).toLocaleString(currentLocaleTag)
}

function metricLabel(metric: SalesMetric) {
  const messages = MESSAGES[currentLocale]
  if (metric === 'margin') return messages.margin
  if (metric === 'orders') return messages.orders
  return messages.revenue
}

function groupLabel(groupBy: SalesGroupBy) {
  const messages = MESSAGES[currentLocale]
  if (groupBy === 'product') return messages.product
  if (groupBy === 'month') return messages.month
  return messages.region
}

function dimensionValueLabel(groupBy: SalesGroupBy, value: string) {
  if (currentLocale !== 'zh') return value

  const labels: Record<SalesGroupBy, Record<string, string>> = {
    region: {
      North: '北区',
      South: '南区',
      East: '东区',
      West: '西区'
    },
    product: {
      Platform: '平台',
      Analytics: '分析',
      Automation: '自动化',
      Support: '支持'
    },
    month: {
      Jan: '1月',
      Feb: '2月',
      Mar: '3月',
      Apr: '4月',
      May: '5月',
      Jun: '6月',
      Jul: '7月',
      Aug: '8月',
      Sep: '9月',
      Oct: '10月',
      Nov: '11月',
      Dec: '12月'
    }
  }

  return labels[groupBy][value] || value
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value)
}

function normalizeLocaleTag(value?: string) {
  const fallback = navigator.language || 'en-US'
  const tag = (value?.trim() || fallback).replace('_', '-')
  return {
    tag,
    locale: tag.toLowerCase().startsWith('zh') ? 'zh' : 'en'
  } satisfies { tag: string; locale: SupportedLocale }
}

function extractHostContext(value: unknown): HostContext {
  if (!isRecord(value)) return {}

  const context = isRecord(value.hostContext)
    ? value.hostContext
    : isRecord(value.context)
      ? value.context
      : undefined
  if (!context) return {}

  return {
    locale: typeof context.locale === 'string' ? context.locale : undefined,
    language: typeof context.language === 'string' ? context.language : undefined,
    direction: typeof context.direction === 'string' ? context.direction : undefined
  }
}

function updateOptionLabel(select: HTMLSelectElement, value: string, label: string) {
  const option = Array.from(select.options).find((item) => item.value === value)
  if (option) {
    option.textContent = label
  }
}

function formatMetricValue(metric: SalesMetric, value: unknown) {
  if (metric === 'orders') {
    return currentLocale === 'zh' ? `${formatOrders(value)} 单` : `${formatOrders(value)} orders`
  }
  return formatMoney(value)
}

function buildLocalizedSummary(analysis: SalesAnalysis) {
  const points = Array.isArray(analysis.points) ? analysis.points : []
  const top = points[0]
  if (!top) {
    return MESSAGES[currentLocale].noMatchingData(analysis.year)
  }

  return MESSAGES[currentLocale].summary({
    metric: metricLabel(analysis.metric),
    groupBy: groupLabel(analysis.groupBy),
    year: analysis.year,
    filters: analysis.filters || {},
    topLabel: dimensionValueLabel(analysis.groupBy, top.label),
    topValue: formatMetricValue(analysis.metric, top.value)
  })
}

function applyLocale(context: HostContext = {}) {
  const normalized = normalizeLocaleTag(context.locale || context.language)
  currentLocale = normalized.locale
  currentLocaleTag = normalized.tag

  document.documentElement.lang = normalized.tag
  document.documentElement.dir = context.direction === 'rtl' ? 'rtl' : 'ltr'

  const messages = MESSAGES[currentLocale]
  document.title = messages.documentTitle
  appTitleEl.textContent = messages.title
  metricLabelEl.textContent = messages.metric
  groupByLabelEl.textContent = messages.groupBy
  yearLabelEl.textContent = messages.year
  resetEl.textContent = messages.reset
  revenueLabelEl.textContent = messages.revenue
  marginLabelEl.textContent = messages.margin
  ordersLabelEl.textContent = messages.orders
  hintEl.textContent = messages.hint

  updateOptionLabel(metricEl, 'revenue', messages.revenue)
  updateOptionLabel(metricEl, 'margin', messages.margin)
  updateOptionLabel(metricEl, 'orders', messages.orders)
  updateOptionLabel(groupByEl, 'region', messages.region)
  updateOptionLabel(groupByEl, 'product', messages.product)
  updateOptionLabel(groupByEl, 'month', messages.month)

  summaryEl.textContent = currentAnalysis ? buildLocalizedSummary(currentAnalysis) : messages.waiting
  renderBreadcrumbs()
  if (currentAnalysis) {
    renderChart(currentAnalysis)
  }
  notifySize()
}

function isSalesAnalysis(value: unknown): value is SalesAnalysis {
  return isRecord(value) && value.kind === 'echarts-sales-analysis' && Array.isArray(value.points)
}

function extractAnalysis(value: unknown): SalesAnalysis | null {
  if (!value) return null
  if (typeof value === 'string') {
    try {
      return extractAnalysis(JSON.parse(value))
    } catch {
      return null
    }
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const nested = extractAnalysis(item)
      if (nested) return nested
    }
    return null
  }
  if (!isRecord(value)) return null
  if (isSalesAnalysis(value)) return value

  return (
    extractAnalysis(value.analysis) ??
    extractAnalysis(value.structuredContent) ??
    extractAnalysis(value.result) ??
    extractAnalysis(value.content)
  )
}

function readCssVariable(name: string, fallback: string) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return value || fallback
}

function getChartTheme() {
  return {
    background: readCssVariable('--mcp-app-color-background', '#ffffff'),
    foreground: readCssVariable('--mcp-app-color-foreground', '#0f172a'),
    muted: readCssVariable('--mcp-app-color-muted-foreground', '#64748b'),
    border: readCssVariable('--mcp-app-color-border', '#dbe3ef'),
    popover: readCssVariable('--mcp-app-color-popover', '#ffffff'),
    popoverForeground: readCssVariable('--mcp-app-color-popover-foreground', '#0f172a'),
    revenueColor: readCssVariable('--sales-chart-revenue', '#2563eb'),
    marginColor: readCssVariable('--sales-chart-margin', '#0891b2'),
    ordersColor: readCssVariable('--sales-chart-orders', '#d97706'),
    fontFamily: readCssVariable(
      '--mcp-app-font-sans',
      'Inter, ui-sans-serif, system-ui, sans-serif'
    )
  }
}

function syncControls(analysis: SalesAnalysis) {
  metricEl.value = analysis.metric
  groupByEl.value = analysis.groupBy
  yearEl.value = String(analysis.year)
}

function applyAnalysis(analysis: SalesAnalysis | null) {
  if (!analysis) return
  if (!Array.isArray(analysis.points)) {
    showError(new Error(MESSAGES[currentLocale].errors.missingPoints))
    return
  }

  hasAnalysis = true
  currentAnalysis = analysis
  state.metric = analysis.metric
  state.groupBy = analysis.groupBy
  state.year = analysis.year
  state.filters = analysis.filters || {}
  showError(null)
  syncControls(analysis)

  summaryEl.textContent = buildLocalizedSummary(analysis)
  revenueEl.textContent = formatMoney(analysis.totals?.revenue)
  marginEl.textContent = formatMoney(analysis.totals?.margin)
  ordersEl.textContent = formatOrders(analysis.totals?.orders)
  renderBreadcrumbs()
  renderChart(analysis)
  notifySize()
}

function renderBreadcrumbs() {
  breadcrumbsEl.innerHTML = ''

  const root = document.createElement('button')
  root.type = 'button'
  root.className = `crumb${state.trail.length ? '' : ' active'}`
  root.textContent = MESSAGES[currentLocale].overview
  root.addEventListener('click', () => {
    state.filters = {}
    state.trail = []
    state.groupBy = (groupByEl.value || 'region') as SalesGroupBy
    refresh()
  })
  breadcrumbsEl.appendChild(root)

  state.trail.forEach((item, index) => {
    const button = document.createElement('button')
    button.type = 'button'
    button.className = `crumb${index === state.trail.length - 1 ? ' active' : ''}`
    button.textContent = `${groupLabel(item.dimension)}: ${dimensionValueLabel(item.dimension, item.label)}`
    button.addEventListener('click', () => {
      state.trail = state.trail.slice(0, index + 1)
      state.filters = {}
      state.trail.forEach((entry) => {
        state.filters[entry.dimension] = entry.value
      })
      state.groupBy = nextGroupBy(state.trail[state.trail.length - 1]?.dimension) || 'month'
      refresh()
    })
    breadcrumbsEl.appendChild(button)
  })
}

function nextGroupBy(current: SalesGroupBy | undefined) {
  const order: SalesGroupBy[] = ['region', 'product', 'month']
  for (const group of order) {
    if (group !== current && !state.filters[group]) {
      return group
    }
  }
  return null
}

function renderChart(analysis: SalesAnalysis) {
  if (!window.echarts) {
    showError(new Error(MESSAGES[currentLocale].errors.echartsLoadFailed))
    return
  }
  if (!chart) {
    chart = window.echarts.init(chartEl)
    window.addEventListener('resize', () => {
      chart?.resize()
      notifySize()
    })
  }

  const points = Array.isArray(analysis.points) ? analysis.points : []
  const labels = points.map((point) => dimensionValueLabel(analysis.groupBy, point.label))
  const values = points.map((point) => point.value)
  const theme = getChartTheme()
  const seriesColor =
    analysis.metric === 'margin'
      ? theme.marginColor
      : analysis.metric === 'orders'
        ? theme.ordersColor
        : theme.revenueColor

  chart.setOption(
    {
      backgroundColor: theme.background,
      color: [seriesColor],
      textStyle: {
        color: theme.foreground,
        fontFamily: theme.fontFamily
      },
      tooltip: {
        trigger: 'axis',
        backgroundColor: theme.popover,
        borderColor: theme.border,
        textStyle: { color: theme.popoverForeground },
        valueFormatter: (value: unknown) => formatMetricValue(analysis.metric, value)
      },
      grid: { left: 48, right: 18, top: 42, bottom: 58 },
      xAxis: {
        type: 'category',
        data: labels,
        axisLine: { lineStyle: { color: theme.border } },
        axisTick: { lineStyle: { color: theme.border } },
        axisLabel: {
          color: theme.muted,
          interval: 0,
          rotate: analysis.groupBy === 'month' ? 0 : 18
        }
      },
      yAxis: {
        type: 'value',
        axisLabel: { color: theme.muted },
        splitLine: { lineStyle: { color: theme.border } }
      },
      series: [
        {
          name: metricLabel(analysis.metric),
          type: analysis.groupBy === 'month' ? 'line' : 'bar',
          smooth: true,
          data: values,
          barMaxWidth: 52,
          itemStyle: {
            color: seriesColor,
            borderRadius: analysis.groupBy === 'month' ? 0 : [6, 6, 0, 0]
          },
          lineStyle: analysis.groupBy === 'month' ? { color: seriesColor, width: 3 } : undefined,
          areaStyle:
            analysis.groupBy === 'month'
              ? { color: seriesColor, opacity: 0.12 }
              : undefined,
          emphasis: {
            itemStyle: {
              color: seriesColor,
              shadowBlur: 10,
              shadowColor: 'rgba(15, 23, 42, 0.18)'
            }
          }
        }
      ],
      title: {
        text: `${metricLabel(analysis.metric)} by ${groupLabel(analysis.groupBy)}`,
        left: 12,
        top: 8,
        textStyle: {
          color: theme.foreground,
          fontSize: 13,
          fontWeight: 600
        }
      }
    },
    true
  )

  chart.off('click')
  chart.on('click', (params) => {
    const point = points[params.dataIndex]
    if (!point) return
    const next = analysis.nextGroupBy || nextGroupBy(analysis.groupBy)
    if (!next) return

    state.filters[analysis.groupBy] = point.key
    state.trail.push({
      dimension: analysis.groupBy,
      value: point.key,
      label: point.label
    })
    state.groupBy = next
    refresh()
  })
  chart.resize()
}

function refresh() {
  showError(null)
  request('tools/call', {
    name: 'echarts_sales_drilldown',
    arguments: {
      metric: state.metric,
      year: Number(state.year),
      groupBy: state.groupBy,
      filters: state.filters
    }
  })
    .then((result) => {
      const analysis = extractAnalysis(result)
      if (!analysis) throw new Error(MESSAGES[currentLocale].errors.missingAnalysis)
      applyAnalysis(analysis)
    })
    .catch(showError)
}

function loadFallbackOverview() {
  if (hasAnalysis) return
  request('tools/call', {
    name: 'echarts_sales_overview',
    arguments: {
      metric: state.metric,
      year: state.year,
      groupBy: state.groupBy
    }
  })
    .then((result) => {
      const analysis = extractAnalysis(result)
      if (analysis) applyAnalysis(analysis)
    })
    .catch(showError)
}

function notifySize() {
  window.setTimeout(() => {
    const height = Math.max(document.body.scrollHeight, document.documentElement.scrollHeight, 460)
    notify('ui/notifications/size-changed', { height })
  }, 0)
}

function handleRpcResponse(message: JsonRpcResponse) {
  if (message.id === undefined || message.id === null) return false

  const item = pending[String(message.id)]
  if (!item) return false

  delete pending[String(message.id)]
  if (message.error) {
    item.reject(new Error(message.error.message || MESSAGES[currentLocale].errors.rpcFailed))
  } else {
    item.resolve(message.result)
  }
  return true
}

function handleNotification(message: JsonRpcNotification) {
  if (message.method === 'ui/notifications/tool-result') {
    const params = isRecord(message.params) ? message.params : {}
    const analysis = extractAnalysis(params) || extractAnalysis(params.result)
    if (analysis) applyAnalysis(analysis)
  }

  if (message.method === 'ui/notifications/tool-input') {
    const params = isRecord(message.params) ? message.params : {}
    const args = isRecord(params.arguments) ? params.arguments : undefined
    if (!args) return
    if (typeof args.metric === 'string') state.metric = args.metric as SalesMetric
    if (typeof args.groupBy === 'string') state.groupBy = args.groupBy as SalesGroupBy
    if (args.year !== undefined) state.year = Number(args.year)
  }
}

window.addEventListener('message', (event) => {
  let message = event.data
  if (typeof message === 'string') {
    try {
      message = JSON.parse(message)
    } catch {
      return
    }
  }
  if (!isRecord(message)) return

  if (handleRpcResponse(message)) return
  handleNotification(message)
})

metricEl.addEventListener('change', (event) => {
  state.metric = (event.target as HTMLSelectElement).value as SalesMetric
  refresh()
})

groupByEl.addEventListener('change', (event) => {
  state.groupBy = (event.target as HTMLSelectElement).value as SalesGroupBy
  state.filters = {}
  state.trail = []
  refresh()
})

yearEl.addEventListener('change', (event) => {
  state.year = Number((event.target as HTMLSelectElement).value)
  state.filters = {}
  state.trail = []
  refresh()
})

resetEl.addEventListener('click', () => {
  state.filters = {}
  state.trail = []
  state.groupBy = 'region'
  refresh()
})

applyLocale()

request('ui/initialize', {
  protocolVersion: '2026-01-26',
  appInfo: {
    name: 'xpert-echarts-sales-dashboard',
    version: '0.0.1'
  },
  appCapabilities: {
    availableDisplayModes: ['inline']
  }
})
  .then((result) => {
    applyLocale(extractHostContext(result))
    notify('ui/notifications/initialized', {})
    notifySize()
    window.setTimeout(loadFallbackOverview, 500)
  })
  .catch(() => {
    loadFallbackOverview()
  })

export {}
