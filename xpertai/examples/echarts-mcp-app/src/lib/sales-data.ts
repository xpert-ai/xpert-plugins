export const SALES_METRICS = ['revenue', 'margin', 'orders'] as const
export const SALES_GROUPS = ['region', 'product', 'month'] as const
export const SALES_YEARS = [2024, 2025, 2026] as const

export type SalesMetric = (typeof SALES_METRICS)[number]
export type SalesGroupBy = (typeof SALES_GROUPS)[number]

export type SalesFilters = Partial<Record<SalesGroupBy, string>>

export type SalesRow = {
  year: number
  region: string
  product: string
  month: string
  revenue: number
  margin: number
  orders: number
}

export type SalesPoint = {
  key: string
  label: string
  value: number
  revenue: number
  margin: number
  orders: number
  marginRate: number
  rowCount: number
}

export type SalesAnalysis = {
  kind: 'echarts-sales-analysis'
  year: number
  metric: SalesMetric
  groupBy: SalesGroupBy
  filters: SalesFilters
  points: SalesPoint[]
  totals: {
    revenue: number
    margin: number
    orders: number
    marginRate: number
  }
  nextGroupBy: SalesGroupBy | null
  summary: string
}

const REGIONS = ['North', 'South', 'East', 'West']
const PRODUCTS = ['Platform', 'Analytics', 'Automation', 'Support']
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

export function normalizeMetric(value: unknown): SalesMetric {
  return SALES_METRICS.includes(value as SalesMetric) ? (value as SalesMetric) : 'revenue'
}

export function normalizeGroupBy(value: unknown): SalesGroupBy {
  return SALES_GROUPS.includes(value as SalesGroupBy) ? (value as SalesGroupBy) : 'region'
}

export function normalizeYear(value: unknown): number {
  return typeof value === 'number' && SALES_YEARS.includes(value as (typeof SALES_YEARS)[number]) ? value : 2026
}

export function normalizeFilters(value: unknown): SalesFilters {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {}
  }

  const source = value as Record<string, unknown>
  const filters: SalesFilters = {}
  for (const group of SALES_GROUPS) {
    const item = source[group]
    if (typeof item === 'string' && item.trim()) {
      filters[group] = item.trim()
    }
  }
  return filters
}

export function createSalesDataset(): SalesRow[] {
  const rows: SalesRow[] = []
  for (const year of SALES_YEARS) {
    for (const [regionIndex, region] of REGIONS.entries()) {
      for (const [productIndex, product] of PRODUCTS.entries()) {
        for (const [monthIndex, month] of MONTHS.entries()) {
          const seasonality = 1 + Math.sin(((monthIndex + 1) / 12) * Math.PI * 2) * 0.13
          const yearFactor = 1 + (year - 2024) * 0.085
          const regionFactor = 0.9 + regionIndex * 0.075
          const productFactor = 0.88 + productIndex * 0.115
          const base = 68_000 + regionIndex * 8_700 + productIndex * 12_500 + monthIndex * 1_450
          const revenue = Math.round(base * seasonality * yearFactor * regionFactor * productFactor)
          const marginRate = 0.22 + regionIndex * 0.018 + productIndex * 0.023 + ((monthIndex % 4) * 0.006)
          const margin = Math.round(revenue * marginRate)
          const orders = Math.round(revenue / (1_450 + productIndex * 190 + regionIndex * 85))

          rows.push({
            year,
            region,
            product,
            month,
            revenue,
            margin,
            orders
          })
        }
      }
    }
  }
  return rows
}

export const SALES_DATASET = createSalesDataset()

function formatMetric(metric: SalesMetric) {
  if (metric === 'revenue') return 'Revenue'
  if (metric === 'margin') return 'Gross margin'
  return 'Orders'
}

function formatValue(metric: SalesMetric, value: number) {
  if (metric === 'orders') {
    return `${Math.round(value).toLocaleString('en-US')} orders`
  }
  return `$${Math.round(value).toLocaleString('en-US')}`
}

function getNextGroupBy(groupBy: SalesGroupBy, filters: SalesFilters): SalesGroupBy | null {
  const order: SalesGroupBy[] = ['region', 'product', 'month']
  for (const candidate of order) {
    if (candidate !== groupBy && !filters[candidate]) {
      return candidate
    }
  }
  return null
}

function comparePoints(groupBy: SalesGroupBy, metric: SalesMetric) {
  return (a: SalesPoint, b: SalesPoint) => {
    if (groupBy === 'month') {
      return MONTHS.indexOf(a.key) - MONTHS.indexOf(b.key)
    }
    return b[metric] - a[metric]
  }
}

function sumRows(rows: SalesRow[]) {
  return rows.reduce(
    (total, row) => ({
      revenue: total.revenue + row.revenue,
      margin: total.margin + row.margin,
      orders: total.orders + row.orders
    }),
    { revenue: 0, margin: 0, orders: 0 }
  )
}

export function buildSalesAnalysis(input: {
  metric?: unknown
  groupBy?: unknown
  year?: unknown
  filters?: unknown
}): SalesAnalysis {
  const metric = normalizeMetric(input.metric)
  const groupBy = normalizeGroupBy(input.groupBy)
  const year = normalizeYear(input.year)
  const filters = normalizeFilters(input.filters)

  const rows = SALES_DATASET.filter((row) => {
    if (row.year !== year) return false
    for (const [key, value] of Object.entries(filters) as Array<[SalesGroupBy, string]>) {
      if (row[key] !== value) return false
    }
    return true
  })

  const buckets = new Map<string, SalesRow[]>()
  for (const row of rows) {
    const key = row[groupBy]
    buckets.set(key, [...(buckets.get(key) ?? []), row])
  }

  const points = Array.from(buckets.entries())
    .map(([key, bucketRows]) => {
      const totals = sumRows(bucketRows)
      return {
        key,
        label: key,
        value: totals[metric],
        ...totals,
        marginRate: totals.revenue ? totals.margin / totals.revenue : 0,
        rowCount: bucketRows.length
      }
    })
    .sort(comparePoints(groupBy, metric))

  const totals = sumRows(rows)
  const top = points[0]
  const filterText = Object.entries(filters)
    .map(([key, value]) => `${key}=${value}`)
    .join(', ')
  const summary = top
    ? `${formatMetric(metric)} by ${groupBy} for ${year}${filterText ? ` (${filterText})` : ''}. Top segment: ${
        top.label
      } with ${formatValue(metric, top.value)}.`
    : `No matching sales data for ${year}.`

  return {
    kind: 'echarts-sales-analysis',
    year,
    metric,
    groupBy,
    filters,
    points,
    totals: {
      ...totals,
      marginRate: totals.revenue ? totals.margin / totals.revenue : 0
    },
    nextGroupBy: getNextGroupBy(groupBy, filters),
    summary
  }
}
