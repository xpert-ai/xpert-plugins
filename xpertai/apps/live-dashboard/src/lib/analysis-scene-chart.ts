import type { AnalyticsValue } from '@xpert-ai/contracts'

/** Static plotting only: no scripts, external resources, HTML labels, source URLs or App sessions. */
export function analysisSceneChart(view: 'bar' | 'line', rows: { label: string; value: number | null }[], unit: string): string {
  const width = 720, height = view === 'bar' ? Math.max(180, rows.length * 34 + 70) : 300
  const left = view === 'bar' ? 175 : 70, right = 90, top = 25, bottom = 45
  const plotWidth = width - left - right, plotHeight = height - top - bottom
  const values = rows.flatMap(row => row.value === null ? [] : [row.value])
  const min = Math.min(0, ...values), upper = Math.max(0, ...values)
  const max = upper === min ? min + 1 : upper, range = max - min
  const x = (value: number) => left + (value - min) / range * plotWidth
  const y = (value: number) => top + (max - value) / range * plotHeight
  const number = (value: number) => new Intl.NumberFormat('en', { maximumFractionDigits: 3, notation: Math.abs(value) >= 1000000 ? 'compact' : 'standard' }).format(value)
  const label = (value: string, max = 18) => xml([...value].slice(0, max).join('') + ([...value].length > max ? '…' : ''))
  const elements: string[] = []
  if (view === 'bar') {
    elements.push(`<line x1="${x(0)}" y1="${top}" x2="${x(0)}" y2="${height - bottom}" stroke="#cbd5e1"/>`)
    rows.forEach((row, index) => {
      const baseline = top + index * 34
      elements.push(`<text x="${left - 12}" y="${baseline + 16}" text-anchor="end">${label(row.label)}</text>`)
      if (row.value === null) return
      elements.push(`<rect x="${Math.min(x(0), x(row.value))}" y="${baseline}" width="${Math.abs(x(row.value) - x(0))}" height="24" rx="3" fill="#4f79bd"/>`)
      elements.push(`<text x="${width - 6}" y="${baseline + 17}" text-anchor="end">${xml(number(row.value))}</text>`)
    })
  } else {
    const position = (index: number) => left + index / Math.max(1, rows.length - 1) * plotWidth
    for (let index = 0; index <= 4; index++) {
      const value = min + index / 4 * range, lineY = y(value)
      elements.push(`<line x1="${left}" y1="${lineY}" x2="${width - right}" y2="${lineY}" stroke="#e2e8f0"/><text x="${left - 10}" y="${lineY + 4}" text-anchor="end">${xml(number(value))}</text>`)
    }
    rows.forEach((row, index) => {
      if (row.value !== null) {
        const previous = rows[index - 1]
        if (previous?.value !== null && previous?.value !== undefined) elements.push(`<line x1="${position(index - 1)}" y1="${y(previous.value)}" x2="${position(index)}" y2="${y(row.value)}" stroke="#4f79bd" stroke-width="2.5"/>`)
        elements.push(`<circle cx="${position(index)}" cy="${y(row.value)}" r="4" fill="#4f79bd"/>`)
      }
      if (index % Math.max(1, Math.ceil(rows.length / 5)) === 0 || index === rows.length - 1) elements.push(`<text x="${position(index)}" y="${height - 18}" text-anchor="middle">${label(row.label, 10)}</text>`)
    })
  }
  elements.push(`<text x="${width - 15}" y="${height - 8}" text-anchor="end">${label(unit, 30)}</text>`)
  // A fixed white plot canvas keeps standalone image labels legible in both light and dark host themes.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img"><rect width="100%" height="100%" rx="8" fill="#fff"/><g fill="#475569" font-family="system-ui,sans-serif" font-size="12">${elements.join('')}</g></svg>`
}

/** Reject unsafe coercion instead of turning identifiers, booleans or imprecise decimals into chart measures. */
export function chartNumber(value: AnalyticsValue, logicalType: string): number | null {
  if (value === null) return null
  if (logicalType === 'float64' && typeof value === 'number' && Number.isFinite(value)) return value
  if (['decimal', 'int64'].includes(logicalType) && typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value)
      && value.replace(/[-.]/g, '').replace(/^0+/, '').length <= 15 && Number.isFinite(Number(value)) && Math.abs(Number(value)) <= Number.MAX_SAFE_INTEGER) return Number(value)
  throw new Error('ANALYSIS_SCENE_NUMERIC_PRECISION: choose a numeric measure representable without precision loss, or use a table.')
}
function xml(value: string) { return value.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[char]!) }
